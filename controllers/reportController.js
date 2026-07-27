const User = require("../models/User"); // Swapped Member for User based on previous architectural fix
const TransactionLog = require("../models/TransactionLog");
const { Parser } = require("json2csv");

exports.generateReport = async (req, res) => {
  try {
    const membersCount = await User.countDocuments(); // Count active users

    // 1. Calculate Total Savings (Folio 154 - Recurring Deposits)
    const totalSavingsData = await TransactionLog.aggregate([
      { $match: { ledgerFolio: "154", status: "COMPLETED" } },
      { 
        $group: { 
          _id: null, 
          // Credits increase savings, Debits decrease savings
          total: { 
            $sum: { 
              $cond: [{ $eq: ["$entryType", "CREDIT"] }, "$amount", { $multiply: ["$amount", -1] }] 
            } 
          } 
        } 
      }
    ]);

    // 2. Calculate Total Active Loans Outstanding (Folio 152)
    const totalLoansData = await TransactionLog.aggregate([
      { $match: { ledgerFolio: "152", status: "COMPLETED" } },
      { 
        $group: { 
          _id: null, 
          // Debits increase loan balance (money given), Credits decrease balance (EMI paid)
          total: { 
            $sum: { 
              $cond: [{ $eq: ["$entryType", "DEBIT"] }, "$amount", { $multiply: ["$amount", -1] }] 
            } 
          } 
        } 
      }
    ]);

    const report = {
      membersCount,
      totalSavings: totalSavingsData[0]?.total || 0,
      totalLoans: totalLoansData[0]?.total || 0,
    };

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.generateAdvancedReport = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
  
      // Build date filter
      const filter = { status: "COMPLETED" };
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
  
      const membersCount = await User.countDocuments(); // Usually you want total members, not date filtered
      
      // 1. Filtered Total Savings (Folio 154)
      const savingsFilter = { ...filter, ledgerFolio: "154" };
      const totalSavingsData = await TransactionLog.aggregate([
        { $match: savingsFilter },
        { 
          $group: { 
            _id: null, 
            total: { 
              $sum: { 
                $cond: [{ $eq: ["$entryType", "CREDIT"] }, "$amount", { $multiply: ["$amount", -1] }] 
              } 
            } 
          } 
        },
      ]);
      
      // 2. Filtered Total Loans (Folio 152)
      const loansFilter = { ...filter, ledgerFolio: "152" };
      const totalLoansData = await TransactionLog.aggregate([
        { $match: loansFilter },
        { 
          $group: { 
            _id: null, 
            total: { 
              $sum: { 
                $cond: [{ $eq: ["$entryType", "DEBIT"] }, "$amount", { $multiply: ["$amount", -1] }] 
              } 
            } 
          } 
        },
      ]);
  
      const report = {
        membersCount,
        totalSavings: totalSavingsData[0]?.total || 0,
        totalLoans: totalLoansData[0]?.total || 0,
      };
  
      res.status(200).json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

exports.downloadReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = { status: "COMPLETED", ledgerFolio: "154" }; // Exporting Savings
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const savingsTransactions = await TransactionLog.find(filter)
      .populate('memberId', 'name vendorNo')
      .lean(); // Faster for CSV export

    // Map data for clean CSV output
    const mappedData = savingsTransactions.map(trx => ({
      "Vendor Number": trx.vendorNo || (trx.memberId ? trx.memberId.vendorNo : 'Unknown'),
      "Name": trx.memberId ? trx.memberId.name : 'Unknown',
      "Folio": trx.ledgerFolio,
      "Date": trx.createdAt.toLocaleDateString('en-IN'),
      "Type": trx.entryType,
      "Amount (Rs)": trx.amount,
      "Description": trx.description
    }));

    if (mappedData.length === 0) {
       return res.status(404).json({ message: "No transactions found for this period." });
    }

    const fields = ["Vendor Number", "Name", "Folio", "Date", "Type", "Amount (Rs)", "Description"];
    const parser = new Parser({ fields });
    const csv = parser.parse(mappedData);

    res.header("Content-Type", "text/csv");
    res.attachment(`savings-report-${startDate || 'all'}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};