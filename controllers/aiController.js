// controllers/aiController.js
// AI Financial Assistant — Multi-Provider Secure Backend Proxy
// Priority: GROQ first (free, reliable), Gemini as secondary when GEMINI key is set.
// Set AI_PROVIDER=GROQ or AI_PROVIDER=GEMINI in .env to force a specific provider.

const Groq = require('groq-sdk');
const { GoogleGenAI } = require('@google/genai');
const User = require('../models/User');
const TransactionLog = require('../models/TransactionLog');
const Loan = require('../models/Loan');

// ============================================================
// PROVIDER RESOLVER — GROQ first (reliable free tier), Gemini secondary
// ============================================================
const getActiveProvider = () => {
  const preferred = (process.env.AI_PROVIDER || '').toUpperCase();
  if (preferred === 'GEMINI' && process.env.GEMINI_API_KEY) return 'GEMINI';
  if (preferred === 'GROQ'   && process.env.GROQ_API_KEY)   return 'GROQ';
  // Auto: GROQ first (Gemini free tier quota issues), then Gemini
  if (process.env.GROQ_API_KEY)   return 'GROQ';
  if (process.env.GEMINI_API_KEY) return 'GEMINI';
  return null;
};

// Model lists — tried in order
// Gemini: only models actually available on free tier as of Aug 2026
const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];
const GROQ_MODELS   = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// ============================================================
// SHARED HELPER — try Groq with full model cascade
// ============================================================
const tryGroq = async (messages, options = {}) => {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let lastError;
  for (const model of GROQ_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        messages,
        model,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 512,
        ...(options.response_format ? { response_format: options.response_format } : {})
      });
      const reply = completion.choices[0]?.message?.content || '';
      console.log(`AI: Groq (fallback) responded using model: ${model}`);
      return reply;
    } catch (err) {
      console.warn(`Groq model ${model} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError;
};


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
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    // ---- GROQ (primary — reliable free tier) ----
    if (provider === 'GROQ') {
      reply = await tryGroq(groqMessages, { temperature: 0.7, max_tokens: 512 });

    // ---- GEMINI with automatic cascade to GROQ ----
    } else if (provider === 'GEMINI') {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let geminiSuccess = false;
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
          geminiSuccess = true;
          break;
        } catch (err) {
          console.warn(`Gemini model ${model} failed: ${err.message}`);
        }
      }
      // If ALL Gemini models failed, cascade to Groq automatically
      if (!geminiSuccess) {
        console.warn('All Gemini models failed. Cascading to Groq...');
        reply = await tryGroq(groqMessages, { temperature: 0.7, max_tokens: 512 });
      }
    }

    res.json({
      success: true,
      reply: reply || "I'm sorry, I couldn't generate a response. Please try again.",
      provider
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: `AI service encountered an error: ${error.message}` });
  }
};

// ============================================================
// 3. AI EXCEL MAPPING — Maps uploaded Excel headers to DB schema
// ============================================================
module.exports.handleAiExcelMapping = async (req, res) => {
  try {
    const { headers, sampleRows, targetSchema } = req.body;
    
    if (!headers || !targetSchema) {
      return res.status(400).json({ error: "Missing required fields (headers or targetSchema)." });
    }

    const provider = getActiveProvider();
    if (!provider) {
      return res.status(503).json({ error: "No AI provider is configured on the server." });
    }

    const systemPrompt = `You are a strict data mapping API. 
Your job is to map columns from a user-uploaded Excel file to the system's target schema.
You will receive:
1. Target System Schema (The required fields).
2. Uploaded Excel Headers.
3. Sample Data Rows (to help you infer context).

Return ONLY a valid JSON object representing the mapping. Do not include markdown code blocks like \`\`\`json. 
The keys must be the Target System Schema fields.
The values must be the matching Uploaded Excel Header string exactly as provided, or null if no match is found.
Example Output:
{
  "Vendor_No": "Emp ID",
  "Full_Name": "Employee Name",
  "Opening_Share_Balance": "Share Amount"
}`;

    const userPrompt = `
TARGET SCHEMA FIELDS:
${JSON.stringify(targetSchema)}

UPLOADED EXCEL HEADERS:
${JSON.stringify(headers)}

SAMPLE ROWS (first 3):
${JSON.stringify(sampleRows)}

Please map the UPLOADED EXCEL HEADERS to the TARGET SCHEMA FIELDS.`;

    let reply = '';

    const mappingMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // ---- GROQ (primary) ----
    if (provider === 'GROQ') {
      reply = await tryGroq(mappingMessages, { temperature: 0.1, response_format: { type: 'json_object' } });

    // ---- GEMINI with cascade to GROQ ----
    } else if (provider === 'GEMINI') {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let geminiSuccess = false;
      for (const model of GEMINI_MODELS) {
        try {
          const chat = ai.chats.create({
            model,
            config: { 
              systemInstruction: systemPrompt,
              responseMimeType: "application/json"
            }
          });
          const response = await chat.sendMessage({ message: userPrompt });
          reply = response.text || '';
          console.log(`AI Mapping: Gemini responded using model: ${model}`);
          geminiSuccess = true;
          break;
        } catch (err) {
          console.warn(`Gemini model ${model} failed for mapping: ${err.message}`);
        }
      }
      // Cascade to Groq if Gemini fails
      if (!geminiSuccess) {
        console.warn('All Gemini models failed for mapping. Cascading to Groq...');
        reply = await tryGroq(mappingMessages, { temperature: 0.1, response_format: { type: 'json_object' } });
      }
    }

    // Robust JSON extraction to handle any conversational text wrapping
    let extractedJson = reply;
    let jsonMatch = reply.match(/```json([\s\S]*?)```/);
    if (jsonMatch) {
      extractedJson = jsonMatch[1].trim();
    } else {
      jsonMatch = reply.match(/```([\s\S]*?)```/);
      if (jsonMatch) {
        extractedJson = jsonMatch[1].trim();
      } else {
        const firstBrace = reply.indexOf('{');
        const lastBrace = reply.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          extractedJson = reply.substring(firstBrace, lastBrace + 1);
        }
      }
    }

    const mapping = JSON.parse(extractedJson);

    res.json({
      success: true,
      mapping,
      provider
    });

  } catch (error) {
    console.error('AI Mapping Error:', error);
    res.status(500).json({ error: `AI Mapping failed (${getActiveProvider()}): ${error.message}` });
  }
};

