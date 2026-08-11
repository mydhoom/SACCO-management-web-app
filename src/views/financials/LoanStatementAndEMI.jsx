import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CFormSwitch, CInputGroup,
  CFormInput, CInputGroupText, CAlert, CSpinner, CFormSelect, CFormLabel
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMoney, cilCheckCircle, cilWarning, cilSearch, cilBan, cilWallet, cilCloudUpload, cilCloudDownload } from '@coreui/icons'
import { generatePDF } from '../../utils/pdfGenerator'

const LoanStatementAndEMI = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeLoan, setActiveLoan] = useState(null)

  // Modals
  const [payNowModal, setPayNowModal] = useState(false)
  const [fullSettlementModal, setFullSettlementModal] = useState(false)
  const [selectedEmi, setSelectedEmi] = useState(null)
  
  // Payment States
  const [isLate, setIsLate] = useState(false)
  const [paymentMode, setPaymentMode] = useState('SALARY_DEDUCTION') 
  const [isProcessing, setIsProcessing] = useState(false)

  // Audit Trail States for Manual Payments
  const [paymentDetails, setPaymentDetails] = useState({
    amountPaid: '',
    paymentDate: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    proofDocument: null
  })

  // Set default amount when an EMI is selected
  useEffect(() => {
    if (selectedEmi) {
      setPaymentDetails(prev => ({ ...prev, amountPaid: selectedEmi.emi }))
    }
  }, [selectedEmi])

  // Dynamic Labels based on Payment Mode
  const getAuditLabels = () => {
    switch(paymentMode) {
      case 'CHEQUE': return { ref: 'Cheque Number', file: 'Upload Scanned Cheque' }
      case 'CASH': return { ref: 'Receipt Number', file: 'Upload Deposit Slip (Optional)' }
      case 'ONLINE_TRANSFER': return { ref: 'Transaction / UTR ID', file: 'Upload Screenshot' }
      default: return { ref: 'Reference No', file: 'Upload Proof' }
    }
  }

  // --- MOCK DATA: Simulating a fetched loan statement ---
  const handleSearch = () => {
    setIsSearching(true)
    setTimeout(() => {
      setActiveLoan({
        vendorNo: '456',
        memberName: 'Rahul Sharma',
        loanAccountNo: '456-1',
        totalLoanAmount: 50000,
        outstandingPrincipal: 45817, 
        annualInterestRate: 10,
        status: 'ACTIVE',
        // UPGRADE: Added "balance" to the mock data to track the reducing principal
        schedule: [
          { id: 1, dueDate: '2026-05-01', paidDate: '2026-05-02', emi: 2500, principal: 2083, interest: 417, balance: 47917, status: 'PAID' },
          { id: 2, dueDate: '2026-06-01', paidDate: null, emi: 2500, principal: 2100, interest: 400, balance: 45817, status: 'DUE' }, 
          { id: 3, dueDate: '2026-07-01', paidDate: null, emi: 2500, principal: 2117, interest: 383, balance: 43700, status: 'PENDING' },
          { id: 4, dueDate: '2026-08-01', paidDate: null, emi: 2500, principal: 2135, interest: 365, balance: 41565, status: 'PENDING' }
        ]
      })
      setIsSearching(false)
    }, 800)
  }

  const handleDownloadPDF = async () => {
    if (!activeLoan) return;

    const columns = ['#', 'Due Date', 'Total EMI', 'Principal', 'Interest', 'Balance', 'Paid On', 'Status'];
    const data = activeLoan.schedule.map(row => [
      row.id.toString(),
      new Date(row.dueDate).toLocaleDateString('en-IN'),
      `Rs ${row.emi.toLocaleString('en-IN')}`,
      `Rs ${row.principal.toLocaleString('en-IN')}`,
      `Rs ${row.interest.toLocaleString('en-IN')}`,
      `Rs ${row.balance.toLocaleString('en-IN')}`,
      row.paidDate ? new Date(row.paidDate).toLocaleDateString('en-IN') : '-',
      row.status
    ]);

    await generatePDF({
      title: 'Loan Statement & Ledger',
      subtitle: `Member: ${activeLoan.memberName} | Loan A/C: ${activeLoan.loanAccountNo} | Vendor No: ${activeLoan.vendorNo}`,
      filename: `Loan_Statement_${activeLoan.loanAccountNo}.pdf`,
      columns,
      data,
      summaryData: [
        `Total Loan Amount: Rs ${activeLoan.totalLoanAmount.toLocaleString('en-IN')}`,
        `Outstanding Principal: Rs ${activeLoan.outstandingPrincipal.toLocaleString('en-IN')}`,
        `Annual Interest Rate: ${activeLoan.annualInterestRate}%`,
        `Current Status: ${activeLoan.status}`
      ]
    });
  };

  const triggerPayNow = (emiRecord) => {
    setSelectedEmi(emiRecord)
    setIsLate(false)
    setPaymentMode('SALARY_DEDUCTION') 
    setPaymentDetails({
      amountPaid: emiRecord.emi,
      paymentDate: new Date().toISOString().split('T')[0],
      referenceNumber: '',
      proofDocument: null
    })
    setPayNowModal(true)
  }

  // --- SUBMIT: Process Standard EMI (Now with direct Cloudinary Upload) ---
  const submitEmiPayment = async () => {
    setIsProcessing(true)
    let uploadedImageUrl = null;

    if (['CASH', 'CHEQUE', 'ONLINE_TRANSFER'].includes(paymentMode) && paymentDetails.proofDocument) {
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
        
        if (cloudData.secure_url) {
          uploadedImageUrl = cloudData.secure_url; 
        } else {
          throw new Error("Cloudinary did not return a secure URL");
        }
      } catch (err) {
        console.error("Cloudinary Upload Error:", err);
        alert("Failed to upload the document to the cloud. Please try again.");
        setIsProcessing(false);
        return; 
      }
    }

    const emiPayload = {
      vendorNo: activeLoan.vendorNo,
      emiAmount: paymentDetails.amountPaid, 
      annualInterestRate: activeLoan.annualInterestRate,
      isLatePayment: isLate,
      paymentMode: paymentMode,
      paymentDate: paymentDetails.paymentDate,
      referenceNumber: paymentDetails.referenceNumber,
      documentProofUrl: uploadedImageUrl 
    };

    try {
      setTimeout(() => {
        if (paymentMode === 'CHEQUE') {
          alert(`Success! EMI of ₹${paymentDetails.amountPaid} logged as PENDING (Awaiting Cheque Clearance).\n\nDocument saved to Cloudinary!`);
        } else {
          alert(`Success! EMI of ₹${paymentDetails.amountPaid} collected via ${paymentMode.replace('_', ' ')} and cleared.`);
        }
        setIsProcessing(false);
        setPayNowModal(false);
      }, 1000);

    } catch (error) {
      console.error("EMI Processing Error:", error);
      alert("An error occurred while processing the EMI on the server.");
      setIsProcessing(false);
    }
  }

  const submitFullSettlement = async () => {
    setIsProcessing(true)
    setTimeout(() => {
      alert(`Success! Loan ${activeLoan.loanAccountNo} has been fully settled and CLOSED.`)
      setIsProcessing(false)
      setFullSettlementModal(false)
      setActiveLoan(null)
    }, 1000)
  }

  return (
    <>
      <CRow className="mb-4">
        <CCol xs={12}>
          <CCard className="shadow-sm border-top-primary border-top-3">
            <CCardHeader className="py-3 d-flex justify-content-between align-items-center">
              <h4 className="mb-0 d-flex align-items-center gap-2">
                <CIcon icon={cilWallet} className="text-primary" size="lg" />
                Loan EMI & Statement Management
              </h4>
            </CCardHeader>

            <CCardBody className="p-4">
              <div className="d-flex gap-2 mb-4 bg-light p-3 rounded align-items-end" style={{ maxWidth: '600px' }}>
                <div className="flex-grow-1">
                  <label className="form-label small fw-bold">Search Loan A/C or Vendor No.</label>
                  <CInputGroup>
                    <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
                    <CFormInput 
                      placeholder="e.g. 456 or 456-1" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                  </CInputGroup>
                </div>
                <CButton color="primary" onClick={handleSearch} disabled={isSearching || !searchTerm}>
                  {isSearching ? <CSpinner size="sm"/> : 'Fetch Ledger'}
                </CButton>
              </div>

              {activeLoan && (
                <div className="animate__animated animate__fadeIn">
                  {/* UPGRADE: Explicitly tagging the Outstanding Principal */}
                  <CRow className="mb-4 align-items-center bg-white border rounded shadow-sm p-3 mx-0">
                    <CCol md={6}>
                      <h4 className="mb-1 text-primary fw-bold">{activeLoan.memberName}</h4>
                      <div className="text-medium-emphasis">
                        Vendor No: <strong>{activeLoan.vendorNo}</strong> | Loan A/C: <strong>{activeLoan.loanAccountNo}</strong>
                      </div>
                    </CCol>
                    <CCol md={3} className="text-md-center mt-3 mt-md-0 border-start border-end">
                      <div className="text-primary small fw-bold text-uppercase">Outstanding Principal (Folio 152)</div>
                      <h3 className="text-primary fw-bold mb-0">₹{activeLoan.outstandingPrincipal.toLocaleString('en-IN')}</h3>
                    </CCol>
                    <CCol md={3} className="text-md-end mt-3 mt-md-0 d-flex flex-column gap-2">
                      <CButton color="primary" variant="outline" className="fw-bold w-100 py-2" onClick={handleDownloadPDF}>
                        <CIcon icon={cilCloudDownload} className="me-2"/>
                        Download Statement
                      </CButton>
                      <CButton color="danger" className="text-white fw-bold shadow-sm w-100 py-2" onClick={() => setFullSettlementModal(true)}>
                        <CIcon icon={cilMoney} className="me-2"/>
                        Pay Full & Final
                      </CButton>
                    </CCol>
                  </CRow>

                  <h5 className="mb-3 border-bottom pb-2">Amortization & Payment Schedule</h5>
                  <CTable hover responsive align="middle" className="border">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>#</CTableHeaderCell>
                        <CTableHeaderCell>Due Date</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Total EMI</CTableHeaderCell>
                        {/* UPGRADE: Explicitly separated and color-coded headers */}
                        <CTableHeaderCell className="text-end text-success">Principal (Folio 152)</CTableHeaderCell>
                        <CTableHeaderCell className="text-end text-warning text-dark">Interest (Folio 153)</CTableHeaderCell>
                        <CTableHeaderCell className="text-end bg-light">Principal Balance</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Paid On</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Status</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {activeLoan.schedule.map((row) => (
                        <CTableRow key={row.id} color={row.status === 'DUE' ? 'warning' : ''}>
                          <CTableDataCell><strong>{row.id}</strong></CTableDataCell>
                          <CTableDataCell className="fw-semibold">{new Date(row.dueDate).toLocaleDateString('en-IN')}</CTableDataCell>
                          
                          {/* UPGRADE: Enhanced visual styling for the money columns */}
                          <CTableDataCell className="text-end fw-bold">₹{row.emi.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end text-success fw-semibold">₹{row.principal.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end text-warning text-dark fw-semibold">₹{row.interest.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold bg-light">₹{row.balance.toLocaleString('en-IN')}</CTableDataCell>
                          
                          <CTableDataCell className="text-center">{row.paidDate ? new Date(row.paidDate).toLocaleDateString('en-IN') : '-'}</CTableDataCell>
                          <CTableDataCell className="text-center">
                            {row.status === 'PAID' && <CBadge color="success">PAID</CBadge>}
                            {row.status === 'DUE' && <CBadge color="warning" className="text-dark">DUE NOW</CBadge>}
                            {row.status === 'PENDING' && <CBadge color="secondary">UPCOMING</CBadge>}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            {row.status === 'DUE' ? (
                              <CButton color="primary" size="sm" className="fw-bold px-3 shadow-sm" onClick={() => triggerPayNow(row)}>Pay Now</CButton>
                            ) : (
                              <CButton color="secondary" size="sm" disabled variant="outline">
                                {row.status === 'PAID' ? 'Cleared' : 'Locked'}
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

      {/* --- MODAL 1: PAY SINGLE EMI --- */}
      <CModal visible={payNowModal} onClose={() => setPayNowModal(false)} backdrop="static" alignment="center">
        <CModalHeader>
          <CModalTitle className="text-primary fw-bold">Process EMI Payment</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {selectedEmi && (
            <>
              <div className="d-flex justify-content-between mb-3 border-bottom pb-2">
                <span className="text-medium-emphasis">Due Date:</span>
                <strong className="text-dark">{new Date(selectedEmi.dueDate).toLocaleDateString('en-IN')}</strong>
              </div>
              
              <div className="mb-4">
                <label className="form-label fw-bold text-dark mb-2">Select Payment Mode</label>
                <CFormSelect 
                  size="lg" 
                  value={paymentMode} 
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option value="SALARY_DEDUCTION">Salary Deduction (Bulk/Standard)</option>
                  <option value="CASH">Cash Deposit</option>
                  <option value="ONLINE_TRANSFER">Online / UPI / NEFT</option>
                  <option value="CHEQUE">Cheque</option>
                </CFormSelect>
              </div>

              {['CASH', 'CHEQUE', 'ONLINE_TRANSFER'].includes(paymentMode) && (
                <div className="border border-info rounded p-3 bg-info bg-opacity-10 mb-4 animate__animated animate__fadeIn">
                  <h6 className="text-info fw-bold mb-3"><CIcon icon={cilCloudUpload} className="me-2"/>Manual Entry Audit Trail</h6>
                  <CRow>
                    <CCol sm={6} className="mb-3">
                      <CFormLabel className="small">{getAuditLabels().ref}</CFormLabel>
                      <CFormInput 
                        placeholder="Enter Number..." 
                        value={paymentDetails.referenceNumber}
                        onChange={(e) => setPaymentDetails({...paymentDetails, referenceNumber: e.target.value})}
                      />
                    </CCol>
                    <CCol sm={6} className="mb-3">
                      <CFormLabel className="small">Actual Payment Date</CFormLabel>
                      <CFormInput 
                        type="date" 
                        value={paymentDetails.paymentDate}
                        onChange={(e) => setPaymentDetails({...paymentDetails, paymentDate: e.target.value})}
                      />
                    </CCol>
                    <CCol sm={12} className="mb-3">
                      <CFormLabel className="small">Amount Received (₹)</CFormLabel>
                      <CFormInput 
                        type="number" 
                        value={paymentDetails.amountPaid}
                        onChange={(e) => setPaymentDetails({...paymentDetails, amountPaid: e.target.value})}
                      />
                      <small className="text-muted d-block mt-1">Defaults to standard EMI. Modify only if member paid a different amount.</small>
                    </CCol>
                    <CCol sm={12}>
                      <CFormLabel className="small">{getAuditLabels().file}</CFormLabel>
                      <CFormInput 
                        type="file" 
                        onChange={(e) => setPaymentDetails({...paymentDetails, proofDocument: e.target.files[0]})}
                      />
                    </CCol>
                  </CRow>
                </div>
              )}

              <div className="border border-warning rounded p-3 bg-warning bg-opacity-10">
                <CFormSwitch 
                  size="lg" 
                  id="latePenaltySwitch" 
                  label={<span className="fw-bold text-dark ms-2">Apply Late Payment Penalty</span>}
                  checked={isLate}
                  onChange={(e) => setIsLate(e.target.checked)}
                />
              </div>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setPayNowModal(false)}>Cancel</CButton>
          <CButton color="primary" onClick={submitEmiPayment} disabled={isProcessing} className="px-4 fw-bold text-white">
            {isProcessing ? <CSpinner size="sm" /> : `Collect ₹${isLate ? Number(paymentDetails.amountPaid) + 200 : paymentDetails.amountPaid}`}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* --- MODAL 2: FULL & FINAL SETTLEMENT --- */}
      <CModal visible={fullSettlementModal} onClose={() => setFullSettlementModal(false)} backdrop="static" alignment="center">
        <CModalHeader className="bg-danger text-white">
          <CModalTitle className="fw-bold">Full & Final Loan Settlement</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
           <h4 className="text-center text-danger my-4">Feature identical to standard pay, utilizing full balance!</h4>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setFullSettlementModal(false)}>Cancel</CButton>
          <CButton color="danger" onClick={submitFullSettlement} disabled={isProcessing} className="px-4 fw-bold text-white">
            Confirm Full Settlement
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default LoanStatementAndEMI