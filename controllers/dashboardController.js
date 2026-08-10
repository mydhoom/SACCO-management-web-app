const User = require('../models/User');
const TransactionLog = require('../models/TransactionLog');
const Loan = require('../models/Loan');

// ============================================================
// 1. MAIN DASHBOARD KPI AGGREGATOR
//    Returns all the headline numbers in a single API call.
// ============================================================
exports.getDashboardKPIs = async (req, res) => {
  try {
    // --- Run all aggregations in parallel for speed ---
    const [
      memberStats,
      shareCapitalAgg,
      loanPortfolioAgg,
      rdPoolAgg,
      pendingLoansCount,
      recentTransactions,
      monthlyCollections,
    ] = await Promise.all([

      // 1a. Member counts
      User.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),

      // 1b. Total Share Capital across all approved members
      User.aggregate([
        { $match: { status: 'approved' } },
        {
          $group: {
            _id: null,
            totalShareCapital: { $sum: '$currentShareMoneyTotal' },
            totalDividends: { $sum: '$dividends' },
          }
        }
      ]),

      // 1c. Total Active Loan Portfolio
      User.aggregate([
        { $match: { status: 'approved', pendingLoanBalance: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalPrincipal: { $sum: '$pendingLoanBalance' },
            totalInterest: { $sum: '$pendingLoanInterest' },
            activeLoansCount: { $sum: 1 },
            totalActiveLoanAmount: { $sum: '$activeLoanAmount' },
          }
        }
      ]),

      // 1d. Total RD Pool
      User.aggregate([
        { $match: { status: 'approved' } },
        {
          $group: {
            _id: null,
            totalRDPool: { $sum: '$rdBalance' },
            totalMonthlyRD: { $sum: '$monthlyRDAmount' },
          }
        }
      ]),

      // 1e. Pending loan applications count
      Loan.countDocuments({ status: 'PENDING' }),

      // 1f. Last 10 transactions for the live feed
      TransactionLog.find({ status: 'COMPLETED' })
        .sort({ transactionDate: -1 })
        .limit(10)
        .select('vendorNo memberName category amount entryType transactionDate description transactionId')
        .lean(),

      // 1g. Monthly inflow vs outflow for the last 6 months (for bar chart)
      TransactionLog.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            transactionDate: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 5, 1))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$transactionDate' },
              month: { $month: '$transactionDate' },
            },
            totalCredits: {
              $sum: { $cond: [{ $eq: ['$entryType', 'CREDIT'] }, '$amount', 0] }
            },
            totalDebits: {
              $sum: { $cond: [{ $eq: ['$entryType', 'DEBIT'] }, '$amount', 0] }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
    ]);

    // --- Process member stats ---
    const membersMap = {};
    memberStats.forEach(s => { membersMap[s._id] = s.count; });
    const totalMembers = (membersMap['approved'] || 0) + (membersMap['pending'] || 0) + (membersMap['rejected'] || 0);

    // --- Process share capital ---
    const shareCapital = shareCapitalAgg[0]?.totalShareCapital || 0;
    const totalDividends = shareCapitalAgg[0]?.totalDividends || 0;

    // --- Process loan portfolio ---
    const activeLoanPortfolioValue = loanPortfolioAgg[0]?.totalPrincipal || 0;
    const activeLoanInterest = loanPortfolioAgg[0]?.totalInterest || 0;
    const activeLoansCount = loanPortfolioAgg[0]?.activeLoansCount || 0;

    // --- Process RD pool ---
    const totalRDPool = rdPoolAgg[0]?.totalRDPool || 0;
    const totalMonthlyRD = rdPoolAgg[0]?.totalMonthlyRD || 0;

    // --- Process monthly chart data ---
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartLabels = [];
    const chartCredits = [];
    const chartDebits = [];
    monthlyCollections.forEach(m => {
      chartLabels.push(`${monthNames[m._id.month - 1]} ${m._id.year}`);
      chartCredits.push(Math.round(m.totalCredits));
      chartDebits.push(Math.round(m.totalDebits));
    });

    // --- Build the response ---
    res.status(200).json({
      success: true,
      data: {
        // Member stats
        members: {
          total: totalMembers,
          approved: membersMap['approved'] || 0,
          pending: membersMap['pending'] || 0,
          pendingLoans: pendingLoansCount,
        },
        // Society financial KPIs
        financials: {
          shareCapital: Math.round(shareCapital),
          totalDividends: Math.round(totalDividends),
          rdPool: Math.round(totalRDPool),
          monthlyRDCollection: Math.round(totalMonthlyRD),
          activeLoanPortfolio: Math.round(activeLoanPortfolioValue),
          activeLoanInterest: Math.round(activeLoanInterest),
          activeLoansCount,
          // Derived: Estimated liquid fund
          liquidFund: Math.round(shareCapital + totalRDPool - activeLoanPortfolioValue),
        },
        // Live transaction feed
        recentTransactions,
        // Bar chart data
        cashFlowChart: {
          labels: chartLabels,
          credits: chartCredits,
          debits: chartDebits,
        }
      }
    });

  } catch (error) {
    console.error('Dashboard KPI Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate dashboard data.', error: error.message });
  }
};


