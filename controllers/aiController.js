// controllers/aiController.js
// AI Financial Assistant — Secure Backend Proxy
// Fetches live data from MongoDB and calls Groq. API key never leaves the server.

const Groq = require('groq-sdk');
const User = require('../models/User');
const TransactionLog = require('../models/TransactionLog');
const Loan = require('../models/Loan');

// ============================================================
// 1. GET AI CONTEXT — Builds a data snapshot for the AI
// ============================================================
exports.getAiContext = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    let context = {};

    if (userRole === 'member') {
      const recentTransactions = await TransactionLog.find({ vendorNo: user.vendorNo })
        .sort({ transactionDate: -1 })
        .limit(10)
        .select('category amount entryType transactionDate description');

      const maxLeverageMultiplier = 10;
      const maxLoanEligibility = (user.currentShareMoneyTotal || 0) * maxLeverageMultiplier;

      context = {
        role: 'member',
        name: user.name,
        vendorNo: user.vendorNo,
        designation: user.designation || 'N/A',
        circle: user.circle || 'N/A',
        shareBalance: user.currentShareMoneyTotal || 0,
        rdBalance: user.rdBalance || 0,
        monthlyRDAmount: user.monthlyRDAmount || 0,
        activeLoanAmount: user.activeLoanAmount || 0,
        loanOutstanding: user.pendingLoanBalance || 0,
        monthlyEMI: user.monthlyEmiAmount || 0,
        remainingEMIs: user.remainingEmis || 0,
        maxLoanEligibility: maxLoanEligibility - (user.pendingLoanBalance || 0),
        dateOfRetirement: user.dateOfRetirement
          ? user.dateOfRetirement.toISOString().split('T')[0]
          : 'N/A',
        recentTransactions: recentTransactions.map(t => ({
          date: t.transactionDate
            ? new Date(t.transactionDate).toLocaleDateString('en-IN')
            : 'N/A',
          type: t.category,
          amount: t.amount,
          direction: t.entryType,
          description: t.description
        }))
      };
    } else if (userRole === 'admin') {
      const totalMembers = await User.countDocuments({ role: 'member', status: 'approved' });
      const pendingApprovals = await User.countDocuments({ role: 'member', status: 'pending' });

      const financialAgg = await User.aggregate([
        { $match: { role: 'member', status: 'approved' } },
        {
          $group: {
            _id: null,
            totalShareCapital: { $sum: '$currentShareMoneyTotal' },
            totalRDBalance: { $sum: '$rdBalance' },
            totalActiveLoanAmount: { $sum: '$activeLoanAmount' },
            totalPendingLoanBalance: { $sum: '$pendingLoanBalance' },
            totalMonthlyRDCollection: { $sum: '$monthlyRDAmount' },
            totalMonthlyEMICollection: { $sum: '$monthlyEmiAmount' }
          }
        }
      ]);

      const financials = financialAgg[0] || {};
      const pendingLoanApplications = await Loan.countDocuments({ status: 'pending' }).catch(() => 0);
      const membersWithNoShares = await User.countDocuments({
        role: 'member',
        status: 'approved',
        currentShareMoneyTotal: 0
      });

      context = {
        role: 'admin',
        adminName: user.name,
        totalMembers,
        pendingApprovals,
        pendingLoanApplications,
        membersWithNoShares,
        totalShareCapital: financials.totalShareCapital || 0,
        totalRDBalance: financials.totalRDBalance || 0,
        totalActiveLoanAmount: financials.totalActiveLoanAmount || 0,
        totalPendingLoanBalance: financials.totalPendingLoanBalance || 0,
        totalMonthlyRDCollection: financials.totalMonthlyRDCollection || 0,
        totalMonthlyEMICollection: financials.totalMonthlyEMICollection || 0,
        netExposure:
          (financials.totalPendingLoanBalance || 0) - (financials.totalShareCapital || 0)
      };
    }

    res.json({ success: true, context });
  } catch (error) {
    console.error('AI Context Error:', error);
    res.status(500).json({ error: 'Failed to build AI context. Please try again.' });
  }
};


