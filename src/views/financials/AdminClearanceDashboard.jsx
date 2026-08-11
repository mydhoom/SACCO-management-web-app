import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CSpinner
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckCircle, cilImage, cilShieldAlt } from '@coreui/icons'
import { QRCodeSVG } from 'qrcode.react'

const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'

const AdminClearanceDashboard = () => {
  const [pendingTxns, setPendingTxns] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [docModalVisible, setDocModalVisible] = useState(false)
  const [activeDocUrl, setActiveDocUrl] = useState('')
  const [upiModalVisible, setUpiModalVisible] = useState(false)
  const [activeUpiPayload, setActiveUpiPayload] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch(`${apiBase}/api/savings/pending-withdrawals`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setPendingTxns(result.data)
        } else {
          console.error('Failed to load pending withdrawals', result)
        }
      })
      .catch((error) => {
        console.error('Pending withdrawal fetch error:', error)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const viewDocument = (url) => {
    setActiveDocUrl(url)
    setDocModalVisible(true)
  }

  const viewUpiQr = (tx) => {
    setActiveUpiPayload(tx)
    setUpiModalVisible(true)
  }

  const approveTransaction = async (transactionId) => {
    if (!window.confirm("Are you sure this withdrawal has been verified? This will finalize the transaction in the ledger.")) return;

    setIsProcessing(true)
    const token = localStorage.getItem('token')
    try {
      const response = await fetch(`${apiBase}/api/savings/approve-withdrawal/${transactionId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to approve withdrawal.')
      }
      alert(`Transaction ${transactionId} officially cleared and posted to the ledger!`)
      setPendingTxns(pendingTxns.filter(tx => tx.transactionId !== transactionId))
    } catch (error) {
      console.error('Approval error:', error)
      alert(error.message || 'Approval request failed.')
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
                Maker-Checker: Pending Clearances
              </h4>
            </CCardHeader>
            <CCardBody className="p-4">
              {isLoading ? (
                <div className="text-center py-5"><CSpinner color="primary" /></div>
              ) : pendingTxns.length === 0 ? (
                <div className="text-center py-5 text-medium-emphasis">
                  <h5>No pending transactions awaiting clearance.</h5>
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
                      <CTableHeaderCell className="text-end">Amount (₹)</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Verification</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {pendingTxns.map((tx) => (
                      <CTableRow key={tx.transactionId}>
                        <CTableDataCell>{new Date(tx.transactionDate).toLocaleDateString('en-IN')}</CTableDataCell>
                        <CTableDataCell><strong>{tx.vendorNo}</strong></CTableDataCell>
                        <CTableDataCell>{tx.memberName}</CTableDataCell>
                        <CTableDataCell><CBadge color="secondary">{tx.paymentMode}</CBadge></CTableDataCell>
                        <CTableDataCell><code>{tx.referenceNumber}</code></CTableDataCell>
                        <CTableDataCell className="text-end fw-bold text-primary">
                          ₹{tx.amount.toLocaleString('en-IN')}
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
                          {tx.documentProofUrl ? (
                            <CButton color="info" variant="ghost" size="sm" onClick={() => viewDocument(tx.documentProofUrl)}>
                              <CIcon icon={cilImage} className="me-1"/> View Doc
                            </CButton>
                          ) : (
                            <span className="text-muted small">No File</span>
                          )}
                          {tx.memberUpiId ? (
                            <>
                              <div className="small mt-2 text-wrap">UPI: <strong>{tx.memberUpiId}</strong></div>
                              <CButton color="dark" variant="outline" size="sm" className="mt-2" onClick={() => viewUpiQr(tx)}>
                                View UPI QR
                              </CButton>
                            </>
                          ) : null}
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
                          <CButton color="success" size="sm" className="text-white fw-bold" onClick={() => approveTransaction(tx.transactionId)} disabled={isProcessing}>
                            <CIcon icon={cilCheckCircle} className="me-1"/> Clear Funds
                          </CButton>
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
          <CModalTitle>Document Proof</CModalTitle>
        </CModalHeader>
        <CModalBody className="text-center bg-light">
          <img src={activeDocUrl} alt="Document Proof" className="img-fluid border shadow-sm rounded" style={{maxHeight: '600px'}} />
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setDocModalVisible(false)}>Close</CButton>
        </CModalFooter>
      </CModal>

      <CModal visible={upiModalVisible} onClose={() => setUpiModalVisible(false)} size="md" alignment="center">
        <CModalHeader>
          <CModalTitle>Pay Member via UPI</CModalTitle>
        </CModalHeader>
        <CModalBody className="text-center">
          {activeUpiPayload ? (
            <>
              <div className="mb-3 text-start">
                <div><strong>Member:</strong> {activeUpiPayload.memberName}</div>
                <div><strong>Vendor No.:</strong> {activeUpiPayload.vendorNo}</div>
                <div><strong>UPI ID:</strong> {activeUpiPayload.memberUpiId}</div>
                <div><strong>Amount:</strong> ₹{activeUpiPayload.amount.toLocaleString('en-IN')}</div>
              </div>
              <div className="d-inline-block bg-white p-3 rounded shadow-sm mb-3">
                <QRCodeSVG
                  value={`upi://pay?pa=${encodeURIComponent(activeUpiPayload.memberUpiId)}&pn=${encodeURIComponent(activeUpiPayload.memberName)}&am=${activeUpiPayload.amount}&cu=INR&tn=${encodeURIComponent('Withdrawal-' + activeUpiPayload.transactionId)}`}
                  size={180}
                  level="H"
                />
              </div>
              <div className="small text-muted">Scan this QR code from the admin UPI app to transfer funds directly to the member.</div>
            </>
          ) : (
            <div className="text-muted">No UPI details available.</div>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setUpiModalVisible(false)}>Close</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default AdminClearanceDashboard
