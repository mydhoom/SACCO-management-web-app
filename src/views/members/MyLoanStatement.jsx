import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CFormSelect, CFormInput, CFormLabel
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWallet, cilCloudUpload } from '@coreui/icons'

const MyLoanStatement = () => {
  const [activeLoan, setActiveLoan] = useState(null)
  const [payNowModal, setPayNowModal] = useState(false)
  const [selectedEmi, setSelectedEmi] = useState(null)
  const [paymentMode, setPaymentMode] = useState('ONLINE_TRANSFER') 
  const [paymentDetails, setPaymentDetails] = useState({ referenceNumber: '', proofDocument: null })
  const [isProcessing, setIsProcessing] = useState(false)

  // Mock Fetch (Replace with fetch('/api/loans/my-statement'))
  useEffect(() => {
    setActiveLoan({
      loanAccountNo: '456-1',
      outstandingPrincipal: 45800,
      annualInterestRate: 10,
      schedule: [
        { id: 1, dueDate: '2026-05-01', emi: 2500, principal: 2083, interest: 417, status: 'PAID' },
        { id: 2, dueDate: '2026-06-01', emi: 2500, principal: 2100, interest: 400, status: 'DUE' }, 
        { id: 3, dueDate: '2026-07-01', emi: 2500, principal: 2117, interest: 383, status: 'PENDING' }
      ]
    })
  }, [])

  const triggerPayNow = (emiRecord) => {
    setSelectedEmi(emiRecord)
    setPaymentMode('ONLINE_TRANSFER')
    setPaymentDetails({ referenceNumber: '', proofDocument: null })
    setPayNowModal(true)
  }

  const handleMemberPayment = async () => {
    setIsProcessing(true)
    let uploadedImageUrl = null;

    // Direct Cloudinary Upload for Member Proof
    if (paymentDetails.proofDocument) {
      const cloudinaryFormData = new FormData();
      cloudinaryFormData.append('file', paymentDetails.proofDocument);
      cloudinaryFormData.append('upload_preset', 'ml_default');
      cloudinaryFormData.append('cloud_name', 'wh9h0wvu');

      try {
        const cloudinaryRes = await fetch('https://api.cloudinary.com/v1_1/wh9h0wvu/image/upload', {
          method: 'POST',
          body: cloudinaryFormData
        });
        const cloudData = await cloudinaryRes.json();
        uploadedImageUrl = cloudData.secure_url;
      } catch (err) {
        alert("Failed to upload document.");
        setIsProcessing(false);
        return;
      }
    }

    // Payload to send to backend /api/loans/process-emi
    const emiPayload = {
      vendorNo: '456', // Pulled from their logged-in token context in reality
      emiAmount: selectedEmi.emi, 
      annualInterestRate: activeLoan.annualInterestRate,
      isLatePayment: false, // System determines this automatically on backend based on date
      paymentMode: paymentMode,
      referenceNumber: paymentDetails.referenceNumber,
      documentProofUrl: uploadedImageUrl
    };

    setTimeout(() => {
      alert(`Payment submitted successfully! It has been sent to the Admin for clearance.`)
      setIsProcessing(false)
      setPayNowModal(false)
    }, 1000)
  }

  return (
    <>
      <CRow className="mb-4">
        <CCol xs={12}>
          <CCard className="shadow-sm border-top-primary border-top-3">
            <CCardHeader className="py-3">
              <h4 className="mb-0 d-flex align-items-center gap-2">
                <CIcon icon={cilWallet} className="text-primary" size="lg" />
                My Loan Statement
              </h4>
            </CCardHeader>

            <CCardBody className="p-4">
              {activeLoan && (
                <div className="animate__animated animate__fadeIn">
                  <CRow className="mb-4 align-items-center bg-light border rounded p-3 mx-0">
                    <CCol md={6}>
                      <div className="text-medium-emphasis">Loan A/C: <strong>{activeLoan.loanAccountNo}</strong></div>
                      <div className="text-medium-emphasis small">Interest Rate: {activeLoan.annualInterestRate}% p.a.</div>
                    </CCol>
                    <CCol md={6} className="text-md-end mt-3 mt-md-0">
                      <div className="text-medium-emphasis small">Outstanding Principal</div>
                      <h3 className="text-danger fw-bold mb-0">₹{activeLoan.outstandingPrincipal.toLocaleString('en-IN')}</h3>
                    </CCol>
                  </CRow>

                  <h5 className="mb-3 border-bottom pb-2">Repayment Schedule</h5>
                  <CTable hover responsive align="middle" className="border">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>#</CTableHeaderCell>
                        <CTableHeaderCell>Due Date</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">EMI Amount</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Status</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {activeLoan.schedule.map((row) => (
                        <CTableRow key={row.id} color={row.status === 'DUE' ? 'warning' : ''}>
                          <CTableDataCell><strong>{row.id}</strong></CTableDataCell>
                          <CTableDataCell>{new Date(row.dueDate).toLocaleDateString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold">₹{row.emi.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-center">
                            {row.status === 'PAID' && <CBadge color="success">PAID</CBadge>}
                            {row.status === 'DUE' && <CBadge color="warning" className="text-dark">DUE NOW</CBadge>}
                            {row.status === 'PENDING' && <CBadge color="secondary">UPCOMING</CBadge>}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            {row.status === 'DUE' && (
                              <CButton color="primary" size="sm" className="fw-bold px-3 shadow-sm" onClick={() => triggerPayNow(row)}>
                                Pay Now
                              </CButton>
                            )}
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

      {/* Member Payment Modal */}
      <CModal visible={payNowModal} onClose={() => setPayNowModal(false)} backdrop="static" alignment="center">
        <CModalHeader>
          <CModalTitle className="text-primary fw-bold">Submit EMI Payment</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {selectedEmi && (
            <>
              <div className="d-flex justify-content-between mb-4 bg-light p-3 rounded">
                <span className="fw-bold">Amount Due:</span>
                <h4 className="text-primary mb-0 fw-bold">₹{selectedEmi.emi.toLocaleString('en-IN')}</h4>
              </div>

              <div className="mb-3">
                <label className="form-label fw-bold text-dark mb-2">How did you pay?</label>
                <CFormSelect value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="ONLINE_TRANSFER">Online Transfer (NEFT / UPI)</option>
                  <option value="CHEQUE">Deposited a Cheque</option>
                  <option value="CASH">Deposited Cash in Bank</option>
                </CFormSelect>
              </div>

              <div className="border border-info rounded p-3 bg-info bg-opacity-10 mb-2">
                <h6 className="text-info fw-bold mb-3"><CIcon icon={cilCloudUpload} className="me-2"/>Provide Payment Proof</h6>
                <CFormLabel className="small">Transaction / Cheque Number</CFormLabel>
                <CFormInput className="mb-3" placeholder="Enter Ref No..." value={paymentDetails.referenceNumber} onChange={(e) => setPaymentDetails({...paymentDetails, referenceNumber: e.target.value})} />
                
                <CFormLabel className="small">Upload Screenshot or Receipt</CFormLabel>
                <CFormInput type="file" onChange={(e) => setPaymentDetails({...paymentDetails, proofDocument: e.target.files[0]})} />
              </div>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setPayNowModal(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleMemberPayment} disabled={isProcessing || !paymentDetails.referenceNumber} className="px-4 fw-bold">
            Submit for Clearance
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default MyLoanStatement