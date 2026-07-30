const User = require("../models/User"); 
const TransactionLog = require("../models/TransactionLog");
const { Parser } = require("json2csv");

// ==========================================
// 1. DASHBOARD WIDGET STATS (Your original code)
// ==========================================
exports.generateReport = async (req, res) => {
    try {
        const membersCount = await User.countDocuments(); 

        const totalSavingsData = await TransactionLog.aggregate([
            { $match: { ledgerFolio: "154", status: "COMPLETED" } },
            { 
                $group: { 
                    _id: null, 
                    total: { 
                        $sum: { 
                            $cond: [{ $eq: ["$entryType", "CREDIT"] }, "$amount", { $multiply: ["$amount", -1] }] 
                        } 
                    } 
                } 
            }
        ]);

        const totalLoansData = await TransactionLog.aggregate([
            { $match: { ledgerFolio: "152", status: "COMPLETED" } },
            { 
                $group: { 
                    _id: null, 
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

// ==========================================
// 2. ADVANCED DATE-FILTERED STATS
// ==========================================
exports.generateAdvancedReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const filter = { status: "COMPLETED" };
        if (startDate || endDate) {
            filter.transactionDate = {}; // FIXED: Changed from createdAt
            if (startDate) filter.transactionDate.$gte = new Date(startDate);
            if (endDate) filter.transactionDate.$lte = new Date(endDate);
        }
        
        const membersCount = await User.countDocuments(); 
        
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
        // FIXED: The cutoff error block is now closed properly
        res.status(500).json({ error: error.message });
    }
};

// ==========================================
// 3. EXCEL / CSV EXPORT FUNCTION
// ==========================================
exports.downloadReport = async (req, res) => { 
    try { 
        const { startDate, endDate } = req.query; 
        const filter = { status: "COMPLETED", ledgerFolio: "154" }; // Exporting Savings 
        
        if (startDate || endDate) { 
            filter.transactionDate = {}; // FIXED: Changed from createdAt
            if (startDate) filter.transactionDate.$gte = new Date(startDate); 
            if (endDate) filter.transactionDate.$lte = new Date(endDate); 
        } 
        
        const savingsTransactions = await TransactionLog.find(filter) 
            .populate('memberId', 'name vendorNo') 
            .lean(); 
            
        // Map data for clean CSV output 
        const mappedData = savingsTransactions.map(trx => ({ 
            "Vendor Number": trx.vendorNo || (trx.memberId ? trx.memberId.vendorNo : 'Unknown'), 
            "Name": trx.memberName || (trx.memberId ? trx.memberId.name : 'Unknown'), // FIXED: Pulls direct name
            "Folio": trx.ledgerFolio, 
            "Date": trx.transactionDate ? new Date(trx.transactionDate).toLocaleDateString('en-IN') : 'Unknown', // FIXED: Changed from createdAt
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

// ==========================================
// 4. THE DOUBLE-ENTRY BALANCE SHEET AGGREGATOR
// ==========================================
exports.generateBalanceSheet = async (req, res) => {
    try {
        const { asOfDate } = req.query;
        let matchStage = { status: 'COMPLETED' };
        
        if (asOfDate) {
            matchStage.transactionDate = { $lte: new Date(asOfDate) };
        }

        const folioBalances = await TransactionLog.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$ledgerFolio",
                    totalDebit: {
                        $sum: { $cond: [{ $eq: ["$entryType", "DEBIT"] }, "$amount", 0] }
                    },
                    totalCredit: {
                        $sum: { $cond: [{ $eq: ["$entryType", "CREDIT"] }, "$amount", 0] }
                    }
                }
            }
        ]);

        let assets = { cashAtBank: 0, loanAssets: 0, total: 0 };
        let liabilities = { rdLiabilities: 0, suspense: 0, total: 0 };
        let equity = { shareCapital: 0, retainedEarnings: 0, total: 0 };
        
        let income = { interestIncome: 0, total: 0 };
        let expenses = { total: 0 }; 

        folioBalances.forEach(folio => {
            const { _id, totalDebit, totalCredit } = folio;
            switch (_id) {
                // ASSETS (Normal Balance: DEBIT) -> Calculation: Debit - Credit
                case '101': assets.cashAtBank = totalDebit - totalCredit; break;
                case '152': assets.loanAssets = totalDebit - totalCredit; break;
                // LIABILITIES (Normal Balance: CREDIT) -> Calculation: Credit - Debit
                case '154': liabilities.rdLiabilities = totalCredit - totalDebit; break;
                case '999': liabilities.suspense = totalCredit - totalDebit; break;
                // EQUITY (Normal Balance: CREDIT) -> Calculation: Credit - Debit
                case '155': equity.shareCapital = totalCredit - totalDebit; break;
                // INCOME (Normal Balance: CREDIT) -> Calculation: Credit - Debit
                case '153': 
                    income.interestIncome = totalCredit - totalDebit;
                    income.total += income.interestIncome;
                    break;
            }
        });

        assets.total = assets.cashAtBank + assets.loanAssets;
        liabilities.total = liabilities.rdLiabilities + liabilities.suspense;  
        
        equity.retainedEarnings = income.total - expenses.total;
        equity.total = equity.shareCapital + equity.retainedEarnings;

        assets.total = Math.round(assets.total * 100) / 100;
        liabilities.total = Math.round(liabilities.total * 100) / 100;
        equity.total = Math.round(equity.total * 100) / 100;

        const liabilitiesAndEquity = Math.round((liabilities.total + equity.total) * 100) / 100;
        const isBalanced = assets.total === liabilitiesAndEquity;

        res.status(200).json({
            success: true,
            data: {
                isBalanced,
                timestamp: new Date(),
                equation: {
                    assets: assets.total,
                    liabilitiesAndEquity: liabilitiesAndEquity
                },
                breakdown: {
                    assets,
                    liabilities,
                    equity,
                    income 
                }
            }
        });
    } catch (error) {
        console.error("Balance Sheet Aggregation Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate financial statements." });
    }
};