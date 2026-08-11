import React, { useState } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton,
  CFormSelect, CSpinner, CTable, CTableHead, CTableRow, 
  CTableHeaderCell, CTableBody, CTableDataCell
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSpreadsheet, cilPrint } from '@coreui/icons'

const FinancialStatements = () => {
  const [statementType, setStatementType] = useState('TRIAL_BALANCE')
  const [financialYear, setFinancialYear] = useState('2025-2026')
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportReady, setReportReady] = useState(false)

  const [trialBalanceData, setTrialBalanceData] = useState([])
  const [totals, setTotals] = useState({ dr: 0, cr: 0 })
  const [reportData, setReportData] = useState([])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setReportReady(false)
    
    if (statementType === 'TRIAL_BALANCE') {
      try {
        const response = await fetch('http://localhost:5000/api/transactions', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        })
        const data = await response.json()

        if (Array.isArray(data)) {
          const aggregated = {}
          data.filter(t => t.status === 'COMPLETED').forEach(txn => {
            const cat = txn.category.replace(/_/g, ' ')
            if (!aggregated[cat]) aggregated[cat] = { head: cat, debit: 0, credit: 0 }
            
            if (txn.entryType === 'DEBIT') aggregated[cat].debit += txn.amount
            if (txn.entryType === 'CREDIT') aggregated[cat].credit += txn.amount
          })

          const mappedData = Object.values(aggregated)
          let totalDr = 0; let totalCr = 0;
          mappedData.forEach(row => { totalDr += row.debit; totalCr += row.credit; })

          setTrialBalanceData(mappedData)
          setTotals({ dr: totalDr, cr: totalCr })
        }
      } catch (err) {
        console.error("Error aggregating financial statements:", err)
        alert("Failed to compile ledger data.")
      } finally {
        setIsGenerating(false)
        setReportReady(true)
      }
    } else {
      setTimeout(() => {
        if (statementType === 'INCOME_EXPENSE') {
          setReportData([
            { income: 'Interest on Loans', incAmount: 350000, expense: 'Audit Fees', expAmount: 25000 },
            { income: 'Admission Fees', incAmount: 15000, expense: 'Bank Charges', expAmount: 5000 },
            { income: 'Misc Income', incAmount: 4000, expense: 'Stationery', expAmount: 12000 },
          ])
        } else if (statementType === 'BALANCE_SHEET') {
          setReportData([
            { liability: 'Share Capital', liabAmount: 4500000, asset: 'Loans Outstanding', assetAmount: 3800000 },
            { liability: 'Reserves & Surplus', liabAmount: 850000, asset: 'Cash at Bank', assetAmount: 1050000 },
            { liability: 'Dividend Payable', liabAmount: 120000, asset: 'Investments (FD)', assetAmount: 620000 },
          ])
        }
        setIsGenerating(false)
        setReportReady(true)
      }, 1000)
    }
  }

  const handlePrint = () => window.print()

  return (
    <>
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .printable-area, .printable-area * { visibility: visible; }
            .printable-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
            @page { size: A4 portrait; margin: 1cm; }
          }
        `}
      </style>

      <CRow>
        <CCol xs={12} lg={10} className="mx-auto">
          
          <CCard className="shadow-sm border-0 mb-4 d-print-none">
            <CCardHeader className="py-3 bg-white border-bottom-0 pt-4 px-4">
              <h4 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                <CIcon icon={cilSpreadsheet} className="text-primary" size="xl"/>
                Financial Statements
              </h4>
            </CCardHeader>
            <CCardBody className="px-4 pb-4">
              <CRow className="g-3 align-items-end p-3 bg-light rounded border">
                <CCol md={5}>
                  <label className="form-label small fw-bold">Statement Type</label>
                  {/* FIXED: Added setReportReady(false) to immediately clear old data on change */}
                  <CFormSelect 
                    value={statementType} 
                    onChange={(e) => {
                      setStatementType(e.target.value)
                      setReportReady(false)
                    }}
                  >
                    <option value="TRIAL_BALANCE">Trial Balance (Live Ledger Data)</option>
                    <option value="INCOME_EXPENSE">Income & Expenditure Account</option>
                    <option value="BALANCE_SHEET">Balance Sheet</option>
                  </CFormSelect>
                </CCol>
                <CCol md={4}>
                  <label className="form-label small fw-bold">Financial Year</label>
                  <CFormSelect value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>
                    <option value="2026-2027">2026 - 2027</option>
                    <option value="2025-2026">2025 - 2026</option>
                  </CFormSelect>
                </CCol>
                <CCol md={3}>
                  <CButton color="dark" className="w-100 fw-bold shadow-sm" onClick={handleGenerate} disabled={isGenerating}>
                    {isGenerating ? <CSpinner size="sm" /> : 'Generate Statement'}
                  </CButton>
                </CCol>
              </CRow>
            </CCardBody>
          </CCard>

          {reportReady && (
            <div className="printable-area">
              <CCard className="shadow-sm border-0 animate__animated animate__fadeInUp">
                
                <CCardHeader className="bg-primary bg-opacity-10 py-3 d-flex justify-content-between align-items-center d-print-none">
                  <div className="text-primary fw-bold">
                    {statementType === 'TRIAL_BALANCE' ? 'Live Statement Generated' : 'Statement Generated'}
                  </div>
                  <div className="d-flex gap-2">
                    <CButton color="primary" variant="outline" size="sm" onClick={handlePrint}>
                      <CIcon icon={cilPrint} className="me-1"/> Print PDF
                    </CButton>
                  </div>
                </CCardHeader>

                <CCardBody className="p-4">
                  <div className="text-center mb-4 border-bottom pb-3">
                    <h3 className="fw-bold mb-1">HPSEBL City Electrical Division Sacco</h3>
                    <h5 className="text-muted text-uppercase">
                      {statementType === 'TRIAL_BALANCE' && 'Trial Balance'}
                      {statementType === 'INCOME_EXPENSE' && 'Income & Expenditure Account'}
                      {statementType === 'BALANCE_SHEET' && 'Balance Sheet'}
                    </h5>
                    <p className="small mb-0">For the Financial Year ending March 31, {financialYear.split('-')[1]}</p>
                  </div>

                  {statementType === 'TRIAL_BALANCE' && (
                    <>
                      <CTable bordered align="middle">
                        <CTableHead color="dark">
                          <CTableRow>
                            <CTableHeaderCell>Head of Account (Category)</CTableHeaderCell>
                            <CTableHeaderCell className="text-end" style={{width: '25%'}}>Total Debits (₹)</CTableHeaderCell>
                            <CTableHeaderCell className="text-end" style={{width: '25%'}}>Total Credits (₹)</CTableHeaderCell>
                          </CTableRow>
                        </CTableHead>
                        <CTableBody>
                          {trialBalanceData.map((row, idx) => (
                            <CTableRow key={idx}>
                              <CTableDataCell className="fw-semibold text-uppercase">{row.head}</CTableDataCell>
                              <CTableDataCell className="text-end fw-bold">{row.debit > 0 ? row.debit.toLocaleString('en-IN') : '-'}</CTableDataCell>
                              <CTableDataCell className="text-end fw-bold">{row.credit > 0 ? row.credit.toLocaleString('en-IN') : '-'}</CTableDataCell>
                            </CTableRow>
                          ))}
                          <CTableRow className="fw-bold bg-light fs-5">
                            <CTableDataCell className="text-end text-uppercase">Total Ledger Matching</CTableDataCell>
                            <CTableDataCell className={`text-end border-top border-2 border-dark ${totals.dr === totals.cr ? 'text-success' : 'text-danger'}`}>
                              {totals.dr.toLocaleString('en-IN')}
                            </CTableDataCell>
                            <CTableDataCell className={`text-end border-top border-2 border-dark ${totals.dr === totals.cr ? 'text-success' : 'text-danger'}`}>
                              {totals.cr.toLocaleString('en-IN')}
                            </CTableDataCell>
                          </CTableRow>
                        </CTableBody>
                      </CTable>
                      {totals.dr !== totals.cr && (
                        <div className="text-danger fw-bold mt-2 text-end small">
                          * WARNING: Trial Balance mismatch. Check Master Journal for uneven manual entries.
                        </div>
                      )}
                    </>
                  )}

                  {statementType === 'BALANCE_SHEET' && (
                    <CTable bordered align="middle">
                      <CTableHead color="dark">
                        <CTableRow>
                          <CTableHeaderCell style={{width: '35%'}}>Liabilities</CTableHeaderCell>
                          <CTableHeaderCell className="text-end border-end border-2" style={{width: '15%'}}>Amount (₹)</CTableHeaderCell>
                          <CTableHeaderCell style={{width: '35%'}}>Assets</CTableHeaderCell>
                          <CTableHeaderCell className="text-end" style={{width: '15%'}}>Amount (₹)</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {reportData.map((row, idx) => (
                          <CTableRow key={idx}>
                            <CTableDataCell>{row.liability}</CTableDataCell>
                            {/* FIXED: Safely check if value exists before converting to string */}
                            <CTableDataCell className="text-end border-end border-2 fw-semibold">
                              {row.liabAmount ? row.liabAmount.toLocaleString('en-IN') : '-'}
                            </CTableDataCell>
                            <CTableDataCell>{row.asset}</CTableDataCell>
                            <CTableDataCell className="text-end fw-semibold">
                              {row.assetAmount ? row.assetAmount.toLocaleString('en-IN') : '-'}
                            </CTableDataCell>
                          </CTableRow>
                        ))}
                        <CTableRow className="fw-bold bg-light text-primary fs-5">
                          <CTableDataCell className="text-end text-uppercase">Total</CTableDataCell>
                          <CTableDataCell className="text-end border-end border-2 border-top border-dark">54,70,000</CTableDataCell>
                          <CTableDataCell className="text-end text-uppercase">Total</CTableDataCell>
                          <CTableDataCell className="text-end border-top border-dark">54,70,000</CTableDataCell>
                        </CTableRow>
                      </CTableBody>
                    </CTable>
                  )}

                  {statementType === 'INCOME_EXPENSE' && (
                     <CTable bordered align="middle">
                     <CTableHead color="dark">
                       <CTableRow>
                         <CTableHeaderCell style={{width: '35%'}}>Expenditure (Dr)</CTableHeaderCell>
                         <CTableHeaderCell className="text-end border-end border-2" style={{width: '15%'}}>Amount (₹)</CTableHeaderCell>
                         <CTableHeaderCell style={{width: '35%'}}>Income (Cr)</CTableHeaderCell>
                         <CTableHeaderCell className="text-end" style={{width: '15%'}}>Amount (₹)</CTableHeaderCell>
                       </CTableRow>
                     </CTableHead>
                     <CTableBody>
                       {reportData.map((row, idx) => (
                         <CTableRow key={idx}>
                           <CTableDataCell>{row.expense}</CTableDataCell>
                           <CTableDataCell className="text-end border-end border-2">
                             {row.expAmount ? row.expAmount.toLocaleString('en-IN') : '-'}
                           </CTableDataCell>
                           <CTableDataCell>{row.income}</CTableDataCell>
                           <CTableDataCell className="text-end">
                             {row.incAmount ? row.incAmount.toLocaleString('en-IN') : '-'}
                           </CTableDataCell>
                         </CTableRow>
                       ))}
                       <CTableRow>
                           <CTableDataCell className="fw-bold text-success">Net Surplus (Profit)</CTableDataCell>
                           <CTableDataCell className="text-end border-end border-2 fw-bold text-success">3,27,000</CTableDataCell>
                           <CTableDataCell></CTableDataCell>
                           <CTableDataCell></CTableDataCell>
                         </CTableRow>
                       <CTableRow className="fw-bold bg-light fs-5">
                         <CTableDataCell className="text-end text-uppercase">Total</CTableDataCell>
                         <CTableDataCell className="text-end border-end border-2 border-top border-dark">3,69,000</CTableDataCell>
                         <CTableDataCell className="text-end text-uppercase">Total</CTableDataCell>
                         <CTableDataCell className="text-end border-top border-dark">3,69,000</CTableDataCell>
                       </CTableRow>
                     </CTableBody>
                   </CTable>
                  )}

                </CCardBody>
              </CCard>
            </div>
          )}
        </CCol>
      </CRow>
    </>
  )
}

export default FinancialStatements
