import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CSpinner
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckCircle, cilImage, cilShieldAlt } from '@coreui/icons'

const AdminClearanceDashboard = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000';
  const [pendingTxns, setPendingTxns] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [docModalVisible, setDocModalVisible] = useState(false)
  const [activeDocUrl, setActiveDocUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch pending transactions from backend
  const fetchPendingClearances = async () => {
    try {
      // ✅ Added apiBase to the URL
      const response = await fetch(`${apiBase}/api/loans/pending-transactions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || localStorage.getItem('token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPendingTxns(data.data || [])
      } else {
        console.error("Failed to fetch pending transactions")
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingClearances()
  }, [])

  const viewDocument = (url) => {
    setActiveDocUrl(url)
    setDocModalVisible(true)
  }

  const approveTransaction = async (transactionId) => {
    if (!window.confirm("Are you sure this payment has cleared the bank? This will officially lock the payment into the ledger.")) return;
    
    setIsProcessing(true)
    
    try {
      // ✅ Added apiBase to the URL
      const response = await fetch(`${apiBase}/api/loans/approve-transaction/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Transaction successfully cleared! ${data.loanClosed ? '(Loan has been fully closed)' : ''}`)
        // Remove the cleared transaction from the UI without reloading
        setPendingTxns(pendingTxns.filter(tx => tx.transactionId !== transactionId))
      } else {
        alert("Failed to approve transaction.")
      }
    } catch (error) {
      console.error("Error approving transaction:", error)
      alert("Server error during approval.")
    } finally {
      setIsProcessing(false)
    }
  }

  const rejectTransaction = async (transactionId) => {
    const reason = window.prompt("Reason for rejection (e.g., Fake Receipt, Bounced Cheque):");
    
    // If Admin clicks 'Cancel' on the prompt, abort the process
    if (reason === null) return; 

    setIsProcessing(true)
    
    try {
      const response = await fetch(`${apiBase}/api/loans/reject-transaction/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reason }) // Send the reason to the backend
      })

      if (response.ok) {
        alert("Payment has been officially rejected.")
        // Remove the rejected transaction from the UI without reloading
        setPendingTxns(pendingTxns.filter(tx => tx.transactionId !== transactionId))
      } else {
        alert("Failed to reject transaction.")
      }
    } catch (error) {
      console.error("Error rejecting transaction:", error)
      alert("Server error during rejection.")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <CRow>
        <CCol xs={12}>
          <CCard className="shadow-sm border-top-warning border-top-3">
            <CCardHeader className="py-3 d-flex justify-content-between align-items-center">
              <h4 className="mb-0 d-flex align-items-center gap-2">
                <CIcon icon={cilShieldAlt} className="text-warning" size="lg" />
                Maker-Checker: Financial Clearances
              </h4>
              <CBadge color="danger" shape="rounded-pill" className="fs-6">
                {pendingTxns.length} Pending
              </CBadge>
            </CCardHeader>
            <CCardBody className="p-4">
              {isLoading ? (
                <div className="text-center py-5"><CSpinner color="primary" /></div>
              ) : pendingTxns.length === 0 ? (
                <div className="text-center py-5 text-medium-emphasis">
                  <h5>No pending transactions awaiting clearance.</h5>
                  <p>All member payments have been processed and reconciled.</p>
                </div>
              ) : (
                <CTable hover responsive align="middle" className="border">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Date Submitted</CTableHeaderCell>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Member Name</CTableHeaderCell>
                      <CTableHeaderCell>Payment Mode</CTableHeaderCell>
                      <CTableHeaderCell>Ref / Cheque No.</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Amount</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Verification</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {pendingTxns.map((tx) => (
                      <CTableRow key={tx.transactionId}>
                        <CTableDataCell>{new Date(tx.transactionDate).toLocaleDateString('en-IN')}</CTableDataCell>
                        <CTableDataCell><strong>{tx.vendorNo || tx.memberId?.vendorNo}</strong></CTableDataCell>
                        <CTableDataCell>{tx.memberId?.name || 'Member'}</CTableDataCell>
                        <CTableDataCell><CBadge color="secondary">{tx.paymentMode}</CBadge></CTableDataCell>
                        <CTableDataCell><code>{tx.referenceNumber}</code></CTableDataCell>
                        <CTableDataCell className="text-end fw-bold text-primary">
                          ₹{tx.amount?.toLocaleString('en-IN')}
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
                          {tx.documentProofUrl ? (
                            <CButton color="info" variant="ghost" size="sm" onClick={() => viewDocument(tx.documentProofUrl)}>
                              <CIcon icon={cilImage} className="me-1"/> View Doc
                            </CButton>
                          ) : (
                            <span className="text-muted small">No File</span>
                          )}
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
  <div className="d-flex justify-content-center gap-2">
    <CButton 
      color="success" 
      size="sm" 
      className="text-white fw-bold shadow-sm" 
      onClick={() => approveTransaction(tx.transactionId)} 
      disabled={isProcessing}
    >
      <CIcon icon={cilCheckCircle} className="me-1"/> Clear
    </CButton>

    {/* ✅ NEW REJECT BUTTON */}
    <CButton 
      color="danger" 
      size="sm" 
      className="text-white fw-bold shadow-sm" 
      onClick={() => rejectTransaction(tx.transactionId)} 
      disabled={isProcessing}
    >
      Reject
    </CButton>
  </div>

                        </CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* Cloudinary Document Viewer Modal */}
      <CModal visible={docModalVisible} onClose={() => setDocModalVisible(false)} size="lg" alignment="center">
        <CModalHeader>
          <CModalTitle>Payment Proof Document</CModalTitle>
        </CModalHeader>
        <CModalBody className="text-center bg-light">
          {activeDocUrl && (
            <img 
              src={activeDocUrl} 
              alt="Document Proof" 
              className="img-fluid border shadow-sm rounded" 
              style={{maxHeight: '600px'}} 
            />
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setDocModalVisible(false)}>Close</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default AdminClearanceDashboard
