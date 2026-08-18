import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AiAssistant.css';

const apiBase =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:5000';

// =============================================
// COMPLETE APP NAVIGATION MAP (for AI guidance)
// =============================================
const NAV_MAP = `
AVAILABLE PAGES & HOW TO NAVIGATE:
- Dashboard: Click "Dashboard" in the sidebar (top of menu)
- RD & Savings Passbook: Sidebar → "My Financials" section → expand "My Passbooks" → click "RD & Savings Passbook"
- Loan Statement: Sidebar → "My Financials" section → expand "My Passbooks" → click "Loan Statement"
- Loan Calculator / Apply for Loan: Sidebar → "My Financials" section → click "Apply for a Loan"
- My Profile: Click your profile avatar/name in the top-right header area

ADMIN-ONLY PAGES:
- Pending Approvals: Sidebar → "Administration" → "Pending Approvals"
- Financial Clearances: Sidebar → "Administration" → "Financial Clearances"
- Master Journal: Sidebar → "Administration" → "Master Journal"
- Global Share & Savings: Sidebar → "Administration" → "Global Share & Savings"
- Global Active Loans: Sidebar → "Administration" → "Global Active Loans"
- Society Directory (Member List): Sidebar → "Administration" → "Society Directory"
- Process New Loans: Sidebar → "Administration" → expand "Loan Operations" → "Process New Loans"
- Restructure & Adjust Loans: Sidebar → "Administration" → expand "Loan Operations" → "Restructure & Adjust"
- Deposits & Withdrawals: Sidebar → "Administration" → expand "Capital & Dividends" → "Deposits & Withdrawals"
- Dividend & Incentive Engine: Sidebar → "Administration" → expand "Capital & Dividends" → "Dividend & Incentive Engine"
- Year-End Processing: Sidebar → "Administration" → expand "Capital & Dividends" → "Year-End Processing"
- Master Cashbook: Sidebar → "Accounting & Ledger" section → "Master Cashbook"
- Bank Reconciliation: Sidebar → "Accounting & Ledger" section → "Bank Reconciliation"
- Demand Sheet (Payroll): Sidebar → "Accounting & Ledger" section → "Demand Sheet (Payroll)"
- Financial Statements: Sidebar → "Accounting & Ledger" section → "Financial Statements"
- Reports Generation: Sidebar → "Accounting & Ledger" section → "Reports Generation"
- Update Data (CSV Upload): Sidebar → "System & Data" section → "Update Data"
- System Settings: Sidebar → "System & Data" section → "System Settings"
- Database Purge: Sidebar → "System & Data" section → "Database Purge"
`;

// =============================================
// LANGUAGE CONFIGURATIONS
// =============================================
const LANGUAGES = [
  { code: 'en-IN', label: 'English', flag: '🇬🇧', voiceLang: 'en-IN' },
  { code: 'hi-IN', label: 'हिंदी', flag: '🇮🇳', voiceLang: 'hi-IN' },
  { code: 'mr-IN', label: 'मराठी', flag: '🟠', voiceLang: 'mr-IN' },
];

// Suggestion chips per role and language
const SUGGESTIONS = {
  member: {
    'en-IN': ['Account summary', 'Can I take a new loan?', 'How to go to Loan Calculator?', 'Help me plan a savings goal'],
    'hi-IN': ['मेरा खाता सारांश', 'क्या मैं नया लोन ले सकता हूँ?', 'लोन कैलकुलेटर कैसे खोलें?', 'बचत योजना बनाएं'],
    'mr-IN': ['माझे खाते सारांश', 'नवीन कर्ज घेता येईल का?', 'लोन कॅल्क्युलेटर कसा उघडायचा?', 'बचत योजना करा'],
  },
  admin: {
    'en-IN': ['Society overview', 'Total loan exposure?', 'Any pending approvals?', 'How to process a loan?'],
    'hi-IN': ['समाज का अवलोकन', 'कुल ऋण क्या है?', 'कोई लंबित अनुमोदन?', 'लोन कैसे प्रोसेस करें?'],
    'mr-IN': ['समाजाचे विहंगावलोकन', 'एकूण कर्ज किती?', 'प्रलंबित मंजुरी आहे का?', 'कर्ज कसे प्रक्रिया करावे?'],
  },
};

// Language-specific instruction addendum for system prompt
const LANG_INSTRUCTION = {
  'en-IN': 'Always respond in English.',
  'hi-IN': 'हमेशा हिंदी में जवाब दें। अपने जवाब सरल और स्पष्ट रखें।',
  'mr-IN': 'नेहमी मराठीत उत्तर द्या. उत्तरे सोपी आणि स्पष्ट ठेवा.',
};

// =============================================
// INLINE SVG ICONS
// =============================================
const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <circle cx="12" cy="7" r="1" fill="currentColor" />
    <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" />
    <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MicIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const SpeakerIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? 'currentColor' : 'none'} />
    {active ? (
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    ) : (
      <line x1="23" y1="9" x2="17" y2="15" />
    )}
  </svg>
);

// =============================================
// MAIN COMPONENT
// =============================================
export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Language
  const [selectedLang, setSelectedLang] = useState('en-IN');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // TTS on/off
  const [recognitionSupported] = useState(() =>
    typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
  const [ttsSupported] = useState(() =>
    typeof window !== 'undefined' && 'speechSynthesis' in window
  );

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // =============================================
  // VOICE: SPEECH-TO-TEXT
  // =============================================
  const startListening = useCallback(() => {
    if (!recognitionSupported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = selectedLang;
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
    };

    recognitionRef.current = rec;
    rec.start();
  }, [selectedLang, recognitionSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // =============================================
  // VOICE: TEXT-TO-SPEECH
  // =============================================
  const speak = useCallback((text) => {
    if (!ttsSupported || !voiceEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedLang;
    utterance.rate = 0.95;
    utterance.pitch = 1;

    // Try to find a voice matching the selected language
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(selectedLang.split('-')[0]));
    if (matchingVoice) utterance.voice = matchingVoice;

    window.speechSynthesis.speak(utterance);
  }, [ttsSupported, voiceEnabled, selectedLang]);

  // =============================================
  // FETCH CONTEXT
  // =============================================
  const fetchContext = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
    if (!token) { setContextError('Please log in to use the AI Assistant.'); return; }

    setContextLoading(true);
    setContextError(null);

    try {
      const res = await fetch(`${apiBase}/api/ai/context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load context');
      setContext(data.context);

      const greeting =
        data.context.role === 'member'
          ? `Hello, ${data.context.name}! 👋 I'm your Mahadev Society Financial Advisor. I have your live account data ready. You can ask me about your balance, loan eligibility, savings goals, or even how to navigate to any page in the app.`
          : `Hello, ${data.context.adminName}! 👋 I'm your Mahadev Society Admin Assistant. I have a live snapshot of all ${data.context.totalMembers} members. Ask me anything about society finances or how to navigate the system.`;

      setMessages([{ role: 'assistant', content: greeting }]);
    } catch (err) {
      setContextError(err.message || 'Could not connect to AI service.');
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !context && !contextLoading && !contextError) fetchContext();
    if (isOpen) {
      setHasNewMessage(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, context, contextLoading, contextError, fetchContext]);

  // Global listener to trigger AI Assistant from Helpdesk or other pages
  useEffect(() => {
    const handleOpenAi = (e) => {
      setIsOpen(true);
      const query = e.detail?.query;
      if (query) {
        setInput(query);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 350);
      }
    };
    window.addEventListener('openAiAssistantWithQuery', handleOpenAi);
    window.addEventListener('openAiAssistant', handleOpenAi);
    return () => {
      window.removeEventListener('openAiAssistantWithQuery', handleOpenAi);
      window.removeEventListener('openAiAssistant', handleOpenAi);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Speak new AI messages when voice is enabled
  useEffect(() => {
    if (!voiceEnabled || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant') speak(last.content);
  }, [messages, voiceEnabled, speak]);

  // =============================================
  // SEND MESSAGE
  // =============================================
  const sendMessage = async (text) => {
    const messageText = (text || input).trim();
    if (!messageText || isTyping || !context) return;

    setInput('');
    const userMsg = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');

    try {
      const history = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

      const res = await fetch(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageText,
          context,
          history,
          language: selectedLang,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (!isOpen) setHasNewMessage(true);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I ran into an error: ${err.message}. Please try again.` },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const role = context?.role || (localStorage.getItem('userRole') || 'member');
  const suggestions = SUGGESTIONS[role]?.[selectedLang] || SUGGESTIONS.member['en-IN'];
  const currentLang = LANGUAGES.find(l => l.code === selectedLang) || LANGUAGES[0];

  return (
    <>
      {/* Floating Action Button */}
      <button
        className="ai-fab"
        onClick={() => setIsOpen(o => !o)}
        title="Mahadev Society Financial Advisor"
        aria-label="Open AI Assistant"
        id="ai-assistant-fab"
      >
        {hasNewMessage && <span className="ai-badge">1</span>}
        <BotIcon />
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="ai-panel" id="ai-assistant-panel" role="dialog" aria-label="Mahadev Society AI Advisor">

          {/* Header */}
          <div className="ai-panel-header">
            <div className="ai-avatar">🏦</div>
            <div className="ai-panel-header-text">
              <h6>Mahadev Society Advisor</h6>
              <span>
                {role === 'admin' ? '⚙️ Admin Mode — Society Analytics' : '👤 Member Mode — Personal Advisor'}
              </span>
            </div>

            {/* Language Picker */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                className="ai-icon-btn"
                onClick={() => setShowLangMenu(m => !m)}
                title="Change Language"
                aria-label="Change Language"
                id="ai-lang-btn"
              >
                <span style={{ fontSize: 16 }}>{currentLang.flag}</span>
              </button>
              {showLangMenu && (
                <div className="ai-lang-menu">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      className={`ai-lang-option ${selectedLang === lang.code ? 'active' : ''}`}
                      onClick={() => { setSelectedLang(lang.code); setShowLangMenu(false); }}
                    >
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* TTS Toggle */}
            {ttsSupported && (
              <button
                className={`ai-icon-btn ${voiceEnabled ? 'active' : ''}`}
                onClick={() => { setVoiceEnabled(v => !v); window.speechSynthesis.cancel(); }}
                title={voiceEnabled ? 'Mute AI voice' : 'Enable AI voice'}
                aria-label="Toggle voice output"
                id="ai-tts-btn"
              >
                <SpeakerIcon active={voiceEnabled} />
              </button>
            )}

            {/* Close */}
            <button className="ai-close-btn" onClick={() => setIsOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {/* Content */}
          {contextLoading ? (
            <div className="ai-loading-state">
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
              Loading your live account data...
            </div>
          ) : contextError ? (
            <div className="ai-error-state">
              <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
              {contextError}
              <br />
              <button className="ai-retry-btn" onClick={fetchContext}>Retry</button>
            </div>
          ) : (
            <>
              {/* Suggestion chips */}
              {messages.length <= 1 && (
                <div className="ai-suggestions">
                  {suggestions.map(s => (
                    <button key={s} className="ai-suggestion-chip" onClick={() => sendMessage(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="ai-messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`ai-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                    <div className="ai-msg-avatar">{msg.role === 'user' ? '👤' : '🏦'}</div>
                    <div className="ai-bubble">{msg.content}</div>
                  </div>
                ))}
                {isTyping && (
                  <div className="ai-msg bot">
                    <div className="ai-msg-avatar">🏦</div>
                    <div className="ai-typing"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="ai-input-area">
                {/* Voice input button */}
                {recognitionSupported && (
                  <button
                    className={`ai-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={isListening ? stopListening : startListening}
                    title={isListening ? 'Stop listening' : 'Speak your question'}
                    aria-label="Voice input"
                    id="ai-mic-btn"
                  >
                    <MicIcon active={isListening} />
                  </button>
                )}

                <textarea
                  ref={inputRef}
                  className="ai-input"
                  placeholder={
                    selectedLang === 'hi-IN'
                      ? 'अपना प्रश्न यहाँ टाइप करें...'
                      : selectedLang === 'mr-IN'
                      ? 'तुमचा प्रश्न येथे टाइप करा...'
                      : 'Ask me anything about your account...'
                  }
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  id="ai-chat-input"
                />
                <button
                  className="ai-send-btn"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isTyping}
                  aria-label="Send message"
                  id="ai-send-button"
                >
                  <SendIcon />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
