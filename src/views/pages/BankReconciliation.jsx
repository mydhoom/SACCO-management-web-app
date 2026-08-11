import React, { useState, useEffect } from 'react';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

// AI API Keys - Injected automatically by the environment
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY || '';
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const BankReconciliation = () => {
  const [financialYear, setFinancialYear] = useState('2023-2024');
  const [month, setMonth] = useState('April');
  const [reportScope, setReportScope] = useState('MONTH'); // 'MONTH' or 'YEAR'
  const [viewMode, setViewMode] = useState('CHECKING'); 
  const [savedStatement, setSavedStatement] = useState(null); 
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [file, setFile] = useState(null);
  const [processingMode, setProcessingMode] = useState('STANDARD');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedMatched, setSelectedMatched] = useState([]);
  const [selectedSuspense, setSelectedSuspense] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // --- AI INSIGHTS STATE ---
  const [aiInsights, setAiInsights] = useState('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  const GLOBAL_BACKEND_URL = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 
    (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) || 
    'http://localhost:5000';

  const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  const years = ['2023-2024', '2024-2025', '2025-2026', '2026-2027'];

  const handleCheckPeriod = async () => {
    setLoading(true);
    setFeedback({ type: '', message: '' });
    setResults(null);
    setFile(null);
    setAiInsights('');
    
    try {
      let endpoint = `${GLOBAL_BACKEND_URL}/api/reconciliation/period?financialYear=${financialYear}&month=${month}`;
      if (reportScope === 'YEAR') {
        endpoint = `${GLOBAL_BACKEND_URL}/api/reconciliation/yearly?financialYear=${financialYear}`;
      }

      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success && data.data) {
        setSavedStatement(data.data);
        setResults({
          metadata: { 
            bankName: data.data.bankName, 
            accountNo: data.data.accountNumber, 
            statementPeriod: data.data.statementPeriod 
          },
          matched: data.data.matchedTransactions || [],
          suspense: data.data.suspenseEntries || [],
          trueClosingBalance: data.data.closingBankBalance || 0
        });
        setViewMode('SUMMARY'); 
      } else {
        setSavedStatement(null);
        if (reportScope === 'YEAR') {
          setViewMode('SUMMARY');
          setFeedback({ type: 'info', message: `No consolidated data found for Financial Year ${financialYear}. Please reconcile individual months first.` });
        } else {
          setViewMode('UPLOAD'); 
          setFeedback({ type: 'info', message: `No statement found for ${month} ${financialYear}. Please upload a statement.` });
        }
      }
    } catch (error) {
      setFeedback({ type: 'error', message: 'Failed to connect to the database.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { handleCheckPeriod(); }, [reportScope]);

  // --- AI INTEGRATION LOGIC ---
  const handleGenerateInsights = async () => {
    if (!groqApiKey && !geminiApiKey) {
      setFeedback({ type: 'error', message: 'AI Insights are not configured. Please add an API key (Groq or Gemini) to the .env file.' });
      return;
    }

    setIsGeneratingInsights(true);
    setAiInsights('');
    
    try {
      let contextData = "";
      
      if (viewMode === 'SUMMARY' && savedStatement) {
         contextData = JSON.stringify({
           scope: reportScope,
           period: `${month} ${financialYear}`,
           cashBookBalance: savedStatement.brsSummary?.systemCashBookBalance || 0,
           bankBalance: savedStatement.closingBankBalance || 0,
           unidentifiedDeposits: savedStatement.totalUnidentifiedDeposits || 0,
           unclearedPayments: savedStatement.brsSummary?.totalUnclearedPayments || 0,
           bankCharges: savedStatement.totalBankCharges || 0
         });
      } else if (viewMode === 'DETAILS' && results) {
         contextData = JSON.stringify({
           matchedTransactionsCount: results.matched?.length || 0,
           suspenseTransactionsCount: results.suspense?.length || 0,
           suspenseSample: results.suspense?.slice(0, 10) || [] 
         });
      } else {
         setFeedback({ type: 'warning', message: 'No statement data available to analyze yet.' });
         setIsGeneratingInsights(false);
         return;
      }

      const promptText = `You are an expert financial auditor for a Cooperative Society (SACCO). Analyze this Bank Reconciliation Statement data context.
            Context Data: ${contextData}
            Provide a brief, professional 3-sentence summary pointing out any anomalies (like high suspense items, large uncleared balances, or bank charges) and offer a recommended next step for the admin. Keep it concise, clear, and text-only without markdown.`;

      const systemPrompt = "You are a financial auditor. Provide brief, actionable, and professional insights based on reconciliation data. Output plain text only.";
      
      let insightsText = "";

      if (groqApiKey) {
        const groq = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
        const response = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText }
          ],
          model: 'llama-3.1-8b-instant',
        });
        insightsText = response.choices[0]?.message?.content;
      } else if (geminiApiKey) {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptText,
          config: {
            systemInstruction: systemPrompt
          }
        });
        insightsText = response.text;
      }

      setAiInsights(insightsText || "I couldn't generate an audit report at this time.");
    } catch (error) {
      console.error("Error generating insights:", error);
      setFeedback({ type: 'error', message: 'Could not connect to the AI Auditor. Please try again later.' });
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setFeedback({ type: '', message: '' });
    if (selectedFile.type === 'application/pdf') setProcessingMode('AI');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setFeedback({ type: 'error', message: "Please select a file first." });

    setLoading(true);
    setResults(null);
    setSavedStatement(null);
    setFeedback({ type: '', message: '' });
    setSelectedMatched([]);
    setSelectedSuspense([]);
    setSortConfig({ key: null, direction: 'asc' });

    const formData = new FormData();
    formData.append('statementFile', file);
    formData.append('processingMode', processingMode);
    formData.append('financialYear', financialYear); 
    formData.append('month', month);

    try {
      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/reconciliation/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data.data); 
        setSelectedMatched(data.data.matched?.map(item => item.systemTransactionId) || []);
        setSelectedSuspense(data.data.suspense?.map((_, idx) => idx) || []); 
        setViewMode('DETAILS'); 
      } else {
        setFeedback({ type: 'error', message: data.message || "Failed to process statement." });
      }
    } catch (error) {
      setFeedback({ type: 'error', message: "Server error during upload." });
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // DELETE FUNCTION TO RESET A MONTH
  // ==========================================
  const handleDeleteBRS = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete the BRS for ${month} ${financialYear}? You will need to re-upload the statement.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/reconciliation/period?financialYear=${financialYear}&month=${month}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSavedStatement(null);
        setResults(null);
        setFile(null);
        setViewMode('UPLOAD'); 
        setFeedback({ type: 'success', message: `🗑️ Successfully deleted ${month} ${financialYear}. You can now upload a fresh statement.` });
      } else {
        setFeedback({ type: 'error', message: data.message || "Failed to delete BRS." });
      }
    } catch (error) {
      setFeedback({ type: 'error', message: "Server error during deletion." });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount || 0);

  const totalDebit = results?.suspense?.reduce((sum, item) => sum + (Number(item.debit) || 0), 0) || 0;
  const totalCredit = results?.suspense?.reduce((sum, item) => sum + (Number(item.credit) || 0), 0) || 0;
  const closingBalance = results?.trueClosingBalance || 0;

  const handleSaveBRS = async () => {
    if (!results) return;
    setLoading(true);
    setFeedback({ type: '', message: '' });

    try {
      const payload = {
        financialYear,
        month,
        metadata: results.metadata,
        matched: results.matched, 
        suspense: results.suspense, 
        closingBalance: closingBalance 
      };

      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/reconciliation/save-brs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        setSavedStatement(data.data);
        setViewMode('SUMMARY'); 
        setFeedback({ type: 'success', message: `✅ Bank Reconciliation successfully locked for ${month} ${financialYear}.` });
      } else {
        setFeedback({ type: 'error', message: data.message });
      }
    } catch (error) {
      setFeedback({ type: 'error', message: "Server error generating BRS." });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPDF = () => window.print();

  const exportToCSV = () => {
    const isSummary = viewMode === 'SUMMARY';
    const dataToExport = isSummary ? savedStatement?.suspenseEntries : results?.suspense;
    
    if (!dataToExport) return;

    let csv = `BANK TRANSACTIONS EXTRACT\n`;
    csv += `Scope:,${reportScope === 'YEAR' ? 'Full FY ' + financialYear : month + ' ' + financialYear}\n\n`;
    
    if (isSummary && savedStatement?.brsSummary) {
      const {
        brsSummary,
        closingBankBalance,
        totalUnidentifiedDeposits,
        totalInterestCredited,
        totalBankCharges,
        totalDirectPayments,
        totalDirectBankDebits,
      } = savedStatement;
      csv += `Sl. No.,Particulars,Add (₹),Less (₹),Amount (₹)\n`;
      csv += `1,Balance as per Cash Book,, ,${brsSummary.systemCashBookBalance}\n`;
      csv += `2,Add: Cheques issued/drawn but not yet presented for payment to the bank,${brsSummary.totalUnclearedPayments || 0},,\n`;
      csv += `3,Add: Amounts directly deposited by members/tenants into the bank account not yet recorded in the Cash Book,${totalUnidentifiedDeposits || 0},,\n`;
      csv += `4,Add: Interest allowed/credited by the bank directly,${totalInterestCredited || 0},,\n`;
      csv += `5,Less: Cheques/maintenance payments deposited into the bank but not yet cleared/credited,,${brsSummary.totalUnclearedReceipts || 0},\n`;
      csv += `6,Less: Bank charges, commission, or locker rent debited in the passbook only,,${totalBankCharges || 0},\n`;
      csv += `7,Less: Direct payments/standing instructions (ECS/NEFT) debited by bank not recorded in Cash Book,,${totalDirectPayments || 0},\n`;
      csv += `8,Balance as per Bank Statement,, ,${closingBankBalance}\n\n`;
    }

    csv += `UNIDENTIFIED FUNDS & WITHDRAWALS\n`;
    csv += `Date,Description,Reference,Debit (Out),Credit (In),Balance,Type\n`;
    
    dataToExport.forEach(item => {
      const desc = `"${(item.bankDescription || '').replace(/"/g, '""')}"`;
      const ref = `"${(item.referenceNumber || '').replace(/"/g, '""')}"`;
      csv += `${item.bankDate || ''},${desc},${ref},${item.debit || 0},${item.credit || 0},${item.balance || 0},${item.suggestedType || item.status || ''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Bank_Statement_Extract_${reportScope}_${financialYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortedSuspenseData = () => {
    if (!results || !results.suspense) return [];
    const sortableData = results.suspense.map((item, index) => ({ ...item, originalIndex: index }));
    if (!sortConfig.key) return sortableData;
    return sortableData.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (sortConfig.key === 'bankDate') {
        const parseDate = (d) => {
          if(!d || !d.includes('/')) return 0;
          const parts = d.split('/');
          return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        };
        aVal = parseDate(aVal);
        bVal = parseDate(bVal);
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const SortIndicator = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span className="text-muted ms-1 opacity-25">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ms-1">↑</span> : <span className="ms-1">↓</span>;
  };

  const toggleSelectAllMatched = () => setSelectedMatched(selectedMatched.length === results.matched.length ? [] : results.matched.map(item => item.systemTransactionId));
  const toggleSelectMatchedItem = (id) => setSelectedMatched(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  const toggleSelectAllSuspense = () => setSelectedSuspense(selectedSuspense.length === results.suspense.length ? [] : results.suspense.map((_, idx) => idx));
  const toggleSelectSuspenseItem = (originalIdx) => setSelectedSuspense(prev => prev.includes(originalIdx) ? prev.filter(item => item !== originalIdx) : [...prev, originalIdx]);

  const activeMetadata = viewMode === 'SUMMARY' ? savedStatement : results?.metadata;

  const brs_closingBankBalance = savedStatement?.closingBankBalance || 0;
  const brs_unidentifiedDeposits = savedStatement?.totalUnidentifiedDeposits || 0;
  const brs_interestCredited = savedStatement?.totalInterestCredited || 0;
  const brs_bankCharges = savedStatement?.totalBankCharges || 0;
  const brs_directPayments = savedStatement?.totalDirectPayments || 0;
  const brs_directBankDebits = savedStatement?.totalDirectBankDebits || 0;
  const brs_sysCashBook = savedStatement?.brsSummary?.systemCashBookBalance || 0;
  const brs_unclearedPayments = savedStatement?.brsSummary?.totalUnclearedPayments || 0;
  const brs_unclearedReceipts = savedStatement?.brsSummary?.totalUnclearedReceipts || 0;
  const brs_totalAdditions = brs_unidentifiedDeposits + brs_interestCredited + brs_unclearedPayments;
  const brs_totalDeductions = brs_bankCharges + brs_directPayments + brs_directBankDebits + brs_unclearedReceipts;

  return (
    <>
      <style>
        {`
          @media print {
            .header, .sidebar, .app-header, .app-sidebar, .footer { display: none !important; }
            .wrapper, .body { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
            body { background-color: #fff !important; }
            .container-fluid { padding: 0 !important; }
          }
        `}
      </style>

      <div className="container-fluid pb-5 position-relative" style={{ zIndex: 1, backgroundColor: 'transparent' }}>
        
        {/* HEADER & CONTROLS WITH SCOPE TOGGLE */}
        <div className="d-print-none mb-4 flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded shadow-sm border gap-4">
          <h2 className="text-xl font-bold text-dark m-0">Bank Reconciliation Library</h2>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* SCOPE TOGGLE BUTTONS */}
            <div className="btn-group" role="group">
              <button 
                type="button" 
                className={`btn btn-sm ${reportScope === 'MONTH' ? 'btn-dark fw-bold' : 'btn-outline-dark'}`}
                onClick={() => setReportScope('MONTH')}
              >
                Monthly View
              </button>
              <button 
                type="button" 
                className={`btn btn-sm ${reportScope === 'YEAR' ? 'btn-dark fw-bold' : 'btn-outline-dark'}`}
                onClick={() => setReportScope('YEAR')}
              >
                Whole Financial Year
              </button>
            </div>

            <select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} className="form-select fw-bold bg-light" style={{ width: '130px' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {reportScope === 'MONTH' && (
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="form-select fw-bold bg-light" style={{ width: '130px' }}>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            <button onClick={handleCheckPeriod} className="btn btn-primary fw-bold" disabled={loading}>
              {loading && viewMode === 'CHECKING' ? 'Searching...' : 'Load Report'}
            </button>

            {/* --- AI INSIGHTS BUTTON --- */}
            <button 
              onClick={handleGenerateInsights} 
              className="btn btn-info fw-bold text-white shadow-sm d-flex align-items-center gap-2" 
              disabled={isGeneratingInsights}
            >
              {isGeneratingInsights ? <span className="spinner-border spinner-border-sm"></span> : '✨'} 
              {isGeneratingInsights ? 'Analyzing...' : 'Audit Insights'}
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {feedback.message && (
          <div className={`d-print-none p-3 mb-4 rounded border fw-bold ${feedback.type === 'error' ? 'bg-danger text-white border-danger' : feedback.type === 'success' ? 'bg-success text-white border-success' : 'bg-info bg-opacity-10 text-dark border-info'}`}>
            {feedback.message}
          </div>
        )}

        {/* AI INSIGHTS DISPLAY PANEL */}
        {aiInsights && (
          <div className="d-print-none p-4 mb-4 rounded border border-info bg-info bg-opacity-10 shadow-sm animate-fade-in position-relative">
            <h5 className="text-info fw-bold mb-2">✨ AI Audit Report</h5>
            <p className="text-dark mb-0 fs-6" style={{ whiteSpace: 'pre-line' }}>{aiInsights}</p>
            <button 
              onClick={() => setAiInsights('')} 
              className="btn btn-sm btn-close position-absolute top-0 end-0 m-3" 
              aria-label="Close"
            ></button>
          </div>
        )}

        {/* METADATA CARD */}
        {activeMetadata && (
          <div className="bg-white p-4 rounded shadow-sm border flex flex-wrap justify-between items-center bg-light gap-4 mb-4">
            <div><span className="text-muted text-sm block uppercase tracking-wider font-semibold">Bank Name</span> <strong className="text-dark text-lg">{activeMetadata.bankName}</strong></div>
            <div><span className="text-muted text-sm block uppercase tracking-wider font-semibold">Account Number</span> <strong className="text-dark text-lg">{activeMetadata.accountNo || activeMetadata.accountNumber}</strong></div>
            <div className="text-end"><span className="text-muted text-sm block uppercase tracking-wider font-semibold">Period Scope</span> <strong className="text-dark text-lg">{reportScope === 'YEAR' ? `Full FY ${financialYear}` : `${month} ${financialYear}`}</strong></div>
          </div>
        )}

        {/* VIEW: UPLOAD FORM (Only in Monthly mode if no statement exists) */}
        {viewMode === 'UPLOAD' && reportScope === 'MONTH' && (
          <div className="bg-white p-5 rounded shadow-sm border d-print-none animate-fade-in">
            <form onSubmit={handleUpload} className="flex flex-col md:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-dark mb-2">Upload Bank Statement for {month} {financialYear} (XLSX, CSV, PDF)</label>
                <input type="file" accept=".xlsx, .csv, application/pdf" onChange={handleFileChange} disabled={loading} className="form-control" />
              </div>
              <div className="w-full md:w-64">
                <label className="block text-sm font-semibold text-dark mb-2">Matching Engine</label>
                <select value={processingMode} onChange={(e) => setProcessingMode(e.target.value)} disabled={loading || file?.type === 'application/pdf'} className="form-select">
                  <option value="STANDARD">Standard Algorithmic Match</option>
                  <option value="AI">Smart AI Match (Cascade)</option>
                </select>
              </div>
              <button type="submit" disabled={!file || loading} className="btn btn-dark fw-bold px-4" style={{minWidth: '160px'}}>
                {loading ? 'Processing...' : 'Run Extraction'}
              </button>
            </form>
          </div>
        )}

        {/* VIEW: DETAILS */}
        {viewMode === 'DETAILS' && results && (
          <div className="space-y-6 animate-fade-in print:m-0 print:p-0">
            
            <div className="bg-white rounded shadow-sm border-start border-4 border-success overflow-hidden d-print-none">
              <div className="bg-light p-3 flex justify-between items-center border-bottom">
                <h4 className="text-success m-0 fw-bold">✅ Exact Matches Found ({results.matched.length})</h4>
                <button type="button" onClick={toggleSelectAllMatched} className="btn btn-sm btn-outline-success fw-bold">
                  {selectedMatched.length === results.matched.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto p-2">
                <table className="table table-hover table-bordered mb-0">
                  <thead className="table-success sticky-top z-10">
                    <tr>
                      <th className="text-center" style={{width: '60px'}}>Select</th><th>Bank Date</th><th>Member / System ID</th><th>Bank Description</th><th className="text-end">Matched Credit</th><th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.matched.length === 0 ? (
                      <tr><td colSpan="6" className="text-center p-4 text-muted">No exact matches found.</td></tr>
                    ) : (
                      results.matched.map((item) => (
                        <tr key={item.systemTransactionId}>
                          <td className="text-center align-middle"><input type="checkbox" checked={selectedMatched.includes(item.systemTransactionId)} onChange={() => toggleSelectMatchedItem(item.systemTransactionId)} className="form-check-input cursor-pointer" /></td>
                          <td className="align-middle">{item.bankDate}</td>
                          <td className="align-middle"><strong>{item.member}</strong><br/><small className="text-muted">{item.systemTransactionId}</small></td>
                          <td className="align-middle">{item.bankDescription}</td>
                          <td className="text-end fw-bold text-success align-middle">{formatCurrency(item.credit)}</td>
                          <td className="align-middle"><span className="badge bg-success">{item.confidence}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded shadow-sm border-start border-4 border-warning overflow-hidden print:shadow-none print:border-0 mt-4">
              <div className="bg-light p-3 flex justify-between items-center border-bottom d-print-none">
                <h4 className="text-warning text-dark m-0 fw-bold">⚠️ Unidentified Funds & Withdrawals ({results.suspense.length})</h4>
                <button type="button" onClick={toggleSelectAllSuspense} className="btn btn-sm btn-outline-warning text-dark fw-bold">
                  {selectedSuspense.length === results.suspense.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto p-2 print:max-h-full print:overflow-visible">
                <table className="table table-hover table-bordered mb-0">
                  <thead className="table-dark sticky-top z-10 print:static">
                    <tr>
                      <th className="text-center d-print-none" style={{width: '60px'}}>Select</th>
                      <th className="cursor-pointer select-none" onClick={() => requestSort('bankDate')}>Date <SortIndicator columnKey="bankDate" /></th>
                      <th className="cursor-pointer select-none" onClick={() => requestSort('bankDescription')}>Description <SortIndicator columnKey="bankDescription" /></th>
                      <th className="cursor-pointer select-none" onClick={() => requestSort('referenceNumber')}>Ref (UTR) <SortIndicator columnKey="referenceNumber" /></th>
                      <th className="text-end cursor-pointer select-none" onClick={() => requestSort('debit')}>Debit <SortIndicator columnKey="debit" /></th>
                      <th className="text-end cursor-pointer select-none" onClick={() => requestSort('credit')}>Credit <SortIndicator columnKey="credit" /></th>
                      <th className="text-end cursor-pointer select-none" onClick={() => requestSort('balance')}>Balance <SortIndicator columnKey="balance" /></th>
                      <th className="cursor-pointer select-none" onClick={() => requestSort('suggestedType')}>Type <SortIndicator columnKey="suggestedType" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.suspense.length === 0 ? (
                      <tr><td colSpan="8" className="text-center p-4 text-muted">All clear. No unknown funds.</td></tr>
                    ) : (
                      getSortedSuspenseData().map((item) => (
                        <tr key={item.originalIndex} className={item.status === 'DEBIT' ? 'table-danger' : item.status === 'UNRECONCILED' ? 'table-warning' : ''}>
                          <td className="text-center align-middle d-print-none"><input type="checkbox" checked={selectedSuspense.includes(item.originalIndex)} onChange={() => toggleSelectSuspenseItem(item.originalIndex)} disabled={item.status === 'DEBIT'} className="form-check-input cursor-pointer"/></td>
                          <td className="align-middle">{item.bankDate}</td>
                          <td className="align-middle text-sm">{item.bankDescription}</td>
                          <td className="align-middle text-xs">{item.referenceNumber || 'N/A'}</td>
                          <td className="text-end text-danger align-middle">{item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
                          <td className="text-end text-success align-middle">{item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
                          <td className="text-end fw-bold align-middle">{formatCurrency(item.balance)}</td>
                          <td className="align-middle"><span className={`badge ${item.status === 'DEBIT' ? 'bg-danger' : 'bg-warning text-dark'}`}>{item.suggestedType}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="table-dark font-bold">
                    <tr>
                      <td colSpan="4" className="text-end py-3">STATEMENT TOTALS:</td>
                      <td className="text-end text-danger py-3">{formatCurrency(totalDebit)}</td>
                      <td className="text-end text-success py-3">{formatCurrency(totalCredit)}</td>
                      <td className="text-end py-3">{formatCurrency(closingBalance)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="d-print-none mt-4 flex justify-end gap-3 border-top pt-4">
              <button onClick={exportToCSV} className="btn btn-outline-success fw-bold px-4">📊 Save as Excel (CSV)</button>
              <button onClick={handlePrintPDF} className="btn btn-outline-dark fw-bold px-4">🖨️ Print Detailed Scan</button>
              
              {savedStatement && (
                <button onClick={() => setViewMode('SUMMARY')} className="btn btn-outline-primary fw-bold px-4">
                  Back to BRS Summary
                </button>
              )}

              <button onClick={handleSaveBRS} disabled={loading} className="btn btn-success fw-bold shadow-sm px-4 ms-2">
                {loading ? 'Executing Engine...' : savedStatement ? `Overwrite & Re-generate BRS` : `Save & Generate BRS for ${month}`}
              </button>
            </div>
          </div>
        )}

        {/* VIEW: SUMMARY (AUDIT PRINT VIEW) */}
        {viewMode === 'SUMMARY' && savedStatement && (
          <div className="bg-white p-5 rounded shadow-sm border animate-fade-in print:shadow-none print:border-0 print:p-0">
            
            <div className="text-center mb-5">
              <h2 className="font-bold text-uppercase tracking-wider text-dark mb-1">
                {reportScope === 'YEAR' ? `Annual Bank Reconciliation Statement (FY ${financialYear})` : `Bank Reconciliation Statement`}
              </h2>
              <p className="text-muted mb-0">For the period: <strong>{reportScope === 'YEAR' ? `Full Financial Year ${financialYear}` : `${savedStatement.month}, ${savedStatement.financialYear}`}</strong></p>
            </div>

            <table className="table table-bordered border-dark" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead className="table-dark">
                <tr>
                  <th className="p-3 text-uppercase" style={{ width: '70px' }}>Sl. No.</th>
                  <th className="p-3 text-uppercase">Particulars</th>
                  <th className="p-3 text-end text-uppercase" style={{ width: '140px' }}>Add (₹)</th>
                  <th className="p-3 text-end text-uppercase" style={{ width: '140px' }}>Less (₹)</th>
                  <th className="p-3 text-end text-uppercase" style={{ width: '180px' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-light">
                  <td className="p-3">1</td>
                  <td className="p-3 fw-bold">Balance as per Cash Book (Debit)</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end fw-bold">{formatCurrency(brs_sysCashBook)}</td>
                </tr>
                <tr className="bg-success bg-opacity-10">
                  <td className="p-3">2</td>
                  <td className="p-3">Add: Cheques issued/drawn but not yet presented for payment to the bank</td>
                  <td className="p-3 text-end">{formatCurrency(brs_unclearedPayments)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-success bg-opacity-10">
                  <td className="p-3">3</td>
                  <td className="p-3">Add: Amounts directly deposited by members/tenants into the bank account not yet recorded in the Cash Book</td>
                  <td className="p-3 text-end">{formatCurrency(brs_unidentifiedDeposits)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-success bg-opacity-10">
                  <td className="p-3">4</td>
                  <td className="p-3">Add: Interest allowed/credited by the bank directly</td>
                  <td className="p-3 text-end">{formatCurrency(brs_interestCredited)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr>
                  <td className="p-3"></td>
                  <td className="p-3 text-end fw-bold">Total Additions</td>
                  <td className="p-3 text-end fw-bold text-success">{formatCurrency(brs_totalAdditions)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-danger bg-opacity-10">
                  <td className="p-3">5</td>
                  <td className="p-3">Less: Cheques/maintenance payments deposited into the bank but not yet cleared/credited</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end">{formatCurrency(brs_unclearedReceipts)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-danger bg-opacity-10">
                  <td className="p-3">6</td>
                  <td className="p-3">Less: Bank charges, commission, or locker rent debited in the passbook only</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end">{formatCurrency(brs_bankCharges)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-danger bg-opacity-10">
                  <td className="p-3">7</td>
                  <td className="p-3">Less: Direct payments/standing instructions (ECS/NEFT) debited by bank not recorded in Cash Book</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end">{formatCurrency(brs_directPayments + brs_directBankDebits)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr>
                  <td className="p-3"></td>
                  <td className="p-3 text-end fw-bold">Total Deductions</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end fw-bold text-danger">{formatCurrency(brs_totalDeductions)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="table-dark border-dark">
                  <td className="p-3">8</td>
                  <td className="p-3 fw-bold text-uppercase">Balance as per Bank Statement (Credit)</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3 text-end fw-bold fs-4">{formatCurrency(brs_closingBankBalance)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-5 flex justify-between pt-5 border-top border-secondary text-dark">
              <div className="text-center">
                <p className="mb-5 font-semibold">Prepared By (Maker)</p>
                <div className="border-bottom border-2 border-dark mx-auto" style={{ width: '180px' }}></div>
                <p className="text-sm mt-2 text-muted">Date: {new Date(savedStatement.createdAt || Date.now()).toLocaleDateString('en-GB')}</p>
              </div>
              <div className="text-center">
                <p className="mb-5 font-semibold">Verified By (Checker/Auditor)</p>
                <div className="border-bottom border-2 border-dark mx-auto" style={{ width: '180px' }}></div>
                <p className="text-sm mt-2 text-muted">Signature & Stamp</p>
              </div>
            </div>

            <div className="d-print-none mt-5 flex justify-center gap-3">
              {reportScope === 'MONTH' && (
                <>
                  <button onClick={() => setViewMode('DETAILS')} className="btn btn-outline-dark fw-bold px-4">View Transaction Details</button>
                  <button onClick={handleDeleteBRS} className="btn btn-danger fw-bold px-4">🗑️ Delete & Reset Month</button>
                </>
              )}
              <button onClick={exportToCSV} className="btn btn-success fw-bold px-4">📊 Save as Excel (CSV)</button>
              <button onClick={handlePrintPDF} className="btn btn-dark fw-bold px-5">🖨️ Save as PDF / Print</button>
            </div>
          </div>
        )}

      </div>
    </>
  );
};

export default BankReconciliation;
