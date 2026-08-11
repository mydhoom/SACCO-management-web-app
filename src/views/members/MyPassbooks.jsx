import React, { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CCard, CCardBody, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CFormSelect, CFormInput, CFormLabel,
  CAlert, CSpinner, CForm, CPagination, CPaginationItem, CCardHeader
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { 
  cilCloudDownload, cilCheckCircle, 
  cilMoney, cilInfo, cilWarning, cilSearch
} from '@coreui/icons'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { QRCodeSVG } from 'qrcode.react'
import Groq from 'groq-sdk'

// AI API Key - loaded from VITE_GROQ_API_KEY in your .env file
const apiKey = import.meta.env.VITE_GROQ_API_KEY || ''

const MyPassbooks = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken') 
  const location = useLocation()
  const navigate = useNavigate()

  // Sub-button view switcher ('rd' or 'loan') based on current route
  const activeSubView = useMemo(() => {
    const path = location.pathname || ''
    if (path.endsWith('/loan-statement')) return 'loan'
    return 'rd'
  }, [location.pathname])

  const [paymentMode, setPaymentMode] = useState('UPI')
  const [referenceNo, setReferenceNo] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [remarks, setRemarks] = useState('')
  
  // --- COMMON STATE ---
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  
  // --- AI INSIGHTS STATE ---
  const [aiInsights, setAiInsights] = useState('')
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)

  // --- STATE: LOAN TAB ---
  const [activeLoans, setActiveLoans] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [payNowModal, setPayNowModal] = useState(false)
  const [selectedEmi, setSelectedEmi] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [prepaymentModal, setPrepaymentModal] = useState(false)
  const [prepaymentAmount, setPrepaymentAmount] = useState('')
  const [loanFilter, setLoanFilter] = useState('ALL')
  const [loanPage, setLoanPage] = useState(1)

  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false)
  const [withdrawType, setWithdrawType] = useState('RD')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawUpiId, setWithdrawUpiId] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  // --- STATE: RD TAB ---
  const [userData, setUserData] = useState(null) 
  const [rdTransactions, setRdTransactions] = useState([])
  const [rdTransactionPage, setRdTransactionPage] = useState(1)
  const [rdSearchQuery, setRdSearchQuery] = useState('')

  const loanOutstanding = useMemo(() => {
    return activeLoans.reduce((total, loan) => {
      const amount = Number(loan.principalPending !== undefined ? loan.principalPending : loan.loanAmount || 0)
      return total + (amount >= 0 ? amount : 0)
    }, 0)
  }, [activeLoans])

  const rdWithdrawalMax = useMemo(() => {
    return Math.min(Number(userData?.rdBalance || 0), loanOutstanding)
  }, [userData?.rdBalance, loanOutstanding])

  const shareBalance = Number(userData?.currentShareMoneyTotal || 0)
  const canWithdrawShare = loanOutstanding <= 0 && shareBalance > 0 && activeLoans.every(loan => loan.status?.toUpperCase() !== 'PENDING')

  const activeLoan = selectedLoan;

  const itemsPerPage = 10 

  // --- 1. REAL API FETCH LOGIC ---
  useEffect(() => {
    if (location.pathname === '/my-accounts/passbooks') {
      navigate('/my-accounts/rd-passbook', { replace: true })
      return
    }

    const fetchPassbookData = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!token) {
          setError("Authentication missing. Please log in to access your passbook.")
          setLoading(false)
          return
        }

        const userRes = await fetch(`${apiBase}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!userRes.ok) throw new Error("Failed to fetch profile data.")
        const userDataJson = await userRes.json()
        const user = userDataJson.user || userDataJson
        setUserData(user)

        try {
          const loanRes = await fetch(`${apiBase}/api/loans/my-loans`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (loanRes.ok) {
            const loanData = await loanRes.json()
            setActiveLoans(loanData.loans || [])
          } 
        } catch (loanErr) {
          console.warn("No active loans found or loan endpoint missing.", loanErr)
        }

        try {
          const txRes = await fetch(`${apiBase}/api/transactions/my-transactions`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (txRes.ok) {
            const txData = await txRes.json()
            const transactions = txData.transactions || txData
            
            setRdTransactions(transactions.filter(tx => tx.category === 'RD' || tx.category === 'SHARE' || tx.category === 'INTEREST'))
            setPaymentHistory(transactions.filter(tx => tx.category === 'LOAN_REPAYMENT' || tx.category === 'LOAN_EMI'))
          }
        } catch (txErr) {
          console.warn("No transactions found.", txErr)
        }

        setLoading(false)
      } catch (err) {
        console.error("Passbook fetch error:", err)
        setError(err.message || 'Failed to connect to the server. Please try again later.')
        setLoading(false)
      }
    }

    fetchPassbookData()
  }, [apiBase, token])

  // --- GEMINI AI INTEGRATION LOGIC ---
  const handleGenerateInsights = async () => {
    if (!apiKey) {
      setToast({ show: true, message: 'AI Insights are not configured. Please add your Gemini API key to the .env file.', type: 'danger' })
      return
    }
    setIsGeneratingInsights(true)
    setAiInsights('')
    
    try {
      const combinedTxns = [...rdTransactions, ...paymentHistory]
        .sort((a, b) => new Date(b.transactionDate || b.createdAt) - new Date(a.transactionDate || a.createdAt))
        .slice(0, 30)

      if (combinedTxns.length === 0) {
        setToast({ show: true, message: 'No transactions found to analyze yet.', type: 'warning' })
        setIsGeneratingInsights(false)
        return
      }

      const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true })
      
      const promptText = `You are a helpful, encouraging financial advisor for a Cooperative Society (SACCO). 
            Analyze the following transaction history for a member. 
            Provide a brief, friendly 2-3 sentence summary of their financial activity. 
            Highlight positive habits like consistent saving or loan repayment, and offer a short, encouraging tip for their financial health. 
            Keep it concise, professional, and conversational. Do not use complex markdown styling like bold or headers.
            
            Transactions Data: ${JSON.stringify(combinedTxns)}`;

      const response = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: "You are a financial advisor for a cooperative society. Provide brief, friendly, and helpful insights based on transaction data. Output plain text without markdown formatting." },
          { role: 'user', content: promptText }
        ],
        model: 'llama-3.1-8b-instant',
      });

      setAiInsights(response.choices[0]?.message?.content || "I couldn't generate insights at this time.")
    } catch (error) {
      console.error("Error generating insights:", error)
      setToast({ show: true, message: 'Could not connect to the AI advisor. Please try again later.', type: 'danger' })
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  // --- 2. PAYMENT & CLOUDINARY UPLOAD LOGIC ---
  const triggerPayNow = (emiRecord) => {
    setSelectedEmi(emiRecord)
    setPayNowModal(true)
    setPrepaymentModal(false) 
  }

  const handleMemberPayment = async (utrNumber, receiptFile, remarks, paymentMode = 'UPI') => { 
    const finalAmount = Number(selectedEmi?.emi || prepaymentAmount)
    if (!finalAmount || finalAmount <= 0) {
      setToast({ show: true, message: 'Payment amount must be greater than 0.', type: 'danger' })
      return
    }

    if (!userData?.vendorNo) {
      setToast({ show: true, message: 'Vendor Number missing. Cannot process payment.', type: 'danger' })
      return
    }

    setIsProcessing(true)
    let uploadedImageUrl = null

    try {
      if (receiptFile) {
        const cloudinaryFormData = new FormData()
        cloudinaryFormData.append('file', receiptFile)
        cloudinaryFormData.append('upload_preset', 'ml_default') 
        cloudinaryFormData.append('cloud_name', 'wh9h0wvu')

        const cloudinaryRes = await fetch('https://api.cloudinary.com/v1_1/wh9h0wvu/image/upload', {
          method: 'POST',
          body: cloudinaryFormData
        })
        const cloudData = await cloudinaryRes.json()
        uploadedImageUrl = cloudData.secure_url
      }

      const payload = {
        vendorNo: userData?.vendorNo,
        emiAmount: finalAmount,
        annualInterestRate: activeLoan?.interestRate || 10,
        loanId: activeLoan?._id || activeLoan?.loanId,
        emiNo: selectedEmi?.installmentNo || 'Prepayment',
        paymentMode: paymentMode,
        category: 'LOAN_REPAYMENT',
        referenceNumber: utrNumber,
        remarks: remarks || `Paid via ${paymentMode}`,
        documentProofUrl: uploadedImageUrl
      }

      const backendRes = await fetch(`${apiBase}/api/loans/process-emi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!backendRes.ok) throw new Error("Backend payment rejection.")

      setToast({ show: true, message: 'Payment submitted for admin clearance!', type: 'success' })
      setPayNowModal(false)
      
    } catch (err) {
      console.error("Payment error:", err)
      setToast({ show: true, message: 'Failed to process payment. Please try again.', type: 'danger' })
    } finally {
      setIsProcessing(false)
    }
  }

  const openWithdrawModal = (type) => {
    setWithdrawType(type)
    setWithdrawAmount('')
    setWithdrawReason('')
    setWithdrawUpiId('')
    setWithdrawModalVisible(true)
  }

  const handleWithdrawSubmit = async () => {
    const amount = Number(withdrawAmount)
    if (!amount || amount <= 0) {
      setToast({ show: true, message: 'Enter a valid withdrawal amount.', type: 'warning' })
      return
    }
    if (!userData?.vendorNo) {
      setToast({ show: true, message: 'Vendor number missing. Please log in again.', type: 'danger' })
      return
    }

    if (withdrawType === 'RD') {
      if (loanOutstanding <= 0) {
        setToast({ show: true, message: 'RD withdrawal is allowed only while a loan outstanding exists.', type: 'warning' })
        return
      }
      if (amount > rdWithdrawalMax) {
        setToast({ show: true, message: `Maximum RD withdrawal is ₹${rdWithdrawalMax.toLocaleString('en-IN')}.`, type: 'warning' })
        return
      }
    }

    if (withdrawType === 'SHARE') {
      if (!canWithdrawShare) {
        setToast({ show: true, message: 'Share withdrawal is allowed only after your loan is cleared.', type: 'warning' })
        return
      }
      if (amount > shareBalance) {
        setToast({ show: true, message: `Maximum Share withdrawal is ₹${shareBalance.toLocaleString('en-IN')}.`, type: 'warning' })
        return
      }
    }

    if (withdrawUpiId && !/^[^\s@]+@[^\s@]+$/.test(withdrawUpiId.trim())) {
      setToast({ show: true, message: 'Enter a valid UPI ID or leave it blank.', type: 'warning' })
      return
    }

    setIsWithdrawing(true)
    try {
      const payload = {
        vendorNo: userData.vendorNo,
        amount: -Math.abs(amount),
        ledgerFolio: withdrawType === 'RD' ? '154' : '155',
        type: withdrawType === 'RD' ? 'Recurring Deposit' : 'Share Capital',
        action: 'Withdrawal',
        transactionDate: new Date().toISOString().split('T')[0],
        mode: withdrawUpiId ? 'UPI' : 'Cash',
        memberUpiId: withdrawUpiId || undefined,
        referenceNo: withdrawReason ? withdrawReason.slice(0, 50) : '',
        reason: withdrawReason || `${withdrawType} withdrawal request`,
        remarks: withdrawReason || `${withdrawType} withdrawal request`,
      }

      const response = await fetch(`${apiBase}/api/savings/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Withdrawal request failed.')
      }

      setToast({ show: true, message: `Withdrawal request for ₹${amount.toLocaleString('en-IN')} submitted.`, type: 'success' })
      setWithdrawModalVisible(false)
      setWithdrawAmount('')
      setWithdrawReason('')

      setUserData((prev) => {
        if (!prev) return prev
        if (withdrawType === 'RD') {
          return { ...prev, rdBalance: Number(prev.rdBalance || 0) - amount }
        }
        if (withdrawType === 'SHARE') {
          return { ...prev, currentShareMoneyTotal: Number(prev.currentShareMoneyTotal || 0) - amount }
        }
        return prev
      })
    } catch (err) {
      console.error('Withdraw error:', err)
      setToast({ show: true, message: err.message || 'Unable to submit withdrawal.', type: 'danger' })
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handlePrepayment = () => {
    if (!prepaymentAmount || parseFloat(prepaymentAmount) <= 0) {
      setToast({ show: true, message: 'Enter valid prepayment amount', type: 'warning' })
      return
    }
    triggerPayNow({ id: 'PREPAY', emi: Number(prepaymentAmount), installmentNo: 'Custom' })
  }

  // --- 3. MEMOIZED RD CALCULATIONS ---
  const filteredRdTransactions = useMemo(() => {
    const rdWithBalances = [...rdTransactions]
      .sort((a, b) => new Date(a.transactionDate || a.createdAt) - new Date(b.transactionDate || b.createdAt))
      .reduce((acc, tx) => {
        const lastBalance = acc.length > 0 ? acc[acc.length - 1].runningBalance : 0
        const amount = Number(tx.amount)
        const newBalance = tx.entryType === 'CREDIT' ? lastBalance + amount : lastBalance - amount
        acc.push({ ...tx, runningBalance: newBalance })
        return acc
      }, [])
      .reverse()

    return rdWithBalances.filter(tx => {
      if (rdSearchQuery && !tx.description?.toLowerCase().includes(rdSearchQuery.toLowerCase())) return false
      return true
    })
  }, [rdTransactions, rdSearchQuery])

  const paginatedRdTransactions = useMemo(() => {
    return filteredRdTransactions.slice(
      (rdTransactionPage - 1) * itemsPerPage,
      rdTransactionPage * itemsPerPage
    )
  }, [filteredRdTransactions, rdTransactionPage, itemsPerPage])

  // --- 4. MEMOIZED LOAN AMORTIZATION CALCULATIONS ---
  const fullSchedule = useMemo(() => {
    let schedule = []
    if (activeLoan && activeLoan.status?.toUpperCase() !== 'PENDING') {
      const tenure = activeLoan.tenure || 12 
      const startDate = new Date(activeLoan.createdAt || new Date())
      
      let outstandingBalance = activeLoan.loanAmount || 0
      const annualInterestRate = activeLoan.interestRate || 10 
      const monthlyRate = (annualInterestRate / 100) / 12

      let trueEmi = 0
      if (monthlyRate > 0) {
        trueEmi = Math.round(
          (outstandingBalance * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
          (Math.pow(1 + monthlyRate, tenure) - 1)
        )
      } else {
        trueEmi = Math.round(outstandingBalance / tenure)
      }

      let emi = activeLoan.emiAmount || activeLoan.monthlyEMI || trueEmi
      if (emi <= (outstandingBalance / tenure)) {
        emi = trueEmi 
      }

      const confirmedPayments = paymentHistory ? paymentHistory.filter(tx => tx.status?.toUpperCase() === 'COMPLETED' && tx.relatedLoanId === activeLoan._id) : []
      const paymentsMade = confirmedPayments.length

      for (let i = 1; i <= tenure; i++) {
        const dueDate = new Date(startDate)
        dueDate.setMonth(dueDate.getMonth() + i)

        let interestComponent = Math.round(outstandingBalance * monthlyRate)
        let principalComponent = emi - interestComponent

        if (i === tenure || principalComponent > outstandingBalance) {
          principalComponent = outstandingBalance
          emi = principalComponent + interestComponent
        }

        outstandingBalance -= principalComponent
        if (outstandingBalance < 0) outstandingBalance = 0

        schedule.push({
          installmentNo: i,
          dueDate: dueDate,
          emi: emi,
          principal: principalComponent,
          interest: interestComponent,
          closingBalance: outstandingBalance,
          status: i <= paymentsMade ? 'PAID' : 'DUE'
        })
      }
    }
    return schedule
  }, [activeLoan, paymentHistory])

  const filteredSchedule = useMemo(() => {
    return fullSchedule.filter(item => {
      if (loanFilter === 'ALL') return true
      return item.status === loanFilter
    })
  }, [fullSchedule, loanFilter])

  const loanTotals = useMemo(() => {
    return fullSchedule.reduce((totals, item) => {
      totals.totalEMI += Number(item.emi || 0)
      totals.totalPrincipal += Number(item.principal || 0)
      totals.totalInterest += Number(item.interest || 0)
      if (item.status === 'PAID') totals.totalPaid += Number(item.emi || 0)
      if (item.status === 'DUE') totals.totalDue += Number(item.emi || 0)
      return totals
    }, { totalEMI: 0, totalPrincipal: 0, totalInterest: 0, totalPaid: 0, totalDue: 0 })
  }, [fullSchedule])

  const loanPaidPercent = loanTotals.totalEMI > 0 ? Math.min(100, Math.round((loanTotals.totalPaid / loanTotals.totalEMI) * 100)) : 0
  const loanPageCount = Math.max(1, Math.ceil(filteredSchedule.length / itemsPerPage))
  const rdPageCount = Math.max(1, Math.ceil(filteredRdTransactions.length / itemsPerPage))

  // --- PDF EXPORT LOGIC ---
  const handleExportPDF = () => {
    if (activeSubView === 'rd') {
      const doc = new jsPDF('portrait', 'pt', 'a4')
      doc.setFontSize(16)
      doc.text(`RD Passbook - ${userData?.vendorNo || 'Member'}`, 40, 40)
      doc.setFontSize(10)
      doc.text(`Member: ${userData?.name || 'N/A'}`, 40, 58)
      doc.text(`Vendor No: ${userData?.vendorNo || 'N/A'}`, 40, 72)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 40, 86)

      const rows = filteredRdTransactions.map((tx) => [
        new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN'),
        tx.description || tx.category || '-',
        tx.ledgerFolio || tx.referenceNumber || '-',
        tx.entryType === 'CREDIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-',
        tx.entryType === 'DEBIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-',
        `₹${Number(tx.runningBalance).toLocaleString('en-IN')}`
      ])

      autoTable(doc, {
        head: [[ 'Date', 'Description', 'Ref No', 'Credit', 'Debit', 'Balance' ]],
        body: rows,
        startY: 110,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [33, 37, 41] }
      })
      doc.save(`RD_Passbook_${userData?.vendorNo || 'member'}.pdf`)
    } else {
      const doc = new jsPDF('landscape', 'pt', 'a4')
      doc.setFontSize(16)
      doc.text(`Loan Statement - ${userData?.vendorNo || 'Member'}`, 40, 40)
      doc.setFontSize(10)
      doc.text(`Member: ${userData?.name || 'N/A'}`, 40, 58)
      doc.text(`Vendor No: ${userData?.vendorNo || 'N/A'}`, 40, 72)
      doc.text(`Loan ID: ${activeLoan?.loanId || 'N/A'}`, 40, 86)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 40, 100)

      const rows = filteredSchedule.map((item) => [
        item.installmentNo,
        item.dueDate.toLocaleDateString('en-IN'),
        `₹${Number(item.emi).toLocaleString('en-IN')}`,
        `₹${Number(item.principal).toLocaleString('en-IN')}`,
        `₹${Number(item.interest).toLocaleString('en-IN')}`,
        `₹${Number(item.closingBalance).toLocaleString('en-IN')}`,
        item.status
      ])

      autoTable(doc, {
        head: [[ 'No.', 'Due Date', 'EMI', 'Principal', 'Interest', 'Balance', 'Status' ]],
        body: rows,
        startY: 120,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [220, 53, 69] }
      })
      doc.save(`Loan_Statement_${userData?.vendorNo || 'member'}.pdf`)
    }
  }

  // UPI configuration constants for QR code generation
  const SOCIETY_UPI_ID = "mahadevsociety@sbi"
  const SOCIETY_NAME = "Mahadev Nagar Society"
  const currentPayAmount = selectedEmi?.emi || prepaymentAmount || 0
  const currentTransType = selectedEmi?.id === 'PREPAY' ? "Custom Prepayment" : `EMI Payment #${selectedEmi?.installmentNo || ''}`
  const currentRefId = `Loan-${activeLoan?.loanId || ''}`
  const upiIntentUrl = `upi://pay?pa=${SOCIETY_UPI_ID}&pn=${encodeURIComponent(SOCIETY_NAME)}&am=${currentPayAmount}&cu=INR&tn=${encodeURIComponent(currentTransType + '-' + currentRefId)}`

  return (
    <>
      {/* Toast Notification */}
      {toast.show && (
        <CRow className="mb-3 d-print-none">
          <CCol xs={12}>
            <CAlert color={toast.type} className="d-flex justify-content-between align-items-center shadow-sm" onClose={() => setToast({ ...toast, show: false })}>
              {toast.message}
              <CButton size="sm" variant="ghost" color={toast.type} onClick={() => setToast({ ...toast, show: false })}>✕</CButton>
            </CAlert>
          </CCol>
        </CRow>
      )}

      {/* AI Insights Display Panel */}
      {aiInsights && (
        <CRow className="mb-3 d-print-none animate__animated animate__fadeIn">
          <CCol xs={12}>
            <CAlert color="info" className="d-flex justify-content-between align-items-start shadow-sm border-info">
              <div>
                <h6 className="fw-bold mb-1 text-info"><CIcon icon={cilInfo} className="me-2"/>AI Financial Advisor</h6>
                <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-line' }}>{aiInsights}</p>
              </div>
              <CButton size="sm" variant="ghost" color="info" onClick={() => setAiInsights('')}>✕</CButton>
            </CAlert>
          </CCol>
        </CRow>
      )}

      {/* Error State */}
      {error && (
        <CRow className="mb-3 d-print-none">
          <CCol xs={12}>
            <CAlert color="danger">
              <CIcon icon={cilWarning} className="me-2"/>
              {error}
            </CAlert>
          </CCol>
        </CRow>
      )}

      {/* Loading State */}
      {loading ? (
        <CRow className="justify-content-center align-items-center d-print-none" style={{ minHeight: '400px' }}>
          <CCol xs="auto" className="text-center">
            <CSpinner color="primary" className="mb-3" />
            <p className="text-muted">Loading your secure ledgers...</p>
          </CCol>
        </CRow>
      ) : (
        <CRow className="mb-4">
          <CCol xs={12}>
            <CCard className="shadow-sm border-top-primary border-top-3">
              
              {/* --- HEADER WITH AI BUTTON --- */}
              <CCardHeader className="bg-white py-3 d-flex justify-content-between align-items-center d-print-none">
                <h5 className="mb-0 fw-bold text-dark">My Passbooks & Ledgers</h5>
                <CButton 
                  color="info" 
                  variant="outline" 
                  className="fw-bold shadow-sm d-flex align-items-center" 
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                >
                  {isGeneratingInsights ? <CSpinner size="sm" className="me-2"/> : <CIcon icon={cilInfo} className="me-2"/>}
                  {isGeneratingInsights ? 'Analyzing...' : '✨ Generate AI Insights'}
                </CButton>
              </CCardHeader>

              <CCardBody className="p-4">
                
                {/* ========================================== */}
                {/* SUB-VIEW 1: RD & SAVINGS PASSBOOK          */}
                {/* ========================================== */}
                {activeSubView === 'rd' && (
                  <div className="animate__animated animate__fadeIn">
                    {userData ? (
                      <div>
                        {/* Account Summary */}
                        <CRow className="mb-4 align-items-stretch d-print-none">
                          <CCol md={6} className="mb-3 mb-md-0">
                            <CCard className="bg-success bg-opacity-10 border border-success h-100">
                              <CCardBody className="p-3">
                                <div className="small text-success fw-bold text-uppercase mb-2">📋 Member Details</div>
                                <div className="mb-3">
                                  <small className="text-muted">Vendor Number / ID</small>
                                  <h5 className="text-dark fw-bold mb-0">{userData.vendorNo || 'N/A'}</h5>
                                </div>
                                <div className="row">
                                  <div className="col-6">
                                    <small className="text-muted">Status</small>
                                    <div><CBadge color={userData.status === 'APPROVED' ? 'success' : 'warning'}>{userData.status}</CBadge></div>
                                  </div>
                                  <div className="col-6 text-end">
                                    <small className="text-muted">Member Name</small>
                                    <h6 className="text-dark fw-bold mb-0">{userData.name}</h6>
                                  </div>
                                </div>
                              </CCardBody>
                            </CCard>
                          </CCol>
                          <CCol md={6}>
                            <CCard className="bg-info bg-opacity-10 border border-info h-100">
                              <CCardBody className="p-3">
                                <div className="small text-info fw-bold text-uppercase mb-2">⏰ Savings Info</div>
                                <div className="row">
                                  <div className="col-6">
                                    <small className="text-muted">Monthly RD Deduction</small>
                                    <h5 className="text-dark fw-bold mb-0">₹{(userData.monthlyRDAmount || 0).toLocaleString('en-IN')}</h5>
                                  </div>
                                  <div className="col-6 text-end">
                                    <small className="text-muted">Total Share Capital</small>
                                    <h6 className="text-dark fw-bold mb-0">₹{(userData.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</h6>
                                  </div>
                                </div>
                              </CCardBody>
                            </CCard>
                          </CCol>
                        </CRow>

                        {/* Financial Summary */}
                        <CRow className="mb-4">
                          <CCol md={12} className="mb-3 mb-md-0">
                            <CCard className="text-center bg-success bg-opacity-10 border-success">
                              <CCardBody className="p-4">
                                <div className="text-success small fw-bold mb-2">TOTAL RD ACCUMULATION (BALANCE)</div>
                                <h2 className="text-success fw-bold mb-0">₹{(userData.rdBalance || 0).toLocaleString('en-IN')}</h2>
                              </CCardBody>
                            </CCard>
                          </CCol>
                        </CRow>

                        {/* Action Buttons */}
                        <CRow className="mb-4 d-print-none">
                          <CCol xs={12} className="d-flex gap-2 flex-wrap">
                            <CButton color="success" size="sm" className="fw-bold shadow-sm text-white" onClick={handleExportPDF}>
                              <CIcon icon={cilCloudDownload} className="me-2"/>Export Passbook
                            </CButton>
                            <CButton
                              color="warning"
                              size="sm"
                              className="fw-bold shadow-sm text-white"
                              onClick={() => openWithdrawModal('RD')}
                              disabled={loanOutstanding <= 0 || Number(userData?.rdBalance || 0) <= 0}
                            >
                              <CIcon icon={cilMoney} className="me-2"/>Request RD Withdrawal
                            </CButton>
                          </CCol>
                          <CCol xs={12}>
                            {loanOutstanding <= 0 ? (
                              <small className="text-warning">RD withdrawal is only allowed while a loan outstanding exists.</small>
                            ) : (
                              <small className="text-muted">Maximum RD withdrawal: ₹{rdWithdrawalMax.toLocaleString('en-IN')}</small>
                            )}
                          </CCol>
                        </CRow>

                        {/* Transaction Filter & Search */}
                        <CRow className="mb-3 d-print-none">
                          <CCol md={8}>
                            <div className="input-group shadow-sm">
                              <span className="input-group-text bg-light"><CIcon icon={cilSearch} /></span>
                              <CFormInput 
                                placeholder="Search transactions..." 
                                value={rdSearchQuery}
                                onChange={(e) => {
                                  setRdSearchQuery(e.target.value)
                                  setRdTransactionPage(1)
                                }}
                              />
                            </div>
                          </CCol>
                        </CRow>

                        {/* RD LEDGER TABLE */}
                        <h6 className="mb-3 border-bottom pb-2 fw-bold text-dark">📊 Passbook Ledger</h6>
                        {filteredRdTransactions.length === 0 ? (
                          <CAlert color="info" className="text-center d-print-none">No transactions found for this account.</CAlert>
                        ) : (
                          <div className="table-responsive border rounded shadow-sm">
                            <table className="table table-hover table-striped mb-0 text-center bg-white">
                              <thead className="table-dark">
                                <tr>
                                  <th>Date</th>
                                  <th className="text-start">Description</th>
                                  <th>Ref No</th>
                                  <th className="text-end">Credit (IN)</th>
                                  <th className="text-end">Debit (OUT)</th>
                                  <th className="text-end text-warning">Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedRdTransactions.map((tx) => (
                                  <tr key={tx._id || tx.transactionId}>
                                    <td className="text-muted fw-bold">{new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN')}</td>
                                    <td className="text-start">{tx.description || tx.category}</td>
                                    <td><small className="text-muted">{tx.ledgerFolio || tx.referenceNumber || '-'}</small></td>
                                    
                                    <td className="text-end text-success fw-bold">
                                      {tx.entryType === 'CREDIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-'}
                                    </td>
                                    <td className="text-end text-danger fw-bold">
                                      {tx.entryType === 'DEBIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-'}
                                    </td>
                                    
                                    <td className="text-end fw-bold text-primary bg-light">
                                      ₹{Number(tx.runningBalance).toLocaleString('en-IN')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {filteredRdTransactions.length > itemsPerPage && (
                          <div className="d-flex justify-content-between align-items-center mt-3 d-print-none">
                            <small className="text-muted">Page {rdTransactionPage} of {rdPageCount}</small>
                            <CPagination aria-label="RD transactions pagination">
                              <CPaginationItem disabled={rdTransactionPage === 1} onClick={() => setRdTransactionPage(rdTransactionPage - 1)}>
                                Previous
                              </CPaginationItem>
                              {Array.from({ length: rdPageCount }).map((_, index) => (
                                <CPaginationItem
                                  key={index}
                                  active={rdTransactionPage === index + 1}
                                  onClick={() => setRdTransactionPage(index + 1)}
                                >
                                  {index + 1}
                                </CPaginationItem>
                              ))}
                              <CPaginationItem disabled={rdTransactionPage === rdPageCount} onClick={() => setRdTransactionPage(rdTransactionPage + 1)}>
                                Next
                              </CPaginationItem>
                            </CPagination>
                          </div>
                        )}
                      </div>
                    ) : (
                      <CAlert color="warning" className="d-print-none">No user data found. Please log in again.</CAlert>
                    )}
                  </div>
                )}

                {/* ========================================== */}
                {/* SUB-VIEW 2: ACTIVE LOAN STATEMENT          */}
                {/* ========================================== */}
                {activeSubView === 'loan' && (
                  <div className="animate__animated animate__fadeIn">
                    {activeLoans.length > 0 ? (
                      !selectedLoan ? (
                        <div>
                          <h5 className="mb-4 fw-bold text-dark">My Active Loans</h5>
                          <div className="table-responsive border rounded shadow-sm">
                            <table className="table table-hover table-striped mb-0 text-center bg-white">
                              <thead className="table-dark">
                                <tr>
                                  <th>Loan ID</th>
                                  <th>Issue Date</th>
                                  <th>Loan Amount</th>
                                  <th>Outstanding</th>
                                  <th>Progress</th>
                                  <th>Status</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeLoans.map((loan, idx) => {
                                  const paid = Number(loan.loanAmount || 0) - Number(loan.principalPending !== undefined ? loan.principalPending : loan.loanAmount || 0);
                                  const percent = loan.loanAmount > 0 ? Math.min(100, Math.max(0, Math.round((paid / loan.loanAmount) * 100))) : 0;
                                  return (
                                  <tr key={loan._id || idx} className="align-middle">
                                    <td className="fw-bold">{loan.loanId || 'N/A'}</td>
                                    <td>{new Date(loan.startDate || loan.createdAt).toLocaleDateString('en-IN')}</td>
                                    <td className="text-info fw-bold">₹{Number(loan.loanAmount || 0).toLocaleString('en-IN')}</td>
                                    <td className="text-danger fw-bold">
                                      ₹{Number(loan.principalPending !== undefined ? loan.principalPending : loan.loanAmount || 0).toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ minWidth: '120px' }}>
                                      <div className="progress rounded-pill shadow-sm mb-1" style={{ height: '8px', backgroundColor: '#e9ecef' }}>
                                        <div className="progress-bar bg-success" role="progressbar" style={{ width: `${percent}%` }} aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"></div>
                                      </div>
                                      <small className="text-muted fw-bold">{percent}% Paid</small>
                                    </td>
                                    <td>
                                      <CBadge color={loan.status === 'APPROVED' ? 'success' : loan.status === 'ACTIVE' ? 'primary' : 'warning'}>
                                        {loan.status}
                                      </CBadge>
                                    </td>
                                    <td>
                                      <CButton size="sm" color="info" className="text-white shadow-sm" onClick={() => setSelectedLoan(loan)}>
                                        View Statement
                                      </CButton>
                                    </td>
                                  </tr>
                                )})}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : activeLoan.status?.toUpperCase() === 'PENDING' ? (
                        <div className="animate__animated animate__fadeIn mt-2 d-print-none">
                          <CButton color="secondary" variant="ghost" className="mb-3" onClick={() => setSelectedLoan(null)}>
                            ← Back to Loans
                          </CButton>
                          <CAlert color="warning" className="text-center p-5 border border-warning shadow-sm">
                            <CIcon icon={cilWarning} size="3xl" className="mb-3 text-warning"/>
                            <h4 className="fw-bold text-dark mb-3">Application Under Review</h4>
                            <p className="text-dark fs-6 mb-1">
                              Your loan application for <strong className="text-primary fs-5">₹{(activeLoan.loanAmount || 0).toLocaleString('en-IN')}</strong> is currently pending Admin approval.
                            </p>
                            <p className="text-muted small mt-2">Application ID: {activeLoan.loanId || 'N/A'}</p>
                            <CBadge color="warning" className="mt-3 text-dark px-3 py-2">STATUS: PENDING</CBadge>
                          </CAlert>
                        </div>
                      ) : (
                        <div>
                          <CButton color="secondary" variant="ghost" className="mb-3 d-print-none" onClick={() => setSelectedLoan(null)}>
                            ← Back to Loans
                          </CButton>
                          {/* Loan Summary */}
                          <CCard className="mb-4 bg-danger bg-opacity-10 border border-danger">
                            <CCardBody className="p-4">
                              <CRow>
                                <CCol md={4} className="border-end">
                                  <small className="text-danger fw-bold text-uppercase">🏦 Loan Account</small>
                                  <h5 className="text-dark fw-bold mb-1">{activeLoan.loanId || 'Processing...'}</h5>
                                  <small className="text-muted">Rate: <span className="fw-bold text-dark">{activeLoan.interestRate || 10}% p.a.</span></small>
                                </CCol>
                                <CCol md={4} className="border-end px-md-4">
                                  <small className="text-muted">Original Loan Amount</small>
                                  <h4 className="text-dark fw-bold mb-1">₹{Number(activeLoan.loanAmount || 0).toLocaleString('en-IN')}</h4>
                                  <small className="text-muted">Tenure: <span className="fw-bold text-dark">{activeLoan.tenure || 12} Months</span></small>
                                </CCol>
                                <CCol md={4} className="px-md-4">
                                  <small className="text-muted">Total Outstanding Principal</small>
                                  <h3 className="text-danger fw-bold mb-0">
                                    ₹{Number(activeLoan.principalPending !== undefined ? activeLoan.principalPending : activeLoan.loanAmount).toLocaleString('en-IN')}
                                  </h3>
                                </CCol>
                              </CRow>
                              <CRow className="mt-4 text-center">
                                <CCol md={4} className="mb-3 mb-md-0">
                                  <div className="bg-white rounded border p-3 h-100 shadow-sm">
                                    <small className="text-muted">Total Paid</small>
                                    <div className="fw-bold fs-5 text-success">₹{loanTotals.totalPaid.toLocaleString('en-IN')}</div>
                                  </div>
                                </CCol>
                                <CCol md={4} className="mb-3 mb-md-0">
                                  <div className="bg-white rounded border p-3 h-100 shadow-sm">
                                    <small className="text-muted">Interest Paid</small>
                                    <div className="fw-bold fs-5 text-danger">₹{loanTotals.totalInterest.toLocaleString('en-IN')}</div>
                                  </div>
                                </CCol>
                                <CCol md={4}>
                                  <div className="bg-white rounded border p-3 h-100 shadow-sm">
                                    <small className="text-muted">Remaining Due</small>
                                    <div className="fw-bold fs-5 text-warning">₹{loanTotals.totalDue.toLocaleString('en-IN')}</div>
                                  </div>
                                </CCol>
                              </CRow>
                              <CRow className="mt-4 d-print-none">
                                <CCol>
                                  <div className="small text-muted mb-2">Loan repayment progress</div>
                                  <div className="progress rounded-pill shadow-sm" style={{ height: '20px', backgroundColor: '#e9ecef' }}>
                                    <div
                                      className="progress-bar bg-success"
                                      role="progressbar"
                                      style={{ width: `${loanPaidPercent}%` }}
                                      aria-valuenow={loanPaidPercent}
                                      aria-valuemin="0"
                                      aria-valuemax="100"
                                    >
                                      {loanPaidPercent}% paid
                                    </div>
                                  </div>
                                </CCol>
                              </CRow>
                            </CCardBody>
                          </CCard>

                          {/* Action Buttons & Filter */}
                          <CRow className="mb-4 d-print-none">
                            <CCol md={8} className="d-flex gap-2 flex-wrap mb-3 mb-md-0">
                              <CButton color="danger" size="sm" className="fw-bold shadow-sm" onClick={handleExportPDF}>
                                <CIcon icon={cilCloudDownload} className="me-2"/>Export Statement
                              </CButton>
                              <CButton color="success" size="sm" className="fw-bold shadow-sm text-white" onClick={() => setPrepaymentModal(true)}>
                                <CIcon icon={cilMoney} className="me-2"/>Custom Payment
                              </CButton>
                              <CButton
                                color="warning"
                                size="sm"
                                className="fw-bold shadow-sm text-white"
                                onClick={() => openWithdrawModal('SHARE')}
                                disabled={!canWithdrawShare}
                              >
                                <CIcon icon={cilMoney} className="me-2"/>Request Share Withdrawal
                              </CButton>
                            </CCol>
                            <CCol md={4}>
                              <CFormSelect className="shadow-sm" value={loanFilter} onChange={(e) => setLoanFilter(e.target.value)}>
                                <option value="ALL">Full Schedule</option>
                                <option value="PAID">Paid Only</option>
                                <option value="DUE">Due Only</option>
                              </CFormSelect>
                            </CCol>
                          </CRow>

                          {/* AMORTIZATION SCHEDULE TABLE */}
                          <h6 className="mb-3 border-bottom pb-2 fw-bold text-dark">📅 Official Amortization Schedule</h6>
                          
                          {(!filteredSchedule || filteredSchedule.length === 0) ? (
                            <CAlert color="info" className="text-center d-print-none">Schedule is generating...</CAlert>
                          ) : (
                            <>
                              <div className="table-responsive border rounded shadow-sm">
                                <table className="table table-hover table-striped mb-0 text-center bg-white">
                                  <thead className="table-dark">
                                    <tr>
                                      <th>No.</th>
                                      <th>Due Date</th>
                                      <th>EMI Amount</th>
                                      <th className="text-info">Principal</th>
                                      <th className="text-danger">Interest</th>
                                      <th className="text-warning">Closing Balance</th>
                                      <th>Status</th>
                                      <th className="d-print-none">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredSchedule.slice((loanPage - 1) * itemsPerPage, loanPage * itemsPerPage).map((item, index) => (
                                      <tr key={index}>
                                        <td className="text-muted fw-bold">{item.installmentNo}</td>
                                        <td>
                                          {item.dueDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', day: 'numeric' })}
                                        </td>
                                        <td className="fw-bold">₹{Number(item.emi).toLocaleString('en-IN')}</td>
                                        <td className="text-info fw-bold">₹{Number(item.principal).toLocaleString('en-IN')}</td>
                                        <td className="text-danger fw-bold">₹{Number(item.interest).toLocaleString('en-IN')}</td>
                                        <td className="text-warning fw-bold bg-light">₹{Number(item.closingBalance).toLocaleString('en-IN')}</td>
                                        <td>
                                          <CBadge color={item.status === 'PAID' ? 'success' : 'warning'}>{item.status}</CBadge>
                                        </td>
                                        <td className="d-print-none">
                                          {item.status === 'DUE' ? (
                                            <CButton size="sm" color="primary" className="shadow-sm" onClick={() => triggerPayNow({ id: item.installmentNo, emi: item.emi, installmentNo: item.installmentNo })}>
                                              Pay Now
                                            </CButton>
                                          ) : (
                                            <span className="text-muted">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {filteredSchedule.length > itemsPerPage && (
                                <div className="d-flex justify-content-between align-items-center mt-3 d-print-none">
                                  <small className="text-muted">Page {loanPage} of {loanPageCount}</small>
                                  <CPagination aria-label="Loan schedule pagination">
                                    <CPaginationItem disabled={loanPage === 1} onClick={() => setLoanPage(loanPage - 1)}>
                                      Previous
                                    </CPaginationItem>
                                    {Array.from({ length: loanPageCount }).map((_, index) => (
                                      <CPaginationItem
                                        key={index}
                                        active={loanPage === index + 1}
                                        onClick={() => setLoanPage(index + 1)}
                                      >
                                        {index + 1}
                                      </CPaginationItem>
                                    ))}
                                    <CPaginationItem disabled={loanPage === loanPageCount} onClick={() => setLoanPage(loanPage + 1)}>
                                      Next
                                    </CPaginationItem>
                                  </CPagination>
                                </div>
                              )}
                              <div className="mt-4">
                                  <h6 className="mb-3 border-bottom pb-2 fw-bold text-dark d-print-none">🧾 Loan Payment History</h6>
                                {paymentHistory.filter(tx => tx.relatedLoanId === activeLoan._id || !tx.relatedLoanId).length === 0 ? (
                                  <CAlert color="info" className="d-print-none shadow-sm">No loan payments have been recorded yet.</CAlert>
                                ) : (
                                  <div className="table-responsive border rounded shadow-sm d-print-none">
                                    <table className="table table-hover table-striped mb-0 text-center bg-white small">
                                      <thead className="table-dark">
                                        <tr>
                                          <th>Date</th>
                                          <th>EMI #</th>
                                          <th>Amount</th>
                                          <th>Mode</th>
                                          <th>Status</th>
                                          <th>Reference</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {paymentHistory.filter(tx => tx.relatedLoanId === activeLoan._id || !tx.relatedLoanId).map((payment, idx) => (
                                          <tr key={payment.id || idx}>
                                            <td>{new Date(payment.date || payment.createdAt).toLocaleDateString('en-IN')}</td>
                                            <td>{payment.emiNo || '-'}</td>
                                            <td className="fw-bold text-success">₹{Number(payment.amount || payment.emi || 0).toLocaleString('en-IN')}</td>
                                            <td>{payment.paymentMode || payment.mode || '-'}</td>
                                            <td>
                                              <CBadge color={payment.status === 'COMPLETED' || payment.status === 'CLEARED' ? 'success' : 'warning'}>
                                                {payment.status || 'PENDING'}
                                              </CBadge>
                                            </td>
                                            <td className="text-muted font-monospace">{payment.referenceNumber || payment.reference || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    ) : (
                      <CAlert color="success" className="text-center p-5 mt-2 d-print-none shadow-sm border-success">
                        <CIcon icon={cilCheckCircle} size="3xl" className="mb-3 text-success"/>
                        <h4>No Active Loans</h4>
                        <p className="text-muted">You do not currently have any active loans with the society.</p>
                        {shareBalance > 0 ? (
                          <CButton color="warning" size="sm" className="fw-bold mt-3" onClick={() => openWithdrawModal('SHARE')}>
                            <CIcon icon={cilMoney} className="me-2"/>Request Share Withdrawal
                          </CButton>
                        ) : null}
                      </CAlert>
                    )}
                  </div>
                )}
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      )}

      <CModal visible={withdrawModalVisible} onClose={() => setWithdrawModalVisible(false)} backdrop="static" alignment="center" size="md">
        <CModalHeader className="border-bottom bg-light">
          <CModalTitle className="text-warning fw-bold">
            {withdrawType === 'RD' ? 'Request RD Withdrawal' : 'Request Share Withdrawal'}
          </CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          <div className="mb-4 p-3 bg-light rounded border shadow-sm">
            {withdrawType === 'RD' ? (
              <>
                <div className="small text-muted">Available RD Balance</div>
                <div className="fw-bold fs-4 text-success">₹{Number(userData?.rdBalance || 0).toLocaleString('en-IN')}</div>
                <div className="small text-muted mt-2">Loan outstanding limit</div>
                <div className="fw-bold fs-5 text-danger">₹{loanOutstanding.toLocaleString('en-IN')}</div>
                <div className="small text-muted">Maximum allowable withdrawal</div>
                <div className="fw-bold text-dark">₹{rdWithdrawalMax.toLocaleString('en-IN')}</div>
              </>
            ) : (
              <>
                <div className="small text-muted">Available Share Money</div>
                <div className="fw-bold fs-4 text-success">₹{shareBalance.toLocaleString('en-IN')}</div>
                <div className="small text-muted mt-2">Loan outstanding</div>
                <div className="fw-bold text-danger">₹{loanOutstanding.toLocaleString('en-IN')}</div>
              </>
            )}
          </div>

          <CForm>
            <div className="mb-3">
              <CFormLabel className="fw-bold">Withdrawal Amount</CFormLabel>
              <div className="input-group shadow-sm">
                <span className="input-group-text bg-light">₹</span>
                <CFormInput
                  type="number"
                  min="0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
            </div>
            <div className="mb-3">
              <CFormLabel className="fw-bold">Member UPI ID (Optional)</CFormLabel>
              <CFormInput
                type="text"
                value={withdrawUpiId}
                onChange={(e) => setWithdrawUpiId(e.target.value)}
                placeholder="example@okicici"
                className="shadow-sm"
              />
              <small className="text-muted d-block mt-1">
                If provided, admin will receive a QR code for the withdrawal amount and UPI ID.
              </small>
            </div>
            <div className="mb-3">
              <CFormLabel className="fw-bold">Reason for Withdrawal</CFormLabel>
              <CFormInput
                type="text"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="Optional note"
                className="shadow-sm"
              />
            </div>
            <div className="text-muted small">Note: Share withdrawal is permitted only after loan clearance.</div>
          </CForm>
        </CModalBody>
        <CModalFooter className="bg-light">
          <CButton color="secondary" variant="ghost" onClick={() => setWithdrawModalVisible(false)}>Cancel</CButton>
          <CButton color="warning" className="fw-bold text-white" onClick={handleWithdrawSubmit} disabled={isWithdrawing}>
            {isWithdrawing ? <CSpinner size="sm" className="me-2" /> : 'Submit Withdrawal'}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* --- INTEGRATED QR CODE GATEWAY MODAL --- */}
      <CModal visible={payNowModal} onClose={() => setPayNowModal(false)} backdrop="static" alignment="center" size="lg">
        <CModalHeader className="border-bottom bg-light">
          <CModalTitle className="text-primary fw-bold">💳 Process Loan Repayment</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {selectedEmi && (
            <>
              <div className="mb-4 p-3 bg-info bg-opacity-10 rounded border text-center shadow-sm">
                <small className="text-muted text-uppercase fw-bold">Amount to Pay</small>
                <h3 className="text-info fw-bold mb-0">₹{currentPayAmount.toLocaleString('en-IN')}</h3>
              </div>

              <div className="mb-3">
                <CFormLabel className="fw-bold">Payment Mode</CFormLabel>
                <CFormSelect value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="shadow-sm">
                  <option value="UPI">UPI / Online Transfer</option>
                  <option value="CHEQUE">Bank Cheque</option>
                  <option value="CASH">Cash Deposit</option>
                </CFormSelect>
              </div>

              {paymentMode === 'UPI' && (
                <div className="text-center mb-4 p-3 bg-light rounded border shadow-sm">
                  <div className="mb-2 d-flex justify-content-center">
                    <QRCodeSVG value={upiIntentUrl} size={160} level="H" includeMargin={true} />
                  </div>
                  <div className="small text-muted">Scan using any UPI App (GPay, PhonePe, Paytm)</div>
                  <div className="fw-bold text-dark mt-1">UPI ID: {SOCIETY_UPI_ID}</div>
                </div>
              )}

              <div className="mb-3">
                <CFormLabel className="fw-bold">
                  {paymentMode === 'CHEQUE' ? 'Cheque Number' : 'Reference / UTR Number'} <span className="text-danger">*</span>
                </CFormLabel>
                <CFormInput 
                  type="text" 
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder={paymentMode === 'CHEQUE' ? "e.g. 000123" : "e.g. 319283746510"}
                  className="shadow-sm font-monospace"
                />
              </div>

              <div className="mb-3">
                <CFormLabel className="fw-bold">Upload Receipt / Cheque Image <span className="text-danger">*</span></CFormLabel>
                <CFormInput 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => setReceiptFile(e.target.files[0])}
                  className="shadow-sm"
                />
              </div>

              <div className="mb-4">
                <CFormLabel className="fw-bold">Remarks (Optional)</CFormLabel>
                <CFormInput 
                  type="text" 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any additional notes..."
                  className="shadow-sm"
                />
              </div>

              <CButton 
                color="primary" 
                className="w-100 fw-bold text-white shadow-sm py-2"
                disabled={isProcessing || !referenceNo || !receiptFile}
                onClick={() => handleMemberPayment(referenceNo, receiptFile, remarks, paymentMode)}
              >
                {isProcessing ? <CSpinner size="sm" className="me-2" /> : 'Submit Payment Details'}
              </CButton>
            </>
          )}
        </CModalBody>
      </CModal>

      {/* Prepayment Modal */}
      <CModal visible={prepaymentModal} onClose={() => setPrepaymentModal(false)} backdrop="static" alignment="center">
        <CModalHeader className="border-bottom">
          <CModalTitle className="text-success fw-bold">💸 Make Custom Loan Payment</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          <div className="mb-4 p-3 bg-success bg-opacity-10 rounded border shadow-sm">
            <small className="text-muted">Total Outstanding</small>
            <h4 className="text-success fw-bold mb-0">₹{((activeLoan?.principalPending || 0) + (activeLoan?.interestPending || 0)).toLocaleString('en-IN')}</h4>
          </div>
          <CForm>
            <div className="mb-3">
              <CFormLabel className="fw-bold">Payment Amount</CFormLabel>
              <div className="input-group shadow-sm">
                <span className="input-group-text bg-light">₹</span>
                <CFormInput 
                  type="number" 
                  value={prepaymentAmount}
                  onChange={(e) => setPrepaymentAmount(e.target.value)}
                  min="1"
                />
              </div>
            </div>
          </CForm>
        </CModalBody>
        <CModalFooter className="bg-light">
          <CButton color="secondary" variant="ghost" onClick={() => setPrepaymentModal(false)}>Cancel</CButton>
          <CButton color="success" onClick={handlePrepayment} className="px-4 fw-bold text-white shadow-sm">Proceed to Pay</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default MyPassbooks
