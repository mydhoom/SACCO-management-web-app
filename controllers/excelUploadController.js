const xlsx = require('xlsx');
const User = require('../models/User');
const Loan = require('../models/Loan');
const TransactionLog = require('../models/TransactionLog');
const LedgerService = require('../services/LedgerService');
const { v4: uuidv4 } = require("uuid");

exports.uploadHistoricalLoans = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Assuming first sheet
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel sheet is empty.' });
    }

    const results = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      warningCount: 0,
      errors: [],
      warnings: []
    };

    for (const [index, row] of data.entries()) {
      results.totalProcessed++;
      const rowNumber = index + 2; // +1 for 0-index, +1 for header

      try {
        // 1. Support multiple column header variations (vendorNo, Vendor_No, Vendor No, EmpNo, etc.)
        const rawVendorNo = row.vendorNo || row.Vendor_No || row['Vendor No'] || row['vendor_no'] || row['VendorNo'] || row['EMP_NO'] || row['EmpNo'] || row['Emp_No'];
        const vendorNo = rawVendorNo ? String(rawVendorNo).trim() : null;

        const rawLoanAmount = row.loanAmount || row.Loan_Amount || row['Loan Amount'] || row['loan_amount'] || row['Amount'] || row['Principal'] || row['Sanctioned Amount'];
        const loanAmount = Number(String(rawLoanAmount || 0).replace(/₹|,|\s/g, ''));

        const rawInterestRate = row.interestRate || row.Interest_Rate || row['Interest Rate'] || row['interest_rate'] || row['Interest'] || row['ROI'];
        let interestRate = Number(rawInterestRate);
        if (isNaN(interestRate) || interestRate <= 0) {
          interestRate = 10; // Default standard interest rate
        }

        const rawTenure = row.tenure || row.Tenure || row['Tenure (Months)'] || row['Months'] || row['Tenure'];
        let tenure = Number(rawTenure);
        if (isNaN(tenure) || tenure <= 0) {
          tenure = 12; // Default 12 months tenure if missing
          if (vendorNo && loanAmount) {
            results.warnings.push(`Row ${rowNumber} [Vendor ${vendorNo}]: Tenure was missing. System defaulted tenure to 12 months.`);
            results.warningCount++;
          }
        }

        const rawOutstanding = row.currentOutstanding || row.Current_Outstanding || row['Current Outstanding'] || row['Pending_Principal'] || row['Pending Principal'] || row['Outstanding'] || row['Balance Principal'];
        let currentOutstanding = Number(String(rawOutstanding !== undefined && rawOutstanding !== null ? rawOutstanding : '').replace(/₹|,|\s/g, ''));
        
        if (rawOutstanding === undefined || rawOutstanding === null || String(rawOutstanding).trim() === '') {
          currentOutstanding = loanAmount; // Default to full loan amount if missing
          if (vendorNo && loanAmount) {
            results.warnings.push(`Row ${rowNumber} [Vendor ${vendorNo}]: Outstanding Principal was missing. System assumed full loan amount (₹${loanAmount.toLocaleString('en-IN')}).`);
            results.warningCount++;
          }
        }

        // --- EMI AMOUNT READ & SMART AUTO-CALCULATION ---
        const rawEmi = row.emiAmount || row.EMI_Amount || row['EMI Amount'] || row['EMI'] || row['monthlyEmi'] || row['Monthly EMI'];
        let emiAmount = Number(String(rawEmi || 0).replace(/₹|,|\s/g, ''));

        if (!emiAmount || isNaN(emiAmount) || emiAmount <= 0) {
          // Auto-calculate EMI using standard loan reduction formula
          const monthlyRate = (interestRate / 100) / 12;
          if (monthlyRate > 0 && loanAmount > 0 && tenure > 0) {
            emiAmount = Math.round((loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1));
          } else if (loanAmount > 0 && tenure > 0) {
            emiAmount = Math.round(loanAmount / tenure);
          } else {
            emiAmount = 0;
          }

          if (vendorNo && loanAmount) {
            results.warnings.push(`Row ${rowNumber} [Vendor ${vendorNo}]: EMI Amount was missing in Excel. System auto-calculated EMI of ₹${emiAmount.toLocaleString('en-IN')} (based on ₹${loanAmount.toLocaleString('en-IN')} @ ${interestRate}% p.a. for ${tenure} mos).`);
            results.warningCount++;
          }
        }

        const rawDate = row.issueDate || row.Issue_Date || row['Issue Date'] || row['Date'] || row['Sanction Date'];
        let issueDate = new Date();
        if (rawDate) {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) {
            issueDate = parsed;
          }
        }

        // --- VALIDATION ERROR CHECKS FOR MISSING MANDATORY DATA ---
        if (!vendorNo) {
          throw new Error(`Missing mandatory parameter: Vendor No / Employee ID is required.`);
        }
        if (!loanAmount || isNaN(loanAmount) || loanAmount <= 0) {
          throw new Error(`Missing mandatory parameter: Valid Loan Amount is required for Vendor No: ${vendorNo}.`);
        }

        // --- FLEXIBLE USER LOOKUP ---
        let user = await User.findOne({ vendorNo });

        if (!user) {
          const digitsOnly = vendorNo.replace(/\D/g, '');
          if (digitsOnly) {
            user = await User.findOne({
              $or: [
                { vendorNo: digitsOnly },
                { vendorNo: new RegExp(digitsOnly + '$', 'i') }
              ]
            });
          }
        }

        // Auto-create member if not found
        if (!user) {
          user = new User({
            vendorNo: vendorNo,
            name: row.memberName || row.Member_Name || row['Member Name'] || `Member ${vendorNo}`,
            password: 'DefaultPassword123!',
            status: 'approved',
            role: 'member'
          });
          await user.save();
          results.warnings.push(`Row ${rowNumber} [Vendor ${vendorNo}]: Member profile was not found in directory. System auto-created profile for "${user.name}".`);
          results.warningCount++;
        }

        // --- DUPLICATE PREVENTION CHECK ---
        const duplicateLoan = await Loan.findOne({
          memberId: user._id,
          loanAmount: loanAmount,
          startDate: issueDate
        });

        if (duplicateLoan) {
          throw new Error(`Duplicate entry ignored: Loan of ₹${loanAmount.toLocaleString('en-IN')} for Vendor ${vendorNo} on ${issueDate.toISOString().split('T')[0]} already exists.`);
        }

        // 1. Create Historical Loan record
        const existingLoansCount = await Loan.countDocuments({ memberId: user._id });
        const loanId = `${user.vendorNo}-${existingLoansCount + 1}-HIST`;

        const endDate = new Date(issueDate);
        endDate.setMonth(endDate.getMonth() + (isNaN(tenure) ? 12 : tenure));

        const newLoan = new Loan({
          loanId,
          memberId: user._id,
          loanAmount: loanAmount,
          principalPending: currentOutstanding,
          interestRate: interestRate,
          tenure: tenure,
          sharePaymentMethod: 'DEDUCT_FROM_LOAN',
          startDate: issueDate,
          endDate: endDate,
          status: currentOutstanding > 0 ? "ACTIVE" : "CLOSED",
          disbursalDate: issueDate
        });
        await newLoan.save();

        // 2. Create historical ledger entries
        const batchId = `HIST-${uuidv4()}`;
        const exactMemberName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Member';

        const transactionsToLog = [];

        transactionsToLog.push({
          vendorNo: user.vendorNo, 
          memberName: exactMemberName, 
          ledgerFolio: '152', 
          memberId: user._id,
          category: "LOAN_DISBURSEMENT", 
          amount: loanAmount, 
          entryType: "DEBIT", 
          paymentMode: "INTERNAL_TRANSFER",
          transactionId: `HIST-DISB-${uuidv4()}`, 
          status: "COMPLETED", 
          relatedLoanId: newLoan._id, 
          batchId: batchId,
          transactionDate: issueDate,
          description: "Historical Loan Disbursement"
        });

        const totalPrincipalPaid = loanAmount - currentOutstanding;
        if (totalPrincipalPaid > 0) {
          transactionsToLog.push({
            vendorNo: user.vendorNo, 
            memberName: exactMemberName, 
            ledgerFolio: '152', 
            memberId: user._id,
            category: "LOAN_REPAYMENT", 
            amount: totalPrincipalPaid, 
            entryType: "CREDIT", 
            paymentMode: "INTERNAL_TRANSFER",
            transactionId: `HIST-REPAY-${uuidv4()}`, 
            status: "COMPLETED", 
            relatedLoanId: newLoan._id, 
            batchId: batchId,
            transactionDate: new Date(),
            description: "Aggregate Historical Principal Repayment"
          });
        }

        if (transactionsToLog.length > 0) {
          await TransactionLog.insertMany(transactionsToLog);
        }

        // 3. Update User member balances
        user.activeLoanAmount = (user.activeLoanAmount || 0) + (currentOutstanding > 0 ? loanAmount : 0);
        user.pendingLoanBalance = (user.pendingLoanBalance || 0) + currentOutstanding;
        user.monthlyEmiAmount = (user.monthlyEmiAmount || 0) + (currentOutstanding > 0 ? emiAmount : 0);
        await user.save();

        results.successCount++;

      } catch (err) {
        results.errorCount++;
        results.errors.push(`Row ${rowNumber} [${row.vendorNo || 'Unknown'}]: ${err.message}`);
      }
    }

    res.status(200).json({ success: true, results });

  } catch (error) {
    console.error('Excel Upload Error:', error);
    res.status(500).json({ success: false, message: 'Server error during upload.' });
  }
};
