import React, { useState } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CFormInput, CFormLabel,
  CInputGroup, CInputGroupText, CAlert, CBadge, CTable, CTableHead, CTableRow,
  CTableHeaderCell, CTableBody, CTableDataCell, CSpinner, CFormSelect
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilSettings, cilSave, cilWarning, cilWallet } from '@coreui/icons'

const RestructureLoans = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeLoan, setActiveLoan] = useState(null)

  // Restructure Form State
  const [newTenure, setNewTenure] = useState('')
  const [newInterestRate, setNewInterestRate] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Settlement via Savings State
  const [settlementData, setSettlementData] = useState({
    vendorNo: '',
    loanId: '',
    settlementSource: 'RD_BALANCE',
    amountToAdjust: ''
  })
  const [isSettling, setIsSettling] = useState(false)
  
  // Live Fetch State
  const [fetchedDetails, setFetchedDetails] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const GLOBAL_BACKEND_URL = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 
    'http://localhost:5000';

  // Mock Search Function for Restructure
  const handleSearch = () => {
    if (!searchQuery) return;
    setIsSearching(true)
    setTimeout(() => {
      setActiveLoan({
        loanId: 'LN-2026-1045',
        vendorNo: '1045',
        memberName: 'Amit Kumar',
        outstandingPrincipal: 65400,
        currentInterestRate: 10,
        currentTenureLeft: 14,
        currentEmi: 4614,
        status: 'ACTIVE'
      })
      setNewTenure(14)
      setNewInterestRate(10)
      setIsSearching(false)
    }, 800)
  }

  const calculateNewEmi = () => {
    const p = activeLoan?.outstandingPrincipal || 0
    const r = (parseFloat(newInterestRate) || 0) / 12 / 100
    const n = parseInt(newTenure) || 0
    if (p === 0 || r === 0 || n === 0) return 0
    const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    return Math.round(emi)
  }

  const handleRestructure = () => {
    if (!window.confirm("Are you sure you want to restructure this loan?")) return;
    setIsSaving(true)
    setTimeout(() => {
      alert(`Loan ${activeLoan.loanId} successfully restructured!`)
      setActiveLoan(null); setSearchQuery(''); setIsSaving(false);
    }, 1000)
  }

  // --- NEW: FETCH BALANCES LOGIC ---
  const handleFetchDetails = async () => {
    if (!settlementData.vendorNo || !settlementData.loanId) {
      alert("Please enter both Vendor Number and Loan ID first.");
      return;
    }
    setIsFetchingDetails(true);
    try {
      const res = await fetch(`${GLOBAL_BACKEND_URL}/api/loans/settle-lookup/${settlementData.vendorNo}/${settlementData.loanId}`);
      const result = await res.json();
      if (result.success) {
        setFetchedDetails(result.data);
      } else {
        alert(result.message || "Could not find records.");
        setFetchedDetails(null);
      }
    } catch (err) {
      console.error("Lookup error:", err);
      alert("Server error during balance lookup.");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  // --- NEW: OFFSET SUBMIT LOGIC ---
  const handleSavingsSettlement = async (e) => {
    e.preventDefault();
    if (!window.confirm("Are you sure you want to offset the loan using member savings? This action updates ledgers immediately via Contra-Adjustment.")) return;

    setIsSettling(true);
    try {
      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/loans/settle-via-savings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settlementData)
      });
      const data = await response.json();
      if (data.success) {
        alert(data.message);
        setSettlementData({ vendorNo: '', loanId: '', settlementSource: 'RD_BALANCE', amountToAdjust: '' });
        setFetchedDetails(null);
      } else {
        alert(data.message || "Failed to process settlement.");
      }
    } catch (err) {
      console.error("Settlement error:", err);
      alert("Server error during settlement process.");
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <>
      <CRow className="mb-4">
        <CCol xs={12}>
          <CCard className="shadow-sm border-top-dark border-top-3">
            <CCardHeader className="py-3 d-flex justify-content-between align-items-center">
              <h4 className="mb-0 d-flex align-items-center gap-2">
                <CIcon icon={cilSettings} className="text-dark" size="lg" />
                Restructure & Adjust Loans
              </h4>
            </CCardHeader>
            <CCardBody className="p-4">
              
              {/* Restructure Search Bar */}
              <CRow className="justify-content-center mb-5">
                <CCol md={8} lg={6}>
                  <CFormLabel className="fw-bold text-center w-100 mb-3">Search Active Loan by Vendor No.</CFormLabel>
                  <CInputGroup size="lg" className="shadow-sm">
                    <CInputGroupText className="bg-white"><CIcon icon={cilSearch}/></CInputGroupText>
                    <CFormInput 
                      placeholder="e.g., 1045..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <CButton color="dark" onClick={handleSearch} disabled={isSearching}>
                      {isSearching ? <CSpinner size="sm"/> : 'Find Loan'}
                    </CButton>
                  </CInputGroup>
                </CCol>
              </CRow>

              {/* Restructure Form Data */}
              {activeLoan && (
                <div className="animate__animated animate__fadeIn">
                  <h5 className="border-bottom pb-2 mb-4">Current Loan Status</h5>
                  <CTable bordered responsive align="middle" className="shadow-sm mb-4">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Loan ID</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Outstanding Principal</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Current EMI</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Months Left</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      <CTableRow>
                        <CTableDataCell className="fw-bold">{activeLoan.loanId}</CTableDataCell>
                        <CTableDataCell className="text-end fw-bold text-danger">₹{activeLoan.outstandingPrincipal.toLocaleString('en-IN')}</CTableDataCell>
                        <CTableDataCell className="text-center">₹{activeLoan.currentEmi.toLocaleString('en-IN')}</CTableDataCell>
                        <CTableDataCell className="text-center">{activeLoan.currentTenureLeft}</CTableDataCell>
                      </CTableRow>
                    </CTableBody>
                  </CTable>

                  <CCard className="bg-light border-0 shadow-sm mt-4">
                    <CCardBody className="p-4">
                      <CRow className="align-items-end">
                        <CCol md={4} className="mb-3 mb-md-0">
                          <CFormLabel className="fw-semibold">New Remaining Tenure (Months)</CFormLabel>
                          <CFormInput type="number" value={newTenure} onChange={(e) => setNewTenure(e.target.value)} />
                        </CCol>
                        <CCol md={4} className="mb-3 mb-md-0">
                          <CFormLabel className="fw-semibold">New Interest Rate (% p.a.)</CFormLabel>
                          <CFormInput type="number" value={newInterestRate} onChange={(e) => setNewInterestRate(e.target.value)} />
                        </CCol>
                        <CCol md={4}>
                          <CAlert color="info" className="mb-0 py-2 d-flex justify-content-between align-items-center">
                            <span className="small fw-bold">New EMI Preview:</span>
                            <span className="fs-5 fw-bold">₹{calculateNewEmi().toLocaleString('en-IN')}</span>
                          </CAlert>
                        </CCol>
                      </CRow>
                      <div className="text-end mt-4">
                        <CButton color="dark" onClick={handleRestructure} disabled={isSaving}>
                          <CIcon icon={cilSave} className="me-2"/> {isSaving ? 'Processing...' : 'Apply Restructure & Save'}
                        </CButton>
                      </div>
                    </CCardBody>
                  </CCard>
                </div>
              )}

              {/* ========================================== */}
              {/* NEW: OFFSET LOAN VIA RD / SHARE BALANCE FORM */}
              {/* ========================================== */}
              <CCard className="shadow-sm mt-5 border-top border-warning border-top-3">
                <CCardHeader className="bg-white py-3">
                  <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-dark">
                    <CIcon icon={cilWallet} className="text-warning" size="lg" />
                    Offset Loan via RD / Share Balance (Contra-Adjustment)
                  </h5>
                </CCardHeader>
                <CCardBody className="p-4">
                  <form onSubmit={handleSavingsSettlement} className="row g-3">
                    <div className="col-md-4">
                      <CFormLabel className="fw-semibold">Vendor Number</CFormLabel>
                      <CFormInput 
                        type="text" 
                        placeholder="e.g., 1042" 
                        value={settlementData.vendorNo}
                        onChange={(e) => setSettlementData({...settlementData, vendorNo: e.target.value})}
                        required 
                      />
                    </div>
                    <div className="col-md-4">
                      <CFormLabel className="fw-semibold">Loan ID</CFormLabel>
                      <CFormInput 
                        type="text" 
                        placeholder="e.g., 1042-1" 
                        value={settlementData.loanId}
                        onChange={(e) => setSettlementData({...settlementData, loanId: e.target.value})}
                        required 
                      />
                    </div>
                    <div className="col-md-4 d-flex align-items-end">
                      <CButton type="button" color="secondary" className="w-100 fw-bold text-white" onClick={handleFetchDetails} disabled={isFetchingDetails}>
                        {isFetchingDetails ? <CSpinner size="sm"/> : '🔍 Fetch Balances'}
                      </CButton>
                    </div>

                    {/* LIVE DISPLAY PANEL ONCE FETCHED */}
                    {fetchedDetails && (
                      <div className="col-12">
                        <CAlert color="info" className="d-flex justify-content-between align-items-center mb-0">
                          <div>
                            <strong>Member:</strong> {fetchedDetails.memberName} | <strong>Loan Status:</strong> <span className="badge bg-success">{fetchedDetails.loanStatus}</span>
                            <div className="mt-1 small text-dark">
                              <span><strong>Outstanding Principal:</strong> ₹{fetchedDetails.outstandingPrincipal.toLocaleString('en-IN')}</span> | &nbsp;
                              <span><strong>Available RD:</strong> ₹{fetchedDetails.rdBalance.toLocaleString('en-IN')}</span> | &nbsp;
                              <span><strong>Available Shares:</strong> ₹{fetchedDetails.shareCapital.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </CAlert>
                      </div>
                    )}

                    <div className="col-md-6">
                      <CFormLabel className="fw-semibold">Settlement Source</CFormLabel>
                      <CFormSelect 
                        value={settlementData.settlementSource}
                        onChange={(e) => setSettlementData({...settlementData, settlementSource: e.target.value})}
                      >
                        <option value="RD_BALANCE">Recurring Deposit (RD) Balance {fetchedDetails ? `(Available: ₹${fetchedDetails.rdBalance})` : ''}</option>
                        <option value="SHARE_CAPITAL">Share Capital Money {fetchedDetails ? `(Available: ₹${fetchedDetails.shareCapital})` : ''}</option>
                      </CFormSelect>
                    </div>
                    <div className="col-md-6">
                      <CFormLabel className="fw-semibold">Amount to Offset (₹)</CFormLabel>
                      <CFormInput 
                        type="number" 
                        placeholder="0.00" 
                        value={settlementData.amountToAdjust}
                        onChange={(e) => setSettlementData({...settlementData, amountToAdjust: e.target.value})}
                        required 
                      />
                    </div>

                    <div className="col-12 text-end mt-4">
                      <CButton type="submit" color="warning" className="fw-bold px-4 text-dark shadow-sm" disabled={isSettling || !fetchedDetails}>
                        {isSettling ? <><CSpinner size="sm" className="me-2"/> Processing Offset...</> : 'Execute Contra-Adjustment'}
                      </CButton>
                    </div>
                  </form>
                </CCardBody>
              </CCard>

            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </>
  )
}

export default RestructureLoans