// ============================================================
// 4. AI ID CARD SCANNER — Reads Indian ID Cards (Aadhaar, PAN, HPSEBL)
// ============================================================
module.exports.handleScanIdCard = async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 data." });
    }

    // Clean base64 data prefix if present (e.g. data:image/png;base64,...)
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `You are an expert OCR and document data extractor for Indian Identity Cards and Departmental ID Cards (Aadhaar Card, PAN Card, HPSEBL Departmental Employee ID Card, Voter ID, Driving Licence).
Carefully inspect the provided ID card image and extract all details with 100% precision.

Return ONLY a valid JSON object matching this schema:
{
  "cardType": "AADHAAR" | "PAN" | "VOTER_ID" | "DRIVING_LICENCE" | "HPSEBL_DEPT" | "OTHER",
  "name": "Cardholder full name in English (e.g. Kapil Thakur)",
  "fatherName": "Father's or spouse's name if written, otherwise empty string",
  "dob": "Date of birth in DD/MM/YYYY or YYYY format (e.g. 1980)",
  "gender": "Male" | "Female" | "Other" | "",
  "aadhaarNo": "12-digit Aadhaar Number with space formatting (e.g. 2494 2221 0651), or empty string if not Aadhaar",
  "panNo": "10-character PAN number (e.g. ABCDE1234F) or empty string",
  "voterIdNo": "Voter ID number or empty string",
  "employeeNo": "Departmental / HPSEBL Employee or Vendor number or empty string",
  "designation": "Job title / Designation (e.g. Foreman, Junior Engineer, Lineman) or empty string",
  "circle": "Work circle or empty string",
  "division": "Work division or empty string",
  "address": "Address or empty string",
  "bloodGroup": "Blood group if written or empty string"
}`;

    let reply = '';

    // 1. Try Gemini Vision models (gemini-1.5-flash, gemini-2.5-flash, gemini-2.0-flash)
    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const geminiModels = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

      for (const m of geminiModels) {
        if (reply) break;
        try {
          const response = await ai.models.generateContent({
            model: m,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: cleanBase64
                    }
                  }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });
          reply = response.text || '';
          if (reply) {
            console.log(`AI OCR: Gemini Vision (${m}) successfully parsed ID card`);
            break;
          }
        } catch (geminiErr) {
          console.warn(`Gemini vision (${m}) error:`, geminiErr.message);
        }
      }
    }

    // 2. Try Groq Vision (llama-3.2-11b-vision-preview) if available
    if (!reply && process.env.GROQ_API_KEY) {
      try {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const completion = await groq.chat.completions.create({
          model: "llama-3.2-11b-vision-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${cleanBase64}`
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        });
        reply = completion.choices[0]?.message?.content || '';
        if (reply) console.log('AI OCR: Groq Vision successfully parsed ID card');
      } catch (groqErr) {
        console.warn('Groq vision error:', groqErr.message);
      }
    }

    // 3. Try OpenAI Vision (gpt-4o-mini) as fallback
    if (!reply && process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${cleanBase64}`
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        });
        reply = completion.choices[0]?.message?.content || '';
        if (reply) console.log('AI OCR: OpenAI Vision successfully parsed ID card');
      } catch (openAiErr) {
        console.warn('OpenAI vision error:', openAiErr.message);
      }
    }

    if (!reply) {
      throw new Error('All AI vision providers failed to parse the image.');
    }

    // Parse JSON
    let extractedJson = reply;
    let jsonMatch = reply.match(/```json([\s\S]*?)```/) || reply.match(/```([\s\S]*?)```/);
    if (jsonMatch) {
      extractedJson = jsonMatch[1].trim();
    } else {
      const firstBrace = reply.indexOf('{');
      const lastBrace = reply.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        extractedJson = reply.substring(firstBrace, lastBrace + 1);
      }
    }

    const parsedData = JSON.parse(extractedJson);
    res.json({
      success: true,
      data: parsedData,
      source: 'AI_VISION'
    });

  } catch (error) {
    console.error('AI ID Card Scan Error:', error);
    res.status(500).json({ error: `AI ID Scan failed: ${error.message}` });
  }
};

module.exports.getAiContext = module.exports.getAiContext || getAiContext;
module.exports.handleAiChat = module.exports.handleAiChat || handleAiChat;
