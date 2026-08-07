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
    const { message, context, history, language } = req.body;

    if (!message || !context) {
      return res.status(400).json({ error: 'Message and context are required.' });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(503).json({ error: 'AI service is not configured on the server.' });
    }

    const groq = new Groq({ apiKey: groqApiKey });

    // Language instruction for multi-lingual responses
    const langInstructions = {
      'hi-IN': 'IMPORTANT: Always respond in Hindi (हिंदी). Keep answers simple and clear.',
      'mr-IN': 'IMPORTANT: Always respond in Marathi (मराठी). Keep answers simple and clear.',
      'en-IN': 'Always respond in English.'
    };
    const langInstruction = langInstructions[language] || langInstructions['en-IN'];

    // Full navigation map so the AI can guide users to any page
    const navMap = `
COMPLETE APP NAVIGATION GUIDE:
- Dashboard: Sidebar → "Dashboard" (top of sidebar menu)
- RD & Savings Passbook: Sidebar → "My Financials" section → expand "My Passbooks" → "RD & Savings Passbook"
- Loan Statement: Sidebar → "My Financials" section → expand "My Passbooks" → "Loan Statement"
- Loan Calculator / Apply for Loan: Sidebar → "My Financials" section → click "Apply for a Loan"
- My Profile: Click the user avatar/name icon in the top-right corner of the header
- Pending Approvals (Admin): Sidebar → "Administration" section → "Pending Approvals"
- Financial Clearances (Admin): Sidebar → "Administration" section → "Financial Clearances"
- Master Journal (Admin): Sidebar → "Administration" section → "Master Journal"
- Society Directory (Admin): Sidebar → "Administration" section → "Society Directory"
- Process New Loans (Admin): Sidebar → "Administration" → expand "Loan Operations" → "Process New Loans"
- Restructure Loans (Admin): Sidebar → "Administration" → expand "Loan Operations" → "Restructure & Adjust"
- Deposits & Withdrawals (Admin): Sidebar → "Administration" → expand "Capital & Dividends" → "Deposits & Withdrawals"
- Year-End Processing (Admin): Sidebar → "Administration" → expand "Capital & Dividends" → "Year-End Processing"
- Master Cashbook (Admin): Sidebar → "Accounting & Ledger" section → "Master Cashbook"
- Bank Reconciliation (Admin): Sidebar → "Accounting & Ledger" section → "Bank Reconciliation"
- Reports Generation (Admin): Sidebar → "Accounting & Ledger" section → "Reports Generation"
- Update Data / Upload CSV (Admin): Sidebar → "System & Data" section → "Update Data"
- System Settings (Admin): Sidebar → "System & Data" section → "System Settings"
`;

    let systemPrompt = '';

    if (context.role === 'member') {
      systemPrompt = `You are a warm, helpful, and professional financial advisor for the Mahadev Society Cooperative (SACCO).
You are speaking directly with member ${context.name} (Vendor No: ${context.vendorNo}).

${langInstruction}

LIVE ACCOUNT DATA:
- Share Capital Balance: Rs.${context.shareBalance.toLocaleString('en-IN')}
- RD Balance: Rs.${context.rdBalance.toLocaleString('en-IN')}
- Monthly RD Contribution: Rs.${context.monthlyRDAmount.toLocaleString('en-IN')}
- Active Loan Sanctioned: Rs.${context.activeLoanAmount.toLocaleString('en-IN')}
- Loan Outstanding: Rs.${context.loanOutstanding.toLocaleString('en-IN')}
- Monthly EMI: Rs.${context.monthlyEMI.toLocaleString('en-IN')}
- Remaining EMIs: ${context.remainingEMIs}
- Max New Loan Eligibility: Rs.${context.maxLoanEligibility.toLocaleString('en-IN')}
- Date of Retirement: ${context.dateOfRetirement}

Recent Transactions:
${context.recentTransactions.map(t => `  [${t.date}] ${t.type} - Rs.${t.amount} (${t.direction})`).join('\n')}

${navMap}

Rules:
1. Use the real account data above. Never make up numbers.
2. When asked about navigation, use the NAVIGATION GUIDE to give clear step-by-step instructions.
3. For loan eligibility, use the 10x share capital rule.
4. Keep responses concise and conversational. No markdown.
5. You are read-only — you cannot change any data.`;
    } else if (context.role === 'admin') {
      systemPrompt = `You are an intelligent administrative assistant for the Mahadev Society Cooperative (SACCO).
You are speaking with admin: ${context.adminName}.

${langInstruction}

LIVE SOCIETY SNAPSHOT:
- Total Approved Members: ${context.totalMembers}
- Pending Member Approvals: ${context.pendingApprovals}
- Pending Loan Applications: ${context.pendingLoanApplications}
- Members with Zero Share Capital: ${context.membersWithNoShares}
- Total Share Capital: Rs.${context.totalShareCapital.toLocaleString('en-IN')}
- Total RD Pool: Rs.${context.totalRDBalance.toLocaleString('en-IN')}
- Total Active Loan Book: Rs.${context.totalActiveLoanAmount.toLocaleString('en-IN')}
- Total Pending Repayments: Rs.${context.totalPendingLoanBalance.toLocaleString('en-IN')}
- Expected Monthly RD Collection: Rs.${context.totalMonthlyRDCollection.toLocaleString('en-IN')}
- Expected Monthly EMI Collection: Rs.${context.totalMonthlyEMICollection.toLocaleString('en-IN')}
- Net Loan Exposure: Rs.${context.netExposure.toLocaleString('en-IN')}

${navMap}

Rules:
1. Provide data-driven, professional administrative insights.
2. Use real figures. Never fabricate numbers.
3. Flag risks: high net exposure, members with no shares, pending backlogs.
4. When asked about navigation, use the NAVIGATION GUIDE to give step-by-step instructions.
5. Keep responses concise. No markdown. You are read-only.`;
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