// ============================================================
// 2. HANDLE AI CHAT — Calls Groq with live context + user message
// ============================================================
exports.handleAiChat = async (req, res) => {
  try {
    const { message, context, history } = req.body;

    if (!message || !context) {
      return res.status(400).json({ error: 'Message and context are required.' });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(503).json({ error: 'AI service is not configured on the server.' });
    }

    const groq = new Groq({ apiKey: groqApiKey });

    let systemPrompt = '';

    if (context.role === 'member') {
      systemPrompt = `You are "SaccoAI", a warm, helpful, and professional financial advisor for the Mahadev Society Cooperative (SACCO).
You are speaking directly with member ${context.name} (Vendor No: ${context.vendorNo}).

Here is their LIVE account data as of today:
- Share Capital Balance: Rs.${context.shareBalance.toLocaleString('en-IN')}
- Recurring Deposit (RD) Balance: Rs.${context.rdBalance.toLocaleString('en-IN')}
- Monthly RD Contribution: Rs.${context.monthlyRDAmount.toLocaleString('en-IN')}
- Active Loan Amount Sanctioned: Rs.${context.activeLoanAmount.toLocaleString('en-IN')}
- Current Loan Outstanding (to pay): Rs.${context.loanOutstanding.toLocaleString('en-IN')}
- Monthly EMI: Rs.${context.monthlyEMI.toLocaleString('en-IN')}
- Remaining EMIs: ${context.remainingEMIs}
- Maximum New Loan Eligibility: Rs.${context.maxLoanEligibility.toLocaleString('en-IN')} (based on 10x share capital)
- Date of Retirement: ${context.dateOfRetirement}

Recent Transactions (last 10):
${context.recentTransactions.map(t => `  [${t.date}] ${t.type} - Rs.${t.amount} (${t.direction})`).join('\n')}

Rules:
1. Be conversational, helpful, and empathetic.
2. Use the real data above to answer account questions. Never make up numbers.
3. For goal planning, make practical calculations using their current balances.
4. If they ask about a loan, use the 10x share capital rule.
5. Keep responses concise and easy to understand. No markdown formatting.
6. You cannot modify any data. You are a read-only advisor.`;
    } else if (context.role === 'admin') {
      systemPrompt = `You are "SaccoAI", an intelligent administrative assistant for the Mahadev Society Cooperative (SACCO).
You are speaking with the admin: ${context.adminName}.

LIVE Society-Wide Financial Snapshot:
- Total Approved Members: ${context.totalMembers}
- Pending Member Approvals: ${context.pendingApprovals}
- Pending Loan Applications: ${context.pendingLoanApplications}
- Members with Zero Share Capital (risk): ${context.membersWithNoShares}
- Total Share Capital (all members): Rs.${context.totalShareCapital.toLocaleString('en-IN')}
- Total RD Pool Balance: Rs.${context.totalRDBalance.toLocaleString('en-IN')}
- Total Active Loan Book: Rs.${context.totalActiveLoanAmount.toLocaleString('en-IN')}
- Total Pending Loan Repayments: Rs.${context.totalPendingLoanBalance.toLocaleString('en-IN')}
- Expected Monthly RD Collection: Rs.${context.totalMonthlyRDCollection.toLocaleString('en-IN')}
- Expected Monthly EMI Collection: Rs.${context.totalMonthlyEMICollection.toLocaleString('en-IN')}
- Net Society Loan Exposure: Rs.${context.netExposure.toLocaleString('en-IN')}

Rules:
1. Provide data-driven, professional administrative insights.
2. Use real figures from the snapshot above — never fabricate numbers.
3. Flag risks: high net exposure, members with no shares, pending approvals backlog.
4. Keep responses concise. No markdown formatting, plain text only.
5. You cannot modify any data. You are a read-only advisor.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 512
    });

    const reply =
      completion.choices[0]?.message?.content ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    res.json({ success: true, reply });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: 'AI service encountered an error. Please try again shortly.' });
  }
};
