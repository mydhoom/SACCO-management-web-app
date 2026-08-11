import React, { useState } from 'react'
import axios from 'axios'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormInput,
  CFormSelect,
  CFormTextarea,
  CFormCheck,
  CButton,
  CRow,
  CCol,
  CAlert,
  CSpinner,
  CNav,
  CNavItem,
  CNavLink,
  CTabContent,
  CTabPane,
  CInputGroup,
  CFormLabel
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWarning, cilCheckCircle } from '@coreui/icons'

const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'

const DepositsWithdrawals = () => {
  const [activeKey, setActiveKey] = useState(1)
  const today = new Date().toISOString().split('T')[0]
  const [depositGroup, setDepositGroup] = useState('RD')

  const [formData, setFormData] = useState({
    vendorNo: '', 
    type: 'Monthly Thrift', 
    ledgerFolio: '154',     
    amount: '',
    transactionDate: today,
    paymentMode: 'Cash',
    disbursementMode: 'Cash',
    memberUpiId: '',
    referenceNo: '',
    reason: 'General',
    remarks: ''
  })

  // Destructure for cleaner JSX
  const { vendorNo, type, ledgerFolio, amount, transactionDate, paymentMode, disbursementMode, memberUpiId, referenceNo, reason, remarks } = formData

  const [verifiedName, setVerifiedName] = useState('')
  const [availableBalance, setAvailableBalance] = useState(null)
  const [activeLoanBalance, setActiveLoanBalance] = useState(null)  
  const [isVerifying, setIsVerifying] = useState(false)
  const [status, setStatus] = useState({ loading: false, error: null, success: null })

  const folioMapping = {
    'Monthly Thrift': '154',
    'Recurring Deposit': '154',
    'Voluntary Savings': '154',
    'RD Late Fine / Penalty': '154',
    'Loan EMI Payment': '152',
    'Loan Prepayment': '152',
    'Loan Late Fee / Penalty': '152',
    'Share Capital': '155',
    'Admission Fee': '157',
    'Stationary / Misc': '157',
    'General Penalty / Fine': '157',
    'Mandatory Savings': '154'
  }

  // --- Helper to DRY up headers ---
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token')
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    
    if (name === 'type') {
      const correspondingFolio = folioMapping[value] || '154'
      setFormData(prev => ({ ...prev, type: value, ledgerFolio: correspondingFolio }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }

    if (name === 'vendorNo') {
      setVerifiedName('')
      setAvailableBalance(null)
      setActiveLoanBalance(null)
    }
  }

  const handleDepositGroupChange = (group) => {
    setDepositGroup(group)
    if (group === 'RD') {
      setFormData(prev => ({ ...prev, type: 'Monthly Thrift', ledgerFolio: '154' }))
    } else if (group === 'LOAN') {
      setFormData(prev => ({ ...prev, type: 'Loan EMI Payment', ledgerFolio: '152' }))
    } else if (group === 'OTHER') {
      setFormData(prev => ({ ...prev, type: 'Share Capital', ledgerFolio: '155' }))
    }
  }

  const handleTabChange = (key) => {
    setActiveKey(key)
    setStatus({ loading: false, error: null, success: null })
    
    // Smart Cleansing: Clear transactional amounts on tab switch, keep member info
    setFormData(prev => ({ 
        ...prev, 
        amount: '', 
        referenceNo: '', 
        remarks: '',
        type: key === 2 ? 'Voluntary Savings' : 'Monthly Thrift',
        ledgerFolio: '154'
    }))
    
    if (key === 1) setDepositGroup('RD')
  }

  const handleVerifyMember = async () => {
    if (!vendorNo) {
      setStatus({ loading: false, success: null, error: 'Please enter a Vendor Number to verify.' })
      return
    }

    setIsVerifying(true)
    setStatus({ loading: false, error: null, success: null })
    setVerifiedName('')
    setAvailableBalance(null)

    try {
      const response = await axios.get(
        `${apiBase}/api/savings/verify/${vendorNo}`,
        { headers: getAuthHeaders() }
      )

      const { name, availableBalance: fetchedBalance, activeLoanBalance: fetchedLoan } = response.data.data

      setVerifiedName(name)
      setAvailableBalance(fetchedBalance)
      setActiveLoanBalance(fetchedLoan)
      setStatus({ loading: false, success: 'Member verified!', error: null })
    } catch (error) {
      console.error("Verification failed:", error)
      setStatus({ loading: false, success: null, error: 'Member not found or server error.' })
      setVerifiedName('')
      setAvailableBalance(null)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!verifiedName) {
      setStatus({ loading: false, success: null, error: 'Please verify the Vendor Number before submitting the transaction.' })
      return
    }

    // SAFETY LOCK 0: Prevent zero or negative amounts
    if (Number(amount) <= 0) {
        setStatus({ loading: false, success: null, error: 'Transaction amount must be greater than zero.' })
        return
    }

    // SAFETY LOCK 1: Overdraft Protection
    if (activeKey === 2 && Number(amount) > Number(availableBalance)) {
      setStatus({ loading: false, success: null, error: `Insufficient funds! Member only has ₹${Number(availableBalance).toLocaleString('en-IN')} available.` })
      return
    }

    // SAFETY LOCK 2: Share Capital / Loan Clearance Rule
    if (activeKey === 2 && type === 'Share Capital' && Number(activeLoanBalance) > 0) {
      setStatus({ loading: false, success: null, error: `Action Denied: Member must clear their outstanding loan of ₹${Number(activeLoanBalance).toLocaleString('en-IN')} before withdrawing Share Capital.` })
      return
    }

    setStatus({ loading: true, error: null, success: null })
    const action = activeKey === 1 ? 'Deposit' : 'Withdrawal'

    try {
      const finalAmount = action === 'Withdrawal' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))

      if (action === 'Withdrawal' && memberUpiId) {
        const upiValue = memberUpiId.trim()
        if (!/^[^\s@]+@[^\s@]+$/.test(upiValue)) {
          setStatus({ loading: false, success: null, error: 'Enter a valid UPI ID or leave it blank.' })
          return
        }
      }

      const payload = {
        vendorNo,
        ledgerFolio,
        type,
        action,
        amount: finalAmount,
        transactionDate,
        mode: action === 'Deposit' 
          ? paymentMode 
          : (memberUpiId ? 'UPI' : disbursementMode),
        memberUpiId: memberUpiId || null,
        referenceNo,
        reason: action === 'Withdrawal' ? reason : null,
        remarks
      }

      const response = await axios.post(`${apiBase}/api/savings/deposit`, payload, { headers: getAuthHeaders() })

      if (response.data.success) {
        setStatus({ 
            loading: false, 
            error: null, 
            success: response.data.message || `${action} of ₹${Math.abs(finalAmount).toLocaleString('en-IN')} processed successfully!` 
        })

        // Full UI Reset post-transaction
        setFormData({
          vendorNo: '',
          type: activeKey === 1 ? 'Monthly Thrift' : 'Voluntary Savings',
          ledgerFolio: '154',
          amount: '',
          transactionDate: today,
          paymentMode: 'Cash',
          disbursementMode: 'Cash',
          memberUpiId: '',
          referenceNo: '',
          reason: 'General',
          remarks: ''
        })
        setVerifiedName('')
        setDepositGroup('RD')
      }
    } catch (error) {
      setStatus({
        loading: false,
        success: null,
        error: error.response?.data?.message || 'Failed to process transaction. Check backend connection.'
      })
    }
  }

  return (
    <CRow>
      <CCol xs={12} lg={10} xl={8}>
        <CCard className="shadow-sm border-0">
          <CCardHeader className="bg-white border-bottom pt-3 pb-0 px-4">
            <h5 className="mb-3 fw-bold text-dark">Process Transaction</h5>
            
            <CNav variant="tabs" className="border-bottom-0">
              <CNavItem>
                <CNavLink
                  style={{ cursor: 'pointer', fontWeight: activeKey === 1 ? '600' : '400' }}
                  active={activeKey === 1}
                  onClick={() => handleTabChange(1)}
                  className={activeKey === 1 ? "text-primary border-bottom-0" : "text-muted"}
                >
                  Receive Deposit
                </CNavLink>
              </CNavItem>
              <CNavItem>
                <CNavLink
                  style={{ cursor: 'pointer', fontWeight: activeKey === 2 ? '600' : '400' }}
                  active={activeKey === 2}
                  onClick={() => handleTabChange(2)}
                  className={activeKey === 2 ? "text-danger border-bottom-0" : "text-muted"}
                >
                  Process Withdrawal
                </CNavLink>
              </CNavItem>
            </CNav>
          </CCardHeader>

          <CCardBody className="p-4 bg-light bg-opacity-50">
            {status.error && <CAlert color="danger">{status.error}</CAlert>}
            {status.success && <CAlert color="success">{status.success}</CAlert>}

            {activeKey === 2 && type === 'Share Capital' && (
              <CAlert color="warning" className="d-flex align-items-center shadow-sm border-0">
                <CIcon icon={cilWarning} size="xl" className="me-3 text-warning" />
                <div>
                  <strong>Loan Clearance Required:</strong> Withdrawal of Share Capital is subject to the full clearance of the member's active loans. Please verify that the member has no outstanding loan balance before proceeding.
                </div>
              </CAlert>
            )}

            <CForm onSubmit={handleSubmit} className="bg-white p-4 rounded border shadow-sm">
              <CRow className="mb-3">
                <CCol md={8}>
                  <CFormLabel htmlFor="vendorNo">Vendor Number</CFormLabel>
                  <CInputGroup>
                    <CFormInput
                      type="text"
                      id="vendorNo"
                      name="vendorNo"
                      placeholder="e.g., 10452"
                      value={vendorNo}
                      onChange={handleInputChange}
                      required
                    />
                    <CButton 
                      type="button" 
                      color="secondary" 
                      variant="outline" 
                      onClick={handleVerifyMember}
                      disabled={isVerifying}
                    >
                      {isVerifying ? <CSpinner size="sm" /> : 'Verify'}
                    </CButton>
                  </CInputGroup>
                  {verifiedName && (
                    <div className="form-text mt-2 d-flex flex-column gap-2 p-2 bg-light rounded border">
                      <div className="text-success fw-bold d-flex align-items-center">
                        <CIcon icon={cilCheckCircle} className="me-1" />
                        Verified: {verifiedName}
                      </div>
                      <div className="d-flex gap-2">
                        <span className="badge bg-success text-white px-2 py-1 flex-fill text-start">
                          Savings Available: ₹{Number(availableBalance || 0).toLocaleString('en-IN')}
                        </span>
                        <span className={`badge ${activeLoanBalance > 0 ? 'bg-danger' : 'bg-secondary'} text-white px-2 py-1 flex-fill text-start`}>
                          Loan Due: ₹{Number(activeLoanBalance || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )}
                </CCol>
                <CCol md={4}>
                  <CFormLabel htmlFor="transactionDate">Transaction Date</CFormLabel>
                  <CFormInput
                    type="date"
                    id="transactionDate"
                    name="transactionDate"
                    value={transactionDate}
                    onChange={handleInputChange}
                    required
                  />
                </CCol>
              </CRow>

              {activeKey === 1 && (
                <div className="mb-3 p-3 bg-light rounded border">
                  <CFormLabel className="fw-bold mb-2 d-block text-secondary small text-uppercase">Payment Category Group</CFormLabel>
                  <div className="d-flex gap-4">
                    <CFormCheck 
                      type="radio" name="depositGroupRadio" id="groupRD" label="RD / Thrift Accounts" 
                      checked={depositGroup === 'RD'} 
                      onChange={() => handleDepositGroupChange('RD')} 
                    />
                    <CFormCheck 
                      type="radio" name="depositGroupRadio" id="groupLoan" label="Loan Repayments" 
                      checked={depositGroup === 'LOAN'} 
                      onChange={() => handleDepositGroupChange('LOAN')} 
                    />
                    <CFormCheck 
                      type="radio" name="depositGroupRadio" id="groupOther" label="Other Fees & Capital" 
                      checked={depositGroup === 'OTHER'} 
                      onChange={() => handleDepositGroupChange('OTHER')} 
                    />
                  </div>
                </div>
              )}

              <CRow className="mb-3">
                <CCol md={6}>
                  <CFormSelect
                    id="type"
                    name="type"
                    label={activeKey === 1 ? "Specific Account / Head" : "Capital Account"}
                    value={type}
                    onChange={handleInputChange}
                    required
                  >
                    {activeKey === 1 ? (
                      depositGroup === 'RD' ? (
                        <>
                          <option value="Monthly Thrift">Monthly Thrift (Folio 154)</option>
                          <option value="Recurring Deposit">Recurring Deposit (Folio 154)</option>
                          <option value="Voluntary Savings">Voluntary Savings (Folio 154)</option>
                          <option value="RD Late Fine / Penalty">RD Late Fine / Penalty (Folio 154)</option>
                        </>
                      ) : depositGroup === 'LOAN' ? (
                        <>
                          <option value="Loan EMI Payment">Loan EMI Payment (Folio 152)</option>
                          <option value="Loan Prepayment">Loan Prepayment / Advance (Folio 152)</option>
                          <option value="Loan Late Fee / Penalty">Loan Late Fee / Penalty (Folio 152)</option>
                        </>
                      ) : (
                        <>
                          <option value="Share Capital">Share Capital (Folio 155)</option>
                          <option value="Admission Fee">Admission Fee (Folio 157)</option>
                          <option value="Stationary / Misc">Stationary / Misc (Folio 157)</option>
                          <option value="General Penalty / Fine">General Penalty / Fine (Folio 157)</option>
                        </>
                      )
                    ) : (
                      <>
                        <option value="Share Capital">Share Capital (Folio 155)</option>
                        <option value="Mandatory Savings">Mandatory Savings (Folio 154)</option>
                        <option value="Voluntary Savings">Voluntary Savings (Folio 154)</option>
                      </>
                    )}
                  </CFormSelect>
                  <div className="form-text text-muted mt-1 small">
                    Target Ledger Folio: <span className="fw-bold text-dark">Folio #{ledgerFolio}</span>
                  </div>
                </CCol>

                <CCol md={6}>
                  <CFormInput
                    type="number"
                    id="amount"
                    name="amount"
                    label="Amount (₹)"
                    placeholder="Enter amount"
                    min="1"
                    value={amount}
                    onChange={handleInputChange}
                    required
                  />
                </CCol>
              </CRow>

              <CTabContent>
                <CTabPane visible={activeKey === 1}>
                  <CRow className="mb-3">
                    <CCol md={6}>
                      <CFormSelect
                        id="paymentMode"
                        name="paymentMode"
                        label="Payment Mode"
                        value={paymentMode}
                        onChange={handleInputChange}
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                        <option value="NEFT/RTGS">NEFT / RTGS</option>
                        <option value="Payroll Deduction">Payroll Deduction</option>
                      </CFormSelect>
                    </CCol>
                    <CCol md={6}>
                      <CFormInput
                        type="text"
                        id="referenceNo"
                        name="referenceNo"
                        label="Reference Number"
                        placeholder="Cheque No. or UPI Trx ID (Optional)"
                        value={referenceNo}
                        onChange={handleInputChange}
                      />
                    </CCol>
                  </CRow>
                </CTabPane>

                <CTabPane visible={activeKey === 2}>
                  <CRow className="mb-3">
                    <CCol md={6}>
                      <CFormSelect
                        id="disbursementMode"
                        name="disbursementMode"
                        label="Disbursement Mode"
                        value={disbursementMode}
                        onChange={handleInputChange}
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                      </CFormSelect>
                    </CCol>
                    <CCol md={6}>
                      <CFormInput
                        type="text"
                        id="memberUpiId"
                        name="memberUpiId"
                        label="Member UPI ID (Optional)"
                        placeholder="example@okaxis"
                        value={memberUpiId}
                        onChange={handleInputChange}
                      />
                    </CCol>
                  </CRow>
                  <CRow className="mb-3">
                    <CCol md={6}>
                      <CFormSelect
                        id="reason"
                        name="reason"
                        label="Reason for Withdrawal"
                        value={reason}
                        onChange={handleInputChange}
                      >
                        <option value="General">General / Personal</option>
                        <option value="Medical Emergency">Medical Emergency</option>
                        <option value="Education">Education</option>
                        <option value="Housing">Housing / Renovation</option>
                        <option value="Leaving SACCO">Leaving SACCO (Permanent)</option>
                      </CFormSelect>
                    </CCol>
                  </CRow>
                </CTabPane>
              </CTabContent>

              <div className="mb-4">
                <CFormTextarea
                  id="remarks"
                  name="remarks"
                  label="Administrative Remarks (Optional)"
                  rows={2}
                  placeholder="Enter any additional context for this transaction..."
                  value={remarks}
                  onChange={handleInputChange}
                />
              </div>

              <div className="d-flex justify-content-end border-top pt-3 mt-2">
                <CButton
                  color={activeKey === 1 ? 'primary' : 'danger'}
                  type="submit"
                  className="px-5 text-white fw-semibold shadow-sm"
                  disabled={status.loading}
                >
                  {status.loading ? <CSpinner size="sm" className="me-2" /> : null}
                  {status.loading 
                    ? 'Processing...' 
                    : activeKey === 1 
                      ? 'Confirm Deposit & Link Folio' 
                      : 'Authorize Withdrawal'
                  }
                </CButton>
              </div>
            </CForm>
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  )
}

export default DepositsWithdrawals
