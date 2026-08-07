// controllers/aiController.js
// AI Financial Assistant — Multi-Provider Secure Backend Proxy
// Priority: GEMINI (2.5-flash → 1.5-flash) → GROQ (llama-3.3-70b → llama-3.1-8b)
// Set AI_PROVIDER=GEMINI or AI_PROVIDER=GROQ in .env to force a specific provider.

const Groq = require('groq-sdk');
const { GoogleGenAI } = require('@google/genai');
const User = require('../models/User');
const TransactionLog = require('../models/TransactionLog');
const Loan = require('../models/Loan');

// ============================================================
// PROVIDER RESOLVER — Gemini first, then Groq as fallback
// ============================================================
const getActiveProvider = () => {
  const preferred = (process.env.AI_PROVIDER || '').toUpperCase();
  // If a preference is set, honour it (if that key exists)
  if (preferred === 'GEMINI' && process.env.GEMINI_API_KEY) return 'GEMINI';
  if (preferred === 'GROQ'   && process.env.GROQ_API_KEY)   return 'GROQ';
  // Auto-fallback: Gemini first, then Groq
  if (process.env.GEMINI_API_KEY) return 'GEMINI';
  if (process.env.GROQ_API_KEY)   return 'GROQ';
  return null;
};

// Model lists — tried in order (high → low)
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const GROQ_MODELS   = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];


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
// 2. HANDLE AI CHAT — Multi-provider: Groq, Gemini, or OpenAI
// Set AI_PROVIDER=GEMINI (or GROQ / OPENAI) in your .env to choose.
// ============================================================
exports.handleAiChat = async (req, res) => {
  try {
    const { message, context, history, language } = req.body;

    if (!message || !context) {
      return res.status(400).json({ error: 'Message and context are required.' });
    }

    const provider = getActiveProvider();
    if (!provider) {
      return res.status(503).json({ error: 'No AI provider is configured. Please add GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY to your .env file.' });
    }

    // Language instruction
    const langInstructions = {
      'hi-IN': 'IMPORTANT: Always respond in Hindi (\u0939\u093f\u0902\u0926\u0940). Keep answers simple and clear.',
      'mr-IN': 'IMPORTANT: Always respond in Marathi (\u092e\u0930\u093e\u0920\u0940). Keep answers simple and clear.',
      'en-IN': 'Always respond in English.'
    };
    const langInstruction = langInstructions[language] || langInstructions['en-IN'];

    // Navigation map
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

    // Build system prompt
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

    let reply = '';

    // ---- GEMINI (tries models high → low) ----
    if (provider === 'GEMINI') {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let lastError;
      for (const model of GEMINI_MODELS) {
        try {
          const geminiHistory = (history || []).map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }]
          }));
          const chat = ai.chats.create({
            model,
            config: { systemInstruction: systemPrompt },
            history: geminiHistory
          });
          const response = await chat.sendMessage({ message });
          reply = response.text || '';
          console.log(`AI: Gemini responded using model: ${model}`);
          break; // Success — stop trying
        } catch (err) {
          console.warn(`Gemini model ${model} failed: ${err.message}`);
          lastError = err;
        }
      }
      if (!reply) throw lastError; // All Gemini models failed → bubble up

    // ---- GROQ (tries models high → low) ----
    } else if (provider === 'GROQ') {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ];
      let lastError;
      for (const model of GROQ_MODELS) {
        try {
          const completion = await groq.chat.completions.create({
            messages,
            model,
            temperature: 0.7,
            max_tokens: 512
          });
          reply = completion.choices[0]?.message?.content || '';
          console.log(`AI: Groq responded using model: ${model}`);
          break; // Success — stop trying
        } catch (err) {
          console.warn(`Groq model ${model} failed: ${err.message}`);
          lastError = err;
        }
      }
      if (!reply) throw lastError; // All Groq models failed → bubble up
    }

    res.json({
      success: true,
      reply: reply || "I'm sorry, I couldn't generate a response. Please try again.",
      provider
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: `AI service (${getActiveProvider()}) encountered an error: ${error.message}` });
  }
};
