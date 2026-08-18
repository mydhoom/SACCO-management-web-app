import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton,
  CFormSelect, CFormCheck, CAlert, CSpinner, CBadge
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilDescription, cilCloudDownload, cilPrint, cilFile } from '@coreui/icons'
import { 
  generateLoanReport, exportLoanExcel, exportLoanPDF,
  generateRDReport, exportRDExcel, exportRDPDF,
  generateTrialBalance, exportTrialBalanceExcel, exportTrialBalancePDF,
  generatePnLReport, exportPnLExcel, exportPnLPDF
} from '../../utils/auditReportEngine'

const ReportsGeneration = () => {
  const [transactions, setTransactions] = useState([])
  const [loadingTx, setLoadingTx] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // Computes the current Indian fiscal year (Apr–Mar) dynamically
  const currentFY = () => {
    const now = new Date();
    const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${yr}-${yr + 1}`;
  };

  // Settings for Loan/RD Report
  const [timeframeType, setTimeframeType] = useState('MONTHLY') // 'MONTHLY' or 'YEARLY'
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [selectedFY, setSelectedFY] = useState(currentFY())

  // Settings for P&L Report
  const [pnlTimeframeType, setPnlTimeframeType] = useState('MONTHLY')
  const [pnlSelectedMonth, setPnlSelectedMonth] = useState((new Date().getMonth() + 1).toString())
  const [pnlSelectedYear, setPnlSelectedYear] = useState(new Date().getFullYear().toString())
  const [pnlSelectedFY, setPnlSelectedFY] = useState(currentFY())

  // Settings for Trial Balance Report
  const [tbTimeframeType, setTbTimeframeType] = useState('MONTHLY') 
  const [tbSelectedMonth, setTbSelectedMonth] = useState((new Date().getMonth() + 1).toString())
  const [tbSelectedYear, setTbSelectedYear] = useState(new Date().getFullYear().toString())
  const [tbSelectedFY, setTbSelectedFY] = useState(currentFY())

  // Settings for RD Report
  const [rdTimeframeType, setRdTimeframeType] = useState('MONTHLY') 
  const [rdSelectedMonth, setRdSelectedMonth] = useState((new Date().getMonth() + 1).toString())
  const [rdSelectedYear, setRdSelectedYear] = useState(new Date().getFullYear().toString())
  const [rdSelectedFY, setRdSelectedFY] = useState(currentFY())

  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/transactions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      })
      if (!response.ok) throw new Error("Failed to fetch ledger")
      const data = await response.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTx(false)
    }
  }

  // --- TEMPORARY MOCK DATA FOR TESTING ---
  const handleLoadMockData = () => {
    const mockData = [
      // --- OPENING BALANCES (Must be balanced) ---
      // Debit: Loan Assets (152) and Bank (101)
      // Credit: Share Capital (155)
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2023-12-01T10:00:00Z', ledgerFolio: '152', entryType: 'DEBIT', amount: 179482 }, 
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-03-01T10:00:00Z', ledgerFolio: '152', entryType: 'DEBIT', amount: 392975 }, 
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-04-01T10:00:00Z', ledgerFolio: '101', entryType: 'DEBIT', amount: 500000 }, 
      
      // Balancing the opening (179482 + 392975 + 500000 = 1072457)
      { vendorNo: 'SYS-SHARE', memberName: 'All Members', transactionDate: '2024-04-01T10:00:00Z', ledgerFolio: '155', entryType: 'CREDIT', amount: 1072457 }, 

      // --- TRANSACTIONS (Each must have Dr and Cr) ---
      
      // Hem Raj Apr Payment: Principal (9504), Interest (1496), RD (2000) = Total 13000
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-04-15T10:00:00Z', ledgerFolio: '101', entryType: 'DEBIT', amount: 13000 }, 
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2024-04-15T10:00:00Z', ledgerFolio: '152', entryType: 'CREDIT', amount: 9504 },
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2024-04-15T10:00:00Z', ledgerFolio: '153', entryType: 'CREDIT', amount: 1496 }, 
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2024-04-15T10:00:00Z', ledgerFolio: '154', entryType: 'CREDIT', amount: 2000 }, 

      // Hem Raj May Payment: Principal (9504), Interest (1496) = Total 11000
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-05-15T10:00:00Z', ledgerFolio: '101', entryType: 'DEBIT', amount: 11000 }, 
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2024-05-15T10:00:00Z', ledgerFolio: '152', entryType: 'CREDIT', amount: 9504 },
      { vendorNo: '10026', memberName: 'Hem Raj', transactionDate: '2024-05-15T10:00:00Z', ledgerFolio: '153', entryType: 'CREDIT', amount: 1496 },

      // ABHI RAM New Loan in Aug: 235000
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-08-15T10:00:00Z', ledgerFolio: '152', entryType: 'DEBIT', amount: 235000 }, 
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-08-15T10:00:00Z', ledgerFolio: '101', entryType: 'CREDIT', amount: 235000 }, 

      // ABHI RAM Aug Payment: Principal (53720.40), Interest (9779.60) = Total 63500
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-08-15T10:00:00Z', ledgerFolio: '101', entryType: 'DEBIT', amount: 63500 }, 
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-08-15T10:00:00Z', ledgerFolio: '152', entryType: 'CREDIT', amount: 53720.40 }, 
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-08-15T10:00:00Z', ledgerFolio: '153', entryType: 'CREDIT', amount: 9779.60 }, 

      // ABHI RAM RD Adj in April: 15000
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-04-20T10:00:00Z', ledgerFolio: '154', entryType: 'DEBIT', paymentMode: 'INTERNAL_TRANSFER', description: 'RD Adjust', amount: 15000 }, 
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-04-20T10:00:00Z', ledgerFolio: '152', entryType: 'CREDIT', paymentMode: 'INTERNAL_TRANSFER', description: 'RD Adjust', amount: 15000 }, 

      // ABHI RAM May RD Deposit: 5000
      { vendorNo: 'SYS-BANK', memberName: 'HDFC Bank', transactionDate: '2024-05-20T10:00:00Z', ledgerFolio: '101', entryType: 'DEBIT', amount: 5000 },
      { vendorNo: '10986', memberName: 'ABHI RAM', transactionDate: '2024-05-20T10:00:00Z', ledgerFolio: '154', entryType: 'CREDIT', amount: 5000 }
    ];
    setTransactions(mockData);
    alert("Mock Data Injected! You can now test the Reports for FY 2024-2025 (April & May).");
  }
  // --------------------------------------

  const handleDownloadLoanExcel = async () => {
    setIsGenerating(true)
    setTimeout(async () => {
      const { finalRows } = await generateLoanReport(transactions, timeframeType, selectedMonth, selectedYear, selectedFY)
      if(finalRows.length === 0) {
        alert("No Loan transactions found for the selected period.");
        setIsGenerating(false)
        return;
      }
      exportLoanExcel(finalRows, timeframeType, selectedFY, selectedMonth, selectedYear)
      setIsGenerating(false)
    }, 500)
  }

  const handleDownloadLoanPDF = async () => {
    setIsGenerating(true)
    try {
      const { finalRows } = generateLoanReport(transactions, timeframeType, selectedMonth, selectedYear, selectedFY)
      if(finalRows.length === 0) {
        alert("No Loan transactions found for the selected period.");
        setIsGenerating(false)
        return;
      }
      await exportLoanPDF(finalRows, timeframeType, selectedFY, selectedMonth, selectedYear)
    } catch (e) {
      console.error(e)
      alert("Error generating PDF")
    }
    setIsGenerating(false)
  }

  const handleDownloadRDExcel = async () => {
    setIsGenerating(true)
    setTimeout(async () => {
      const { finalRows } = await generateRDReport(transactions, rdTimeframeType, rdSelectedMonth, rdSelectedYear, rdSelectedFY)
      if(finalRows.length === 0) {
        alert("No RD transactions found for the selected period.");
        setIsGenerating(false)
        return;
      }
      exportRDExcel(finalRows, rdTimeframeType, rdSelectedFY, rdSelectedMonth, rdSelectedYear)
      setIsGenerating(false)
    }, 500)
  }

  const handleDownloadRDPDF = async () => {
    setIsGenerating(true)
    try {
      const { finalRows } = generateRDReport(transactions, rdTimeframeType, rdSelectedMonth, rdSelectedYear, rdSelectedFY)
      if(finalRows.length === 0) {
        alert("No RD transactions found for the selected period.");
        setIsGenerating(false)
        return;
      }
      await exportRDPDF(finalRows, rdTimeframeType, rdSelectedFY, rdSelectedMonth, rdSelectedYear)
    } catch (e) {
      console.error(e)
      alert("Error generating PDF")
    }
    setIsGenerating(false)
  }

  const handleDownloadTBExcel = () => {
    setIsGenerating(true)
    try {
      const { finalRows } = generateTrialBalance(transactions, tbTimeframeType, tbSelectedMonth, tbSelectedYear, tbSelectedFY)
      exportTrialBalanceExcel(finalRows, tbTimeframeType, tbSelectedFY, tbSelectedMonth, tbSelectedYear)
    } catch (e) {
      console.error(e)
      alert("Error generating Excel")
    }
    setIsGenerating(false)
  }

  const handleDownloadTBPDF = async () => {
    setIsGenerating(true)
    try {
      const { finalRows } = generateTrialBalance(transactions, tbTimeframeType, tbSelectedMonth, tbSelectedYear, tbSelectedFY)
      await exportTrialBalancePDF(finalRows, tbTimeframeType, tbSelectedFY, tbSelectedMonth, tbSelectedYear)
    } catch (e) {
      console.error(e)
      alert("Error generating PDF")
    }
    setIsGenerating(false)
  }

  return (
    <CRow>
      <CCol xs={12} lg={10} className="mx-auto">
        <div className="mb-4 d-flex align-items-center gap-2 justify-content-between">
           <div className="d-flex align-items-center gap-2">
             <CIcon icon={cilDescription} size="xl" className="text-primary" />
             <h2 className="mb-0 fw-bold">Official Audit Reports</h2>
           </div>
           {/* TODO: REMOVE THIS MOCK BUTTON AFTER TESTING */}
           <CButton color="warning" variant="outline" onClick={handleLoadMockData}>
             Inject Test Data (For 24-25)
           </CButton>
        </div>
        
        {loadingTx && <CAlert color="info"><CSpinner size="sm" className="me-2"/> Loading society financial records...</CAlert>}

        {/* 1. LOAN RECOVERY REPORT */}
        <CCard className="shadow-sm border-top-primary border-top-3 mb-4">
          <CCardHeader className="bg-white py-3">
            <h5 className="mb-0 fw-bold text-dark">1. Loan Recovery Report</h5>
            <div className="small text-muted">Auditor format with Debit/Credit splits for Loan Principal and Interest (Folios 152 & 153).</div>
          </CCardHeader>
          <CCardBody className="p-4">
            
            {/* Timeframe Selection */}
            <div className="d-flex flex-wrap gap-4 mb-4 p-3 bg-light rounded">
              <div>
                <strong className="d-block mb-2">Report Format:</strong>
                <CFormCheck 
                  type="radio" name="timeframe" id="monthly" label="Monthly Report" 
                  checked={timeframeType === 'MONTHLY'} onChange={() => setTimeframeType('MONTHLY')} 
                />
                <CFormCheck 
                  type="radio" name="timeframe" id="yearly" label="Yearly Report (with Month-wise Excel Bifurcation)" 
                  checked={timeframeType === 'YEARLY'} onChange={() => setTimeframeType('YEARLY')} 
                />
              </div>

              {timeframeType === 'MONTHLY' ? (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Month</label>
                    <CFormSelect value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                         <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </CFormSelect>
                  </div>
                  <div>
                    <label className="form-label small fw-bold">Year</label>
                    <CFormSelect value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </CFormSelect>
                  </div>
                </div>
              ) : (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Financial Year</label>
                    <CFormSelect value={selectedFY} onChange={e => setSelectedFY(e.target.value)}>
                      <option value="2024-2025">FY 2024-2025</option>
                      <option value="2025-2026">FY 2025-2026</option>
                      <option value="2026-2027">FY 2026-2027</option>
                    </CFormSelect>
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex gap-3">
              <CButton color="success" className="text-white fw-bold shadow-sm" onClick={handleDownloadLoanExcel} disabled={loadingTx || isGenerating}>
                {isGenerating ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudDownload} className="me-2"/> Download Excel</>}
              </CButton>
              <CButton color="danger" className="text-white fw-bold shadow-sm" onClick={handleDownloadLoanPDF} disabled={loadingTx || isGenerating}>
                <CIcon icon={cilFile} className="me-2"/> Download PDF
              </CButton>
            </div>
          </CCardBody>
        </CCard>

        {/* 2. RD RECOVERY REPORT */}
        <CCard className="shadow-sm border-top-info border-top-3 mb-4">
          <CCardHeader className="bg-white py-3">
            <h5 className="mb-0 fw-bold text-dark">2. RD Recovery Report</h5>
            <div className="small text-muted">Auditor format with Credit balances, New Deposits, and Payouts/Adjustments (Folio 154).</div>
          </CCardHeader>
          <CCardBody className="p-4">
            <div className="d-flex flex-wrap gap-4 mb-4 p-3 bg-light rounded">
              <div>
                <strong className="d-block mb-2">Report Format:</strong>
                <CFormCheck 
                  type="radio" name="rdtimeframe" id="rdmonthly" label="Monthly Report" 
                  checked={rdTimeframeType === 'MONTHLY'} onChange={() => setRdTimeframeType('MONTHLY')} 
                />
                <CFormCheck 
                  type="radio" name="rdtimeframe" id="rdyearly" label="Yearly Report (Consolidated)" 
                  checked={rdTimeframeType === 'YEARLY'} onChange={() => setRdTimeframeType('YEARLY')} 
                />
              </div>

              {rdTimeframeType === 'MONTHLY' ? (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Month</label>
                    <CFormSelect value={rdSelectedMonth} onChange={e => setRdSelectedMonth(e.target.value)}>
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                         <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </CFormSelect>
                  </div>
                  <div>
                    <label className="form-label small fw-bold">Year</label>
                    <CFormSelect value={rdSelectedYear} onChange={e => setRdSelectedYear(e.target.value)}>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </CFormSelect>
                  </div>
                </div>
              ) : (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Financial Year</label>
                    <CFormSelect value={rdSelectedFY} onChange={e => setRdSelectedFY(e.target.value)}>
                      <option value="2024-2025">FY 2024-2025</option>
                      <option value="2025-2026">FY 2025-2026</option>
                      <option value="2026-2027">FY 2026-2027</option>
                    </CFormSelect>
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex gap-3">
              <CButton color="info" className="text-white fw-bold shadow-sm" onClick={handleDownloadRDExcel} disabled={loadingTx || isGenerating}>
                {isGenerating ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudDownload} className="me-2"/> Download Excel</>}
              </CButton>
              <CButton color="danger" className="text-white fw-bold shadow-sm" onClick={handleDownloadRDPDF} disabled={loadingTx || isGenerating}>
                <CIcon icon={cilFile} className="me-2"/> Download PDF
              </CButton>
            </div>
          </CCardBody>
        </CCard>

        {/* 3. MASTER JOURNAL */}
        <CCard className="shadow-sm border-top-dark border-top-3 mb-4">
          <CCardHeader className="bg-white py-3">
            <h5 className="mb-0 fw-bold text-dark">3. Master Journal (Daybook)</h5>
            <div className="small text-muted">Chronological ledger of all debits and credits across all Folios.</div>
          </CCardHeader>
          <CCardBody className="p-4 d-flex justify-content-between align-items-center">
            <div>
              <CBadge color="dark" shape="rounded-pill" className="mb-2">Folio Independent</CBadge>
              <p className="mb-0 text-muted">Navigate to the Master Journal screen to use advanced filters and generate the Daybook.</p>
            </div>
            <CButton color="dark" variant="outline" href="#/admin/master-journal">
              Go to Master Journal <CIcon icon={cilPrint} className="ms-2"/>
            </CButton>
          </CCardBody>
        </CCard>

        {/* 4. TRIAL BALANCE */}
        <CCard className="shadow-sm border-top-warning border-top-3 mb-4">
          <CCardHeader className="bg-white py-3">
            <h5 className="mb-0 fw-bold text-dark">4. Consolidated Trial Balance</h5>
            <div className="small text-muted">Summary of all assets and liabilities mapped by Folio.</div>
          </CCardHeader>
          <CCardBody className="p-4">
            
            {/* Timeframe Selection */}
            <div className="d-flex flex-wrap gap-4 mb-4 p-3 bg-light rounded">
              <div>
                <strong className="d-block mb-2">Report Format:</strong>
                <CFormCheck 
                  type="radio" name="tbTimeframe" id="tbMonthly" label="Monthly Trial Balance" 
                  checked={tbTimeframeType === 'MONTHLY'} onChange={() => setTbTimeframeType('MONTHLY')} 
                />
                <CFormCheck 
                  type="radio" name="tbTimeframe" id="tbYearly" label="Yearly Trial Balance" 
                  checked={tbTimeframeType === 'YEARLY'} onChange={() => setTbTimeframeType('YEARLY')} 
                />
              </div>

              {tbTimeframeType === 'MONTHLY' ? (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Month</label>
                    <CFormSelect value={tbSelectedMonth} onChange={e => setTbSelectedMonth(e.target.value)}>
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                         <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </CFormSelect>
                  </div>
                  <div>
                    <label className="form-label small fw-bold">Year</label>
                    <CFormSelect value={tbSelectedYear} onChange={e => setTbSelectedYear(e.target.value)}>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </CFormSelect>
                  </div>
                </div>
              ) : (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Financial Year</label>
                    <CFormSelect value={tbSelectedFY} onChange={e => setTbSelectedFY(e.target.value)}>
                      <option value="2024-2025">FY 2024-2025</option>
                      <option value="2025-2026">FY 2025-2026</option>
                      <option value="2026-2027">FY 2026-2027</option>
                    </CFormSelect>
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex gap-3">
              <CButton color="success" className="text-white fw-bold shadow-sm" onClick={handleDownloadTBExcel} disabled={loadingTx || isGenerating}>
                {isGenerating ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudDownload} className="me-2"/> Download Excel</>}
              </CButton>
              <CButton color="danger" className="text-white fw-bold shadow-sm" onClick={handleDownloadTBPDF} disabled={loadingTx || isGenerating}>
                <CIcon icon={cilFile} className="me-2"/> Download PDF
              </CButton>
            </div>
          </CCardBody>
        </CCard>

        {/* 5. PROFIT & LOSS REPORT */}
        <CCard className="shadow-sm border-top-success border-top-3 mb-4">
          <CCardHeader className="bg-white py-3">
            <h5 className="mb-0 fw-bold text-dark">5. 📊 Profit & Loss (P&L) Account</h5>
            <div className="small text-muted">Monthly or FY Annual P&L with co-operative statutory appropriations (25% Reserve, 10% Dividend Fund, 5% Common Good Fund).</div>
          </CCardHeader>
          <CCardBody className="p-4">
            <div className="d-flex flex-wrap gap-4 mb-4 p-3 bg-light rounded">
              <div>
                <strong className="d-block mb-2">Report Format:</strong>
                <CFormCheck type="radio" name="pnltimeframe" id="pnlmonthly" label="Monthly P&L"
                  checked={pnlTimeframeType === 'MONTHLY'} onChange={() => setPnlTimeframeType('MONTHLY')} />
                <CFormCheck type="radio" name="pnltimeframe" id="pnlyearly" label="Annual FY P&L (with Monthly Trend)"
                  checked={pnlTimeframeType === 'YEARLY'} onChange={() => setPnlTimeframeType('YEARLY')} />
              </div>
              {pnlTimeframeType === 'MONTHLY' ? (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Month</label>
                    <CFormSelect value={pnlSelectedMonth} onChange={e => setPnlSelectedMonth(e.target.value)}>
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </CFormSelect>
                  </div>
                  <div>
                    <label className="form-label small fw-bold">Year</label>
                    <CFormSelect value={pnlSelectedYear} onChange={e => setPnlSelectedYear(e.target.value)}>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </CFormSelect>
                  </div>
                </div>
              ) : (
                <div className="d-flex gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Financial Year</label>
                    <CFormSelect value={pnlSelectedFY} onChange={e => setPnlSelectedFY(e.target.value)}>
                      <option value="2024-2025">FY 2024-2025</option>
                      <option value="2025-2026">FY 2025-2026</option>
                      <option value="2026-2027">FY 2026-2027</option>
                    </CFormSelect>
                  </div>
                </div>
              )}
            </div>
            <div className="d-flex gap-3">
              <CButton color="success" className="text-white fw-bold shadow-sm"
                onClick={async () => {
                  setIsGenerating(true)
                  try {
                    const pnl = generatePnLReport(transactions, pnlTimeframeType, pnlSelectedMonth, pnlSelectedYear, pnlSelectedFY)
                    if (pnl.totalIncome === 0 && pnl.totalExpense === 0) {
                      alert('No P&L transactions found for the selected period. Please verify the date range or load real transaction data.')
                      return
                    }
                    exportPnLExcel(pnl, pnlTimeframeType, pnlSelectedFY, pnlSelectedMonth, pnlSelectedYear)
                  } catch (e) {
                    console.error(e)
                    alert('Error generating P&L Excel')
                  } finally {
                    setIsGenerating(false)
                  }
                }} disabled={loadingTx || isGenerating}>
                {isGenerating ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudDownload} className="me-2"/>Download P&L Excel</>}
              </CButton>
              <CButton color="danger" className="text-white fw-bold shadow-sm"
                onClick={async () => {
                  setIsGenerating(true)
                  try {
                    const pnl = generatePnLReport(transactions, pnlTimeframeType, pnlSelectedMonth, pnlSelectedYear, pnlSelectedFY)
                    if (pnl.totalIncome === 0 && pnl.totalExpense === 0) {
                      alert('No P&L transactions found for the selected period. Please verify the date range or load real transaction data.')
                      return
                    }
                    await exportPnLPDF(pnl)
                  } catch (e) {
                    console.error(e)
                    alert('Error generating P&L PDF')
                  } finally {
                    setIsGenerating(false)
                  }
                }} disabled={loadingTx || isGenerating}>
                <CIcon icon={cilFile} className="me-2"/>Download P&L PDF
              </CButton>
            </div>
          </CCardBody>
        </CCard>

      </CCol>
    </CRow>
  )
}

export default ReportsGeneration