import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CTable, CTableBody,
  CTableDataCell, CTableHead, CTableHeaderCell, CTableRow, CButton,
  CSpinner, CAlert, CBadge, CNav, CNavItem, CNavLink, CTabContent, CTabPane, CTooltip,
  CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CFormLabel, CFormInput, CFormSelect
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckCircle, cilBan } from '@coreui/icons'

const Approvals = () => {
  const [activeTab, setActiveTab] = useState(1)

  // ==========================================
  // TAB 1: USER REGISTRATION STATE & LOGIC
  // ==========================================
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [userError, setUserError] = useState(null)
  const [userActionMessage, setUserActionMessage] = useState(null)

  // ==========================================
  // TAB 2: LOAN APPLICATION STATE & LOGIC
  // ==========================================
  const [loans, setLoans] = useState([])
  const [loadingLoans, setLoadingLoans] = useState(true)
  const [loanError, setLoanError] = useState(null)

  const [approvalModalVisible, setApprovalModalVisible] = useState(false)
  const [selectedLoan, setSelectedLoan] = useState(null)
  
  // Advanced Financial Routing State
  const [shareDeduction, setShareDeduction] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sharePaymentMethod, setSharePaymentMethod] = useState('DEDUCT_FROM_LOAN')
  const [transferMode, setTransferMode] = useState('CHEQUE')
  const [referenceNo, setReferenceNo] = useState('')

  useEffect(() => { 
    fetchPendingUsers()
    fetchPendingLoans() 
  }, [])

  const fetchPendingUsers = async () => {
    setLoadingUsers(true)
    try {
      const response = await fetch('http://localhost:5000/api/auth/pending-users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      })
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setUserError("Could not load registration requests.")
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchPendingLoans = async () => {
    setLoadingLoans(true)
    try {
      const response = await fetch('http://localhost:5000/api/loans', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      })
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setLoans(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Error fetching loans:", err)
      setLoanError("Could not load loan applications.")
    } finally {
      setLoadingLoans(false)
    }
  }

  const handleUserAction = async (id, status) => {
    try {
      const response = await fetch(`http://localhost:5000/api/auth/approve-user/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ status })
      })
      
      if (response.ok) {
        setUsers(users.filter(user => user._id !== id))
        setUserActionMessage({ type: 'success', text: `User successfully ${status}!` })
        setTimeout(() => setUserActionMessage(null), 3000)
      } else {
        setUserActionMessage({ type: 'danger', text: `Failed to mark user as ${status}.` })
      }
    } catch (error) { 
      setUserActionMessage({ type: 'danger', text: 'Server connection error.' })
    }
  }

  const validateLoan = (app) => {
    const warnings = []
    const requested = app.loanAmount || app.requestedAmount || 0
    const active = app.activeLoans || 0 
    const shares = app.shareMoney || 15000 
    const tenure = app.tenure || app.requestedTenure || 0
    const retirement = app.monthsToRetirement || 999

    if (requested + active > 400000) warnings.push(`Exceeds ₹4L Cap`)
    if (requested > (shares * 10)) warnings.push(`Share shortfall`)
    if (tenure > 36) warnings.push("Tenure > 36 months")
    else if (tenure > retirement) warnings.push("Exceeds service remaining")
    return warnings
  }

  const openApprovalModal = (loan) => {
    setSelectedLoan(loan)
    const amount = loan.loanAmount || loan.requestedAmount || 0
    setShareDeduction(amount * 0.10) 
    setSharePaymentMethod('DEDUCT_FROM_LOAN')
    setTransferMode('CHEQUE')
    setReferenceNo('')
    setApprovalModalVisible(true)
  }

  const confirmLoanApproval = async () => {
    if (!selectedLoan) return;
    
    setIsProcessing(true);
    
    try {
      const loanIdToUpdate = selectedLoan.loanId || selectedLoan._id || selectedLoan.id;
      const response = await fetch(`http://localhost:5000/api/loans/${loanIdToUpdate}`, { 
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ 
          status: 'APPROVED',
          shareDeductionAmount: Number(shareDeduction),
          sharePaymentMethod: sharePaymentMethod,
          transferMode: transferMode,
          referenceNumber: referenceNo
        })
      });
      
      if (!response.ok) throw new Error("Failed to approve loan");

      setLoans(loans.map(loan => {
        const currentId = loan.loanId || loan._id || loan.id;
        return currentId === loanIdToUpdate ? { ...loan, status: 'APPROVED' } : loan;
      }));
      
      setApprovalModalVisible(false);
      setSelectedLoan(null);
    } catch (error) {
      console.error("Error approving loan:", error);
      alert("Failed to process loan approval.");
    } finally {
      setIsProcessing(false);
    }
  }

  const handleLoanRejection = async (id) => {
    if (!window.confirm(`Are you sure you want to permanently reject and remove application ${id}?`)) return;

    try {
      const response = await fetch(`http://localhost:5000/api/loans/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ status: 'REJECTED' }) 
      });

      if (!response.ok) throw new Error("Failed to reject loan in database");

      setLoans(loans.filter(loan => {
        const currentId = loan.loanId || loan._id || loan.id
        return currentId !== id
      }));

    } catch (error) {
      console.error("Error rejecting loan:", error);
      alert("Failed to permanently reject the loan. Check console.");
    }
  }

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="shadow-sm border-top-primary border-top-3">
          <CCardHeader className="bg-white pb-0 border-bottom-0">
            <h4 className="mb-3 text-heading-color">Approvals Dashboard</h4>
            <CNav variant="tabs">
              <CNavItem>
                <CNavLink active={activeTab === 1} onClick={() => setActiveTab(1)} style={{ cursor: 'pointer' }}>
                  Member Registrations <CBadge color="primary" className="ms-2">{users.length}</CBadge>
                </CNavLink>
              </CNavItem>
              <CNavItem>
                <CNavLink active={activeTab === 2} onClick={() => setActiveTab(2)} style={{ cursor: 'pointer' }}>
                  {/* Instantly catches brand new 'PENDING' loans right here */}
                  Loan Applications <CBadge color="primary" className="ms-2">{loans.filter(l => l.status === 'PENDING').length}</CBadge>
                </CNavLink>
              </CNavItem>
            </CNav>
          </CCardHeader>
          
          <CCardBody>
            <CTabContent>
              {/* TAB 1 CONTENT: Users */}
              <CTabPane visible={activeTab === 1}>
                {userActionMessage && (
                  <CAlert color={userActionMessage.type} dismissible onClose={() => setUserActionMessage(null)}>
                    {userActionMessage.text}
                  </CAlert>
                )}

                {loadingUsers ? <div className="text-center py-4"><CSpinner color="primary" /></div> : userError ? <CAlert color="danger">{userError}</CAlert> :
                <CTable hover responsive className="align-middle border mb-0">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Name</CTableHeaderCell>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Designation</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {users.length > 0 ? users.map((user) => (
                      <CTableRow key={user._id}>
                        <CTableDataCell className="fw-semibold">{user.name}</CTableDataCell>
                        <CTableDataCell>{user.vendorNo}</CTableDataCell>
                        <CTableDataCell>{user.designation || 'N/A'}</CTableDataCell>
                        <CTableDataCell className="text-center">
                          <CButton color="success" variant="outline" size="sm" className="me-2 fw-semibold" onClick={() => handleUserAction(user._id, 'approved')}>
                            Approve
                          </CButton>
                          <CButton color="danger" variant="outline" size="sm" className="fw-semibold" onClick={() => handleUserAction(user._id, 'rejected')}>
                            Reject
                          </CButton>
                        </CTableDataCell>
                      </CTableRow>
                    )) : (
                      <CTableRow>
                        <CTableDataCell colSpan="4" className="text-center py-4 text-medium-emphasis">
                          No pending registration requests.
                        </CTableDataCell>
                      </CTableRow>
                    )}
                  </CTableBody>
                </CTable>}
              </CTabPane>

              {/* TAB 2 CONTENT: Loans */}
              <CTabPane visible={activeTab === 2}>
                {loadingLoans ? (
                  <div className="text-center py-4"><CSpinner color="primary" /></div>
                ) : loanError ? (
                  <CAlert color="danger">{loanError}</CAlert>
                ) : (
                  <CTable hover responsive align="middle" className="border mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>App ID</CTableHeaderCell>
                        <CTableHeaderCell>Member Details</CTableHeaderCell>
                        <CTableHeaderCell>Request (₹)</CTableHeaderCell>
                        <CTableHeaderCell>System Validation</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {loans.filter(app => app.status === 'PENDING').length > 0 ? loans.map((app) => {
                        const warnings = validateLoan(app)
                        const isValid = warnings.length === 0
                        if(app.status !== 'PENDING') return null

                        const internalId = app._id || app.id
                        const displayAppId = app.loanId || (app._id ? app._id.substring(0, 8).toUpperCase() + "..." : 'N/A')
                        const requestAmount = app.loanAmount || app.requestedAmount || 0
                        
                        const mockShares = app.shareMoney || 15000 
                        const activeLoans = app.activeLoans || 0 
                        
                        let displayName = 'Unknown Member'
                        let vendorNo = 'N/A'

                        if (app.memberId && typeof app.memberId === 'object') {
                          displayName = app.memberId.name || `${app.memberId.firstName || ''} ${app.memberId.lastName || ''}`.trim() || 'Unknown'
                          vendorNo = app.memberId.vendorNo || 'N/A'
                        } else if (app.memberName) {
                          displayName = app.memberName
                        }

                        return (
                          <CTableRow key={internalId}>
                            <CTableDataCell className="fw-semibold text-primary">
                              {displayAppId}
                            </CTableDataCell>
                            <CTableDataCell>
                              <div className="fw-bold text-dark fs-6">{displayName}</div>
                              <div className="small text-muted mb-1">Vendor No: <span className="fw-medium">{vendorNo}</span></div>
                              <div className="small text-medium-emphasis">
                                Shares: ₹{mockShares.toLocaleString('en-IN')} <br/>
                                <span className={activeLoans > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
                                  Active Loans: ₹{activeLoans.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </CTableDataCell>
                            <CTableDataCell className="fw-bold fs-6">₹{requestAmount.toLocaleString('en-IN')}</CTableDataCell>
                            <CTableDataCell>
                              {isValid ? <CBadge color="success" shape="rounded-pill">Clear</CBadge> : 
                              warnings.map((w, i) => <CBadge key={i} color="danger" shape="rounded-pill" className="d-block mb-1">{w}</CBadge>)}
                            </CTableDataCell>
                            <CTableDataCell className="text-center">
                              <div className="d-flex justify-content-center gap-2">
                                <CTooltip content="Approve Loan">
                                  <CButton color="success" variant="outline" size="sm" disabled={!isValid} onClick={() => openApprovalModal(app)}>
                                    <CIcon icon={cilCheckCircle} />
                                  </CButton>
                                </CTooltip>
                                <CTooltip content="Reject Loan">
                                  <CButton color="danger" variant="outline" size="sm" onClick={() => handleLoanRejection(displayAppId)}>
                                    <CIcon icon={cilBan} />
                                  </CButton>
                                </CTooltip>
                              </div>
                            </CTableDataCell>
                          </CTableRow>
                        )
                      }) : (
                        <CTableRow>
                          <CTableDataCell colSpan="5" className="text-center py-4 text-medium-emphasis">
                            No pending loan applications found.
                          </CTableDataCell>
                        </CTableRow>
                      )}
                    </CTableBody>
                  </CTable>
                )}
              </CTabPane>
            </CTabContent>
          </CCardBody>
        </CCard>
      </CCol>

      {/* --- MODAL WITH FULL DISBURSAL ROUTING --- */}
      <CModal visible={approvalModalVisible} onClose={() => setApprovalModalVisible(false)} alignment="center">
        <CModalHeader onClose={() => setApprovalModalVisible(false)}>
          <CModalTitle>Confirm Loan Approval</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {selectedLoan && (
            <>
              <p className="text-medium-emphasis mb-4">
                You are approving <strong>{selectedLoan.loanId || selectedLoan._id}</strong>. Verify the net disbursement details below before finalizing.
              </p>
              
              <CRow className="mb-3">
                <CCol xs={6} className="text-muted">Gross Loan Amount:</CCol>
                <CCol xs={6} className="text-end fw-bold">₹{(selectedLoan.loanAmount || selectedLoan.requestedAmount || 0).toLocaleString('en-IN')}</CCol>
              </CRow>

              <hr />

              <div className="mb-3">
                <CFormLabel className="fw-semibold text-primary">Deduct for Share Capital (₹)</CFormLabel>
                <CFormInput 
                  type="number" 
                  min="0"
                  max={selectedLoan.loanAmount || selectedLoan.requestedAmount || 0}
                  value={shareDeduction} 
                  onChange={(e) => setShareDeduction(Number(e.target.value))} 
                />
                <div className="small text-muted mt-1">Default is 10% of gross loan. Adjust if necessary.</div>
              </div>

              <div className="mb-3">
                <CFormLabel className="fw-semibold text-primary">Share Collection Method</CFormLabel>
                <CFormSelect value={sharePaymentMethod} onChange={(e) => setSharePaymentMethod(e.target.value)}>
                  <option value="DEDUCT_FROM_LOAN">Deduct from Loan Principal (Reduces Bank Payout)</option>
                  <option value="RD_BALANCE">Deduct from Member's RD Balance</option>
                  <option value="CASH_UPI">Member Paid via Cash / UPI</option>
                </CFormSelect>
              </div>

              <hr />

              <div className="mb-3 bg-light p-3 border rounded">
                <h6 className="fw-bold mb-3 text-dark">Execute Outward Bank Transfer</h6>
                <CRow className="g-3">
                  <CCol md={5}>
                    <CFormLabel className="small fw-bold">Transfer Mode</CFormLabel>
                    <CFormSelect value={transferMode} onChange={(e) => setTransferMode(e.target.value)} size="sm">
                      <option value="CHEQUE">Physical Cheque</option>
                      <option value="UPI">Manual UPI Transfer</option>
                    </CFormSelect>
                  </CCol>

                  <CCol md={7}>
                    <CFormLabel className="small fw-bold">
                      {transferMode === 'CHEQUE' ? 'Cheque Number *' : 'Bank UTR / Ref Number *'}
                    </CFormLabel>
                    <CFormInput 
                      type="text" 
                      size="sm"
                      placeholder={transferMode === 'CHEQUE' ? "e.g. 000123" : "e.g. 319283746510"}
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="font-monospace"
                    />
                  </CCol>
                </CRow>
              </div>

              <CRow className="mt-3">
                <CCol xs={6} className="fw-bold fs-5 text-success">Net Payout to Bank:</CCol>
                <CCol xs={6} className="text-end fw-bold fs-5 text-success">
                  ₹{((selectedLoan.loanAmount || selectedLoan.requestedAmount || 0) - (sharePaymentMethod === 'DEDUCT_FROM_LOAN' ? shareDeduction : 0)).toLocaleString('en-IN')}
                </CCol>
              </CRow>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setApprovalModalVisible(false)}>Cancel</CButton>
          <CButton color="success" className="text-white fw-semibold" disabled={isProcessing} onClick={confirmLoanApproval}>
            {isProcessing ? <CSpinner size="sm" /> : 'Confirm Net Disbursement'}
          </CButton>
        </CModalFooter>
      </CModal>
    </CRow>
  )
}

export default Approvals
