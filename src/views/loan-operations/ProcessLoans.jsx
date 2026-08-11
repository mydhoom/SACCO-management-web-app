import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CFormInput, CFormLabel, CAlert,
  CFormSelect, CSpinner
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBank, cilCheckCircle, cilXCircle, cilSend } from '@coreui/icons'

// ==========================================
// EMBEDDED DISBURSAL COMPONENT
// ==========================================
const AdminDisbursalAction = ({ memberName, approvedAmount, onDisburse, isProcessing }) => {
  const [transferMode, setTransferMode] = useState('CHEQUE');
  const [referenceNo, setReferenceNo] = useState('');

  const handleDisbursal = () => {
    if (!referenceNo.trim()) return alert("You must provide the Cheque Number or UPI UTR.");
    onDisburse({ transferMode, referenceNo });
  };

  return (
    <CCard className="shadow-sm border-top-danger border-top-3 mt-4">
      <CCardBody className="p-4 bg-light">
        <h5 className="fw-bold text-dark mb-2"><CIcon icon={cilBank} className="me-2"/>Execute Fund Transfer</h5>
        <p className="small text-muted mb-4">
          Transfer <strong>₹{Number(approvedAmount).toLocaleString('en-IN')}</strong> to {memberName} manually via Cheque or UPI, then record the reference below to officially update the Master Journal.
        </p>
        
        <CRow className="g-3">
          <CCol md={5}>
            <label className="form-label small fw-bold">Transfer Mode</label>
            <CFormSelect value={transferMode} onChange={(e) => setTransferMode(e.target.value)} className="shadow-sm">
              <option value="CHEQUE">Physical Cheque</option>
              <option value="UPI">Manual UPI Transfer</option>
            </CFormSelect>
          </CCol>

          <CCol md={7}>
            <label className="form-label small fw-bold">
              {transferMode === 'CHEQUE' ? 'Cheque Number *' : 'Bank UTR / Ref Number *'}
            </label>
            <CFormInput 
              type="text" 
              placeholder={transferMode === 'CHEQUE' ? "e.g. 000123" : "e.g. 319283746510"}
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="fw-bold font-monospace shadow-sm"
            />
          </CCol>
        </CRow>

        <CButton 
          color="danger" 
          className="w-100 fw-bold text-white shadow-sm mt-4"
          onClick={handleDisbursal}
          disabled={isProcessing || !referenceNo}
        >
          {isProcessing ? <><CSpinner size="sm" className="me-2"/>Processing Ledger...</> : <><CIcon icon={cilSend} className="me-2"/> Record Disbursal & Update Ledger</>}
        </CButton>
      </CCardBody>
    </CCard>
  );
};

// ==========================================
// MAIN PROCESS LOANS COMPONENT
// ==========================================
const ProcessLoans = () => {
  // ---> ADDED THESE TWO LINES TO FIX THE REFERENCE ERROR <---
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000';
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');

  const [pendingApplications, setPendingApplications] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [reviewModal, setReviewModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Editable fields for the Admin during approval
  const [approvedAmount, setApprovedAmount] = useState('')
  const [interestRate, setInterestRate] = useState('10') // Standard Society Rate
  const [tenureMonths, setTenureMonths] = useState('')

  // Mock Data (Replace this with a fetch() to your backend later)
  useEffect(() => {
    setPendingApplications([
      {
        applicationId: 'APP-2026-891',
        vendorNo: '1045',
        memberName: 'Amit Kumar',
        requestedAmount: 100000,
        purpose: 'Home Renovation',
        requestedTenure: 24,
        dateApplied: '2026-07-25',
        status: 'PENDING',
        currentShareBalance: 25000,
        currentSavingsBalance: 12500
      },
      {
        applicationId: 'APP-2026-892',
        vendorNo: '2088',
        memberName: 'Sunita Sharma',
        requestedAmount: 50000,
        purpose: 'Medical Emergency',
        requestedTenure: 12,
        dateApplied: '2026-07-27',
        status: 'PENDING',
        currentShareBalance: 15000,
        currentSavingsBalance: 8000
      }
    ])
  }, [])

  const openReviewModal = (app) => {
    setSelectedApp(app)
    setApprovedAmount(app.requestedAmount)
    setTenureMonths(app.requestedTenure)
    setInterestRate('10') 
    setReviewModal(true)
  }

  // EMI Calculation Preview
  const calculateEMIPreview = () => {
    const p = parseFloat(approvedAmount) || 0
    const r = (parseFloat(interestRate) || 0) / 12 / 100
    const n = parseInt(tenureMonths) || 0
    if (p === 0 || r === 0 || n === 0) return 0
    const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    return Math.round(emi)
  }

  // UPDATED: Now receives the disbursal payload and hits the correct existing PUT route
  const handleApproveDisburse = async (disbursalData) => {
    if (!window.confirm("Are you sure you want to approve this loan? Funds will be marked as disbursed and added to the Master Journal.")) return;
    
    setIsProcessing(true);
    
    try {
      const payload = {
        status: 'APPROVED', 
        loanId: selectedApp.applicationId, 
        approvedAmount: Number(approvedAmount),
        interestRate: Number(interestRate),
        tenure: Number(tenureMonths),
        transferMode: disbursalData.transferMode,
        referenceNumber: disbursalData.referenceNo
      };

      const response = await fetch(`${apiBase}/api/loans/${selectedApp.applicationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Failed to disburse loan on backend.");

      alert(`Loan Approved! ₹${Number(approvedAmount).toLocaleString('en-IN')} has been disbursed via ${disbursalData.transferMode} (Ref: ${disbursalData.referenceNo}).`);
      
      // Remove the approved loan from the pending list
      setPendingApplications(pendingApplications.filter(app => app.applicationId !== selectedApp.applicationId));
      setReviewModal(false);
      
    } catch (error) {
      console.error("Disbursal Error:", error);
      alert("Error disbursing loan. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <>
      <CRow>
        <CCol xs={12}>
          <CCard className="shadow-sm border-top-primary border-top-3">
            <CCardHeader className="py-3 d-flex justify-content-between align-items-center">
              <h4 className="mb-0 d-flex align-items-center gap-2">
                <CIcon icon={cilBank} className="text-primary" size="lg" />
                Process New Loan Applications
              </h4>
              <CBadge color="danger" shape="rounded-pill" className="fs-6 shadow-sm">
                {pendingApplications.length} Pending
              </CBadge>
            </CCardHeader>
            <CCardBody className="p-4">
              {pendingApplications.length === 0 ? (
                <div className="text-center py-5 text-medium-emphasis">
                  <h5>No new loan applications to process.</h5>
                </div>
              ) : (
                <div className="table-responsive">
                  <CTable hover align="middle" className="border shadow-sm mb-0 bg-white">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                        <CTableHeaderCell>Member Name</CTableHeaderCell>
                        <CTableHeaderCell>Purpose</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Requested (₹)</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Status</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {pendingApplications.map((app) => (
                        <CTableRow key={app.applicationId}>
                          <CTableDataCell className="text-muted fw-bold">{new Date(app.dateApplied).toLocaleDateString('en-IN')}</CTableDataCell>
                          <CTableDataCell><strong>{app.vendorNo}</strong></CTableDataCell>
                          <CTableDataCell className="fw-bold text-dark">{app.memberName}</CTableDataCell>
                          <CTableDataCell>{app.purpose}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-primary">
                            ₹{app.requestedAmount.toLocaleString('en-IN')}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            <CBadge color="warning" className="text-dark">PENDING</CBadge>
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            <CButton color="primary" size="sm" className="fw-bold px-3 shadow-sm" onClick={() => openReviewModal(app)}>
                              Review
                            </CButton>
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* Admin Review & Approval Modal */}
      <CModal visible={reviewModal} onClose={() => setReviewModal(false)} backdrop="static" size="lg" alignment="center">
        <CModalHeader className="bg-light">
          <CModalTitle className="fw-bold">Review Loan Application</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4 bg-white">
          {selectedApp && (
            <>
              {/* Member Financial Snapshot */}
              <CRow className="mb-4 bg-info bg-opacity-10 border border-info rounded p-3 mx-0 shadow-sm">
                <CCol md={6}>
                  <div className="small fw-bold text-info text-uppercase">Applicant</div>
                  <h5 className="mb-1 text-dark fw-bold">{selectedApp.memberName} (Vendor: {selectedApp.vendorNo})</h5>
                  <div className="small text-dark">Purpose: {selectedApp.purpose}</div>
                </CCol>
                <CCol md={3} className="border-start border-info text-md-center mt-3 mt-md-0">
                  <div className="small fw-bold text-info text-uppercase">Share Capital</div>
                  <h5 className="mb-0 text-dark fw-bold">₹{selectedApp.currentShareBalance.toLocaleString('en-IN')}</h5>
                </CCol>
                <CCol md={3} className="border-start border-info text-md-center mt-3 mt-md-0">
                  <div className="small fw-bold text-info text-uppercase">Savings Bal</div>
                  <h5 className="mb-0 text-dark fw-bold">₹{selectedApp.currentSavingsBalance.toLocaleString('en-IN')}</h5>
                </CCol>
              </CRow>

              <h5 className="border-bottom pb-2 mb-4 fw-bold text-dark">Final Approval Terms</h5>
              
              <CRow className="mb-4">
                <CCol md={4}>
                  <CFormLabel className="fw-bold text-dark">Approved Amount (₹)</CFormLabel>
                  <CFormInput 
                    type="number" 
                    value={approvedAmount} 
                    onChange={(e) => setApprovedAmount(e.target.value)} 
                    className="shadow-sm fw-bold"
                  />
                  <div className="small text-muted mt-1">Requested: ₹{selectedApp.requestedAmount.toLocaleString('en-IN')}</div>
                </CCol>
                <CCol md={4}>
                  <CFormLabel className="fw-bold text-dark">Tenure (Months)</CFormLabel>
                  <CFormInput 
                    type="number" 
                    value={tenureMonths} 
                    onChange={(e) => setTenureMonths(e.target.value)} 
                    className="shadow-sm fw-bold"
                  />
                  <div className="small text-muted mt-1">Requested: {selectedApp.requestedTenure} months</div>
                </CCol>
                <CCol md={4}>
                  <CFormLabel className="fw-bold text-dark">Interest Rate (% p.a.)</CFormLabel>
                  <CFormInput 
                    type="number" 
                    value={interestRate} 
                    onChange={(e) => setInterestRate(e.target.value)} 
                    className="shadow-sm fw-bold"
                  />
                </CCol>
              </CRow>

              <CAlert color="success" className="d-flex align-items-center justify-content-between mb-0 border border-success shadow-sm">
                <div>
                  <h6 className="mb-0 fw-bold">Generated EMI Preview:</h6>
                  <small>Based on reducing balance</small>
                </div>
                <h4 className="mb-0 fw-bold">₹{calculateEMIPreview().toLocaleString('en-IN')} / month</h4>
              </CAlert>

              {/* INJECTED DISBURSAL COMPONENT */}
              <AdminDisbursalAction 
                memberName={selectedApp.memberName} 
                approvedAmount={approvedAmount} 
                onDisburse={handleApproveDisburse}
                isProcessing={isProcessing}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter className="bg-light border-top-0 pt-0">
          <CButton color="secondary" variant="ghost" className="fw-bold w-100" onClick={() => setReviewModal(false)} disabled={isProcessing}>
            <CIcon icon={cilXCircle} className="me-1"/> Cancel & Close
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default ProcessLoans