// ============================================================
// 2. DEFAULTER DETECTION
//    Members with an active loan but no EMI paid in the last 35 days.
// ============================================================
exports.getDefaulters = async (req, res) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 35); // 35-day window

    // Find all members with an active loan
    const membersWithLoans = await User.find({
      status: 'approved',
      pendingLoanBalance: { $gt: 0 },
      monthlyEmiAmount: { $gt: 0 }
    }).select('vendorNo name pendingLoanBalance monthlyEmiAmount designation circle').lean();

    if (membersWithLoans.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const vendorNos = membersWithLoans.map(m => m.vendorNo);

    // Find members who DID pay EMI in the last 35 days
    const recentEmiPayers = await TransactionLog.distinct('vendorNo', {
      vendorNo: { $in: vendorNos },
      category: 'LOAN_EMI',
      status: 'COMPLETED',
      transactionDate: { $gte: cutoffDate }
    });

    const recentPayerSet = new Set(recentEmiPayers);

    // Defaulters are members with active loans but NOT in the recent payer set
    const defaulters = membersWithLoans.filter(m => !recentPayerSet.has(m.vendorNo));

    res.status(200).json({ success: true, count: defaulters.length, data: defaulters });

  } catch (error) {
    console.error('Defaulter Detection Error:', error);
    res.status(500).json({ success: false, message: 'Failed to detect defaulters.', error: error.message });
  }
};


// ============================================================
// 3. MEMBER PERSONAL DASHBOARD DATA
//    Returns a single member's complete financial snapshot.
// ============================================================
exports.getMemberDashboard = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' });

    // Find user first to get their vendorNo
    const profile = await User.findById(userId).select('-password').lean();
    if (!profile) return res.status(404).json({ message: 'Member not found.' });

    const vendorNo = profile.vendorNo;

    const [loanHistory, shareHistory] = await Promise.all([
      TransactionLog.find({
        vendorNo,
        category: { $in: ['LOAN_EMI', 'LOAN_REPAYMENT', 'LOAN_DISBURSEMENT'] },
        status: 'COMPLETED'
      }).sort({ transactionDate: -1 }).limit(24).lean(),

      TransactionLog.find({
        vendorNo,
        category: { $in: ['SHARE_CAPITAL', 'MONTHLY_THRIFT', 'RECURRING_DEPOSIT', 'DIVIDEND_PAYOUT'] },
        status: 'COMPLETED'
      }).sort({ transactionDate: -1 }).limit(24).lean(),
    ]);

    if (!profile) return res.status(404).json({ message: 'Member not found.' });

    // Calculate EMI repayment progress percentage
    const totalLoan = profile.activeLoanAmount || 0;
    const remaining = profile.pendingLoanBalance || 0;
    const paid = totalLoan - remaining;
    const repaymentProgress = totalLoan > 0 ? Math.round((paid / totalLoan) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        profile,
        loanHistory,
        shareHistory,
        repaymentProgress,
        loanPaid: Math.max(0, paid),
      }
    });

  } catch (error) {
    console.error('Member Dashboard Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load member dashboard.', error: error.message });
  }
};
