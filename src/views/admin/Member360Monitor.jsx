import React, { useState, useEffect, useMemo } from 'react'
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CFormSelect,
  CFormInput, CAlert, CSpinner, CNav, CNavItem, CNavLink, CTabContent, CTabPane, CProgress
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { 
  cilUser, cilSearch, cilCloudDownload, cilMoney, cilBank, 
  cilWallet, cilWarning, cilCheckCircle, cilPencil, cilSpreadsheet,
  cilChartPie, cilDescription
} from '@coreui/icons'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const Member360Monitor = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken')

  const [members, setMembers] = useState([])
  const [selectedVendorNo, setSelectedVendorNo] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  const [activeTab, setActiveTab] = useState('overview')

  // Financial Data state for selected member
  const [loans, setLoans] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // Reset selected loan when selected vendor changes
  useEffect(() => {
    setSelectedLoan(null)
  }, [selectedVendorNo])

  // Helper: Draw official Mahadev Society Logo and PDF Header
  const drawPDFHeader = (doc, titleText, isLandscape = false) => {
    const pageWidth = isLandscape ? 842 : 595

    doc.setFillColor(30, 60, 114) // #1e3c72
    doc.rect(0, 0, pageWidth, 10, 'F')

    try {
      const img = new Image()
      img.src = '/logo.png'
      doc.addImage(img, 'PNG', 40, 20, 50, 50)
    } catch (err) {
      console.warn('PDF Header logo image fallback', err)
    }

    doc.setTextColor(30, 60, 114)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('MAHADEV CO-OPERATIVE THRIFT & CREDIT SOCIETY', 100, 36)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('HPSEBL Shimla — Registered Employees Co-operative Society', 100, 48)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(titleText, 100, 64)

    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.8)
    doc.line(40, 76, pageWidth - 40, 76)
  }

  // PDF Export for specific loan
  const exportLoanPDF = (targetLoan) => {
    if (!selectedMember || !targetLoan) return
    const doc = new jsPDF('portrait', 'pt', 'a4')

    drawPDFHeader(doc, `Official Loan Statement - ${targetLoan.loanId || 'Loan'}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50, 50, 50)

    doc.text(`Member Name: ${selectedMember.name}`, 40, 94)
    doc.text(`Vendor No: ${selectedMember.vendorNo}`, 40, 108)
    doc.text(`Sanctioned Amount: Rs. ${(targetLoan.loanAmount || 0).toLocaleString('en-IN')}`, 40, 122)
    
    const pendingAmount = targetLoan.principalPending !== undefined ? targetLoan.principalPending : targetLoan.loanAmount || 0
    doc.text(`Principal Pending: Rs. ${pendingAmount.toLocaleString('en-IN')}`, 300, 94)
    doc.text(`Tenure: ${targetLoan.tenure || 12} Months`, 300, 108)
    doc.text(`Status: ${targetLoan.status} | Date: ${new Date().toLocaleDateString('en-IN')}`, 300, 122)

    const tenure = targetLoan.tenure || 12
    const amount = targetLoan.loanAmount || 0
    const startDate = new Date(targetLoan.createdAt || targetLoan.startDate || new Date())
    const annualInterestRate = targetLoan.interestRate || 10
    const monthlyRate = (annualInterestRate / 100) / 12

    let trueEmi = 0
    if (monthlyRate > 0) {
      trueEmi = Math.round((amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1))
    } else {
      trueEmi = Math.round(amount / tenure)
    }

    let outstanding = amount
    const rows = []
    for (let i = 1; i <= tenure; i++) {
      const dueDate = new Date(startDate)
      dueDate.setMonth(dueDate.getMonth() + i)
      let interestComp = Math.round(outstanding * monthlyRate)
      let principalComp = trueEmi - interestComp
      if (i === tenure || principalComp > outstanding) {
        principalComp = outstanding
      }
      outstanding -= principalComp
      if (outstanding < 0) outstanding = 0
      rows.push([
        i,
        dueDate.toLocaleDateString('en-IN'),
        `Rs. ${trueEmi.toLocaleString('en-IN')}`,
        `Rs. ${principalComp.toLocaleString('en-IN')}`,
        `Rs. ${interestComp.toLocaleString('en-IN')}`,
        `Rs. ${outstanding.toLocaleString('en-IN')}`
      ])
    }

    autoTable(doc, {
      head: [['Installment', 'Due Date', 'EMI Amount', 'Principal', 'Interest', 'Closing Balance']],
      body: rows,
      startY: 138,
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [30, 60, 114] }
    })

    doc.save(`Loan_Statement_${selectedMember.vendorNo}_${targetLoan.loanId || 'loan'}.pdf`)
  }

  // 1. Fetch directory of all members for selection
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        setLoadingMembers(true)
        const res = await fetch(`${apiBase}/api/auth/users`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const memberList = Array.isArray(data) ? data : data.members || []
          setMembers(memberList)
          if (memberList.length > 0) {
            setSelectedVendorNo(memberList[0].vendorNo)
          }
        }
      } catch (err) {
        console.error("Failed to fetch directory:", err)
      } finally {
        setLoadingMembers(false)
      }
    }
    fetchDirectory()
  }, [apiBase, token])

  // 2. Fetch specific member details when selectedVendorNo changes
  useEffect(() => {
    if (!selectedVendorNo) return

    const fetchMemberData = async () => {
      setLoadingDetails(true)
      setError(null)
      try {
        const found = members.find(m => String(m.vendorNo) === String(selectedVendorNo))
        setSelectedMember(found || null)

        // Fetch member's specific loans
        const loanRes = await fetch(`${apiBase}/api/loans/my-loans?vendorNo=${selectedVendorNo}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (loanRes.ok) {
          const loanData = await loanRes.json()
          setLoans(loanData.loans || [])
        } else {
          setLoans([])
        }

        // Fetch member's specific transactions
        const txRes = await fetch(`${apiBase}/api/transactions/my-transactions?vendorNo=${selectedVendorNo}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (txRes.ok) {
          const txData = await txRes.json()
          setTransactions(txData.transactions || txData || [])
        } else {
          setTransactions([])
        }
      } catch (err) {
        console.error("Error loading member 360 data:", err)
        setError("Failed to load details for this member.")
      } finally {
        setLoadingDetails(false)
      }
    }

    fetchMemberData()
  }, [selectedVendorNo, members, apiBase, token])

  // Sorting state for Loans & Passbook tables
  const [loanSortConfig, setLoanSortConfig] = useState({ key: null, direction: 'asc' })
  const [rdSortConfig, setRdSortConfig] = useState({ key: 'transactionDate', direction: 'desc' })

  const handleLoanSort = (key) => {
    let direction = 'asc'
    if (loanSortConfig.key === key && loanSortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setLoanSortConfig({ key, direction })
  }

  const handleRdSort = (key) => {
    let direction = 'asc'
    if (rdSortConfig.key === key && rdSortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setRdSortConfig({ key, direction })
  }

  const getSortIcon = (config, key) => {
    if (config.key !== key) return ' ⇅'
    return config.direction === 'asc' ? ' ▲' : ' ▼'
  }

  // Calculated totals & sorted lists
  const sortedRdTransactions = useMemo(() => {
    const list = transactions.filter(tx => tx.category === 'RD' || tx.category === 'SHARE' || tx.category === 'INTEREST')
    if (!rdSortConfig.key) return list
    return [...list].sort((a, b) => {
      let aVal, bVal
      if (rdSortConfig.key === 'transactionDate') {
        aVal = new Date(a.transactionDate || a.createdAt || 0).getTime()
        bVal = new Date(b.transactionDate || b.createdAt || 0).getTime()
      } else if (rdSortConfig.key === 'amount') {
        aVal = Number(a.amount || 0)
        bVal = Number(b.amount || 0)
      } else {
        aVal = String(a[rdSortConfig.key] || '').toLowerCase()
        bVal = String(b[rdSortConfig.key] || '').toLowerCase()
      }

      if (aVal < bVal) return rdSortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return rdSortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [transactions, rdSortConfig])

  const sortedLoans = useMemo(() => {
    if (!loanSortConfig.key) return loans
    return [...loans].sort((a, b) => {
      let aVal, bVal
      if (loanSortConfig.key === 'loanId') {
        aVal = String(a.loanId || a._id || '').toLowerCase()
        bVal = String(b.loanId || b._id || '').toLowerCase()
      } else if (loanSortConfig.key === 'issueDate') {
        aVal = new Date(a.startDate || a.issueDate || a.createdAt || 0).getTime()
        bVal = new Date(b.startDate || b.issueDate || b.createdAt || 0).getTime()
      } else if (loanSortConfig.key === 'principalPending') {
        aVal = Number(a.principalPending !== undefined ? a.principalPending : a.loanAmount || 0)
        bVal = Number(b.principalPending !== undefined ? b.principalPending : b.loanAmount || 0)
      } else if (loanSortConfig.key === 'loanAmount' || loanSortConfig.key === 'tenure') {
        aVal = Number(a[loanSortConfig.key] || 0)
        bVal = Number(b[loanSortConfig.key] || 0)
      } else {
        aVal = String(a[loanSortConfig.key] || '').toLowerCase()
        bVal = String(b[loanSortConfig.key] || '').toLowerCase()
      }

      if (aVal < bVal) return loanSortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return loanSortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [loans, loanSortConfig])

  const loanTransactions = useMemo(() => {
    return transactions.filter(tx => tx.category === 'LOAN_REPAYMENT' || tx.category === 'LOAN_EMI' || tx.category === 'LOAN_DISBURSEMENT')
  }, [transactions])

  const activeLoan = loans.find(l => l.status === 'ACTIVE' || l.status === 'APPROVED') || loans[0]

  const totalOutstanding = useMemo(() => {
    return loans.reduce((acc, l) => acc + (Number(l.principalPending || l.loanAmount || 0)), 0)
  }, [loans])

  // Export PDF 360 Statement
  const exportPDF = () => {
    if (!selectedMember) return
    const doc = new jsPDF('portrait', 'pt', 'a4')

    drawPDFHeader(doc, `Official Member 360 Audit Statement`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50, 50, 50)

    doc.text(`Member Name: ${selectedMember.name}`, 40, 94)
    doc.text(`Vendor No: ${selectedMember.vendorNo}`, 40, 108)
    doc.text(`Designation: ${selectedMember.designation || 'N/A'}`, 300, 94)
    doc.text(`Generated Date: ${new Date().toLocaleDateString('en-IN')}`, 300, 108)

    // Table 1: Financial Metrics Overview
    const summaryRows = [
      ['Share Capital', `Rs. ${(selectedMember.currentShareMoneyTotal || 0).toLocaleString('en-IN')}`],
      ['RD Balance', `Rs. ${(selectedMember.rdBalance || 0).toLocaleString('en-IN')}`],
      ['Total Active Loans', loans.length.toString()],
      ['Total Loan Outstanding', `Rs. ${totalOutstanding.toLocaleString('en-IN')}`],
      ['Defaulter Status', selectedMember.defaulterStatus ? 'DEFAULTER (FLAGGED)' : 'Good Standing']
    ]

    autoTable(doc, {
      head: [['Financial Metric', 'Current Value']],
      body: summaryRows,
      startY: 122,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 60, 114] }
    })

    let currentY = doc.lastAutoTable.finalY + 22

    // Table 2: Loan Accounts Portfolio (ALL LOANS)
    if (loans.length > 0) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 60, 114)
      doc.text(`Loan Accounts & Outstanding Portfolio (${loans.length} Loans)`, 40, currentY)

      const loanRows = loans.map(loan => {
        const amount = Number(loan.loanAmount || 0)
        const pending = Number(loan.principalPending !== undefined ? loan.principalPending : loan.loanAmount || 0)
        const issueDate = loan.startDate || loan.issueDate || loan.createdAt
        return [
          loan.loanId || `LN-${loan._id}`,
          issueDate ? new Date(issueDate).toLocaleDateString('en-IN') : '-',
          `Rs. ${amount.toLocaleString('en-IN')}`,
          `Rs. ${pending.toLocaleString('en-IN')}`,
          `${loan.tenure || 12} Mos`,
          loan.status
        ]
      })

      autoTable(doc, {
        head: [['Loan ID', 'Issue Date', 'Sanctioned Amount', 'Principal Pending', 'Tenure', 'Status']],
        body: loanRows,
        startY: currentY + 10,
        styles: { fontSize: 8.5, cellPadding: 4 },
        headStyles: { fillColor: [42, 82, 152] }
      })

      currentY = doc.lastAutoTable.finalY + 22
    }

    // Table 3: RD & Savings Ledger
    if (rdTransactions.length > 0) {
      if (currentY > 700) {
        doc.addPage()
        currentY = 40
      }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 60, 114)
      doc.text("Recent RD & Savings Ledger", 40, currentY)

      const rdRows = rdTransactions.slice(0, 15).map(tx => [
        new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN'),
        tx.description || tx.category,
        tx.entryType === 'CREDIT' ? `Rs. ${Number(tx.amount).toLocaleString('en-IN')}` : '-',
        tx.entryType === 'DEBIT' ? `Rs. ${Number(tx.amount).toLocaleString('en-IN')}` : '-'
      ])

      autoTable(doc, {
        head: [['Date', 'Description', 'Credit (IN)', 'Debit (OUT)']],
        body: rdRows,
        startY: currentY + 10,
        styles: { fontSize: 8.5, cellPadding: 4 }
      })
    }

    doc.save(`Member_360_${selectedMember.vendorNo}.pdf`)
  }

  return (
    <>
      <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h4 className="mb-0 text-dark fw-bold">Member 360 Monitor</h4>
          <div className="small text-muted">Admin live statement inspector & member account progress tracker.</div>
        </div>
        <CButton color="primary" size="sm" className="fw-bold shadow-sm text-white" onClick={exportPDF} disabled={!selectedMember}>
          <CIcon icon={cilCloudDownload} className="me-2"/> Export Full 360 PDF
        </CButton>
      </div>

      {toast.show && (
        <CAlert color={toast.type} className="mb-3" dismissible onClose={() => setToast({ ...toast, show: false })}>
          {toast.message}
        </CAlert>
      )}

      {/* MEMBER SELECTOR CARD */}
      <CCard className="mb-4 shadow-sm border-0 border-top border-3 border-primary">
        <CCardBody className="p-3">
          <CRow className="align-items-center g-3">
            <CCol md={3} className="fw-bold text-dark">
              <CIcon icon={cilSearch} className="me-2 text-primary" /> Select Member to Monitor:
            </CCol>
            <CCol md={5} className="position-relative">
              <CFormInput
                type="text"
                placeholder="🔍 Type Name or Vendor No to filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="shadow-sm border-primary"
              />
              {searchQuery && (
                <div 
                  className="position-absolute bg-white shadow-lg border rounded w-100 mt-1" 
                  style={{ zIndex: 1000, maxHeight: '250px', overflowY: 'auto' }}
                >
                  {members
                    .filter(m => {
                      const q = searchQuery.toLowerCase();
                      return (
                        m.name?.toLowerCase().includes(q) ||
                        String(m.vendorNo).toLowerCase().includes(q) ||
                        m.designation?.toLowerCase().includes(q)
                      );
                    })
                    .map(m => (
                      <div 
                        key={m.vendorNo}
                        className="p-2 border-bottom hover-bg-light cursor-pointer d-flex justify-content-between align-items-center"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedVendorNo(m.vendorNo);
                          setSearchQuery('');
                        }}
                      >
                        <div>
                          <strong className="text-primary">{m.name}</strong>
                          <small className="text-muted d-block">Vendor No: {m.vendorNo} | {m.designation || 'Member'}</small>
                        </div>
                        <CBadge color="info">Select</CBadge>
                      </div>
                    ))}
                </div>
              )}
            </CCol>
            <CCol md={4}>
              {loadingMembers ? (
                <div className="d-flex align-items-center gap-2"><CSpinner size="sm"/> Loading members...</div>
              ) : (
                <CFormSelect 
                  size="md"
                  value={selectedVendorNo}
                  onChange={(e) => setSelectedVendorNo(e.target.value)}
                  className="shadow-sm border-primary fw-bold"
                  style={{ borderRadius: '0.5rem' }}
                >
                  <option value="">-- All Members ({members.length}) --</option>
                  {members.map(m => (
                    <option key={m.vendorNo} value={m.vendorNo}>
                      {m.name} (Vendor: {m.vendorNo})
                    </option>
                  ))}
                </CFormSelect>
              )}
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>

      {/* MEMBER 360° SUMMARY PANEL */}
      {loadingDetails ? (
        <div className="text-center py-5">
          <CSpinner color="primary"/>
          <div className="mt-2 text-muted fw-bold">Fetching member statement data...</div>
        </div>
      ) : selectedMember ? (
        <>
          {/* PROFILE KPI HEADER CARD */}
          <CCard className="mb-4 shadow-sm border-0" style={{ background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: '#ffffff' }}>
            <CCardBody className="p-4">
              <CRow className="align-items-center">
                <CCol md={6} className="mb-3 mb-md-0">
                  <div className="d-flex align-items-center">
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '50%',
                      background: 'rgba(255,255,255,0.25)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.6rem', fontWeight: 'bold', marginRight: '1rem',
                      color: '#ffffff', border: '2px solid rgba(255,255,255,0.4)'
                    }}>
                      {selectedMember.name ? selectedMember.name.charAt(0).toUpperCase() : 'M'}
                    </div>
                    <div>
                      <h2 className="fw-bold mb-1 text-white" style={{ color: '#ffffff', fontSize: '1.75rem', letterSpacing: '0.5px' }}>
                        {selectedMember.name}
                      </h2>
                      <div className="small" style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.95rem' }}>
                        Vendor No: <strong className="text-white">{selectedMember.vendorNo}</strong> | {selectedMember.designation || 'Member'}
                      </div>
                      <div className="small" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                        {selectedMember.circle || 'Shimla Circle'} — {selectedMember.division || 'City Division'}
                      </div>
                    </div>
                  </div>
                </CCol>

                <CCol md={6} className="text-md-end">
                  <CBadge color={selectedMember.defaulterStatus ? 'danger' : 'success'} className="px-3 py-2 fs-6 me-2 shadow-sm">
                    {selectedMember.defaulterStatus ? '⚠ Defaulter Alert' : '✓ Good Standing'}
                  </CBadge>
                  <CBadge color="light" className="px-3 py-2 fs-6 text-dark shadow-sm">
                    Role: {selectedMember.role?.toUpperCase() || 'MEMBER'}
                  </CBadge>
                </CCol>
              </CRow>

              <hr style={{ borderColor: 'rgba(255,255,255,0.25)' }} />

              <CRow className="text-center g-3">
                <CCol xs={6} md={3}>
                  <div className="small fw-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Share Capital</div>
                  <h4 className="fw-bold text-white mb-0" style={{ color: '#ffffff' }}>₹{(selectedMember.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</h4>
                </CCol>
                <CCol xs={6} md={3}>
                  <div className="small fw-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>RD Balance</div>
                  <h4 className="fw-bold text-warning mb-0">₹{(selectedMember.rdBalance || 0).toLocaleString('en-IN')}</h4>
                </CCol>
                <CCol xs={6} md={3}>
                  <div className="small fw-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Loan Outstanding</div>
                  <h4 className="fw-bold text-info mb-0">₹{totalOutstanding.toLocaleString('en-IN')}</h4>
                </CCol>
                <CCol xs={6} md={3}>
                  <div className="small fw-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Monthly EMI / RD</div>
                  <h4 className="fw-bold text-light mb-0" style={{ color: '#ffffff' }}>₹{((selectedMember.monthlyEmiAmount || 0) + (selectedMember.monthlyRDAmount || 0)).toLocaleString('en-IN')}</h4>
                </CCol>
              </CRow>
            </CCardBody>
          </CCard>

          {/* TABS NAVIGATION */}
          <CNav variant="tabs" className="mb-3 border-bottom">
            <CNavItem>
              <CNavLink 
                style={{ cursor: 'pointer' }}
                active={activeTab === 'overview'} 
                onClick={() => setActiveTab('overview')}
                className="fw-bold"
              >
                <CIcon icon={cilChartPie} className="me-2"/>360 Overview
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink 
                style={{ cursor: 'pointer' }}
                active={activeTab === 'rd'} 
                onClick={() => setActiveTab('rd')}
                className="fw-bold"
              >
                <CIcon icon={cilWallet} className="me-2"/>RD & Savings Passbook
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink 
                style={{ cursor: 'pointer' }}
                active={activeTab === 'loan'} 
                onClick={() => setActiveTab('loan')}
                className="fw-bold"
              >
                <CIcon icon={cilBank} className="me-2"/>Loan Statements & Progress ({loans.length})
              </CNavLink>
            </CNavItem>
          </CNav>

          <CTabContent>
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <CRow>
                <CCol lg={6} className="mb-4">
                  <CCard className="shadow-sm border-0 h-100">
                    <CCardHeader className="bg-white fw-bold border-bottom">
                      <CIcon icon={cilWallet} className="me-2 text-success"/>Savings & Contributions Summary
                    </CCardHeader>
                    <CCardBody>
                      <CTable borderless align="middle">
                        <CTableBody>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Monthly RD Contribution:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end">₹{(selectedMember.monthlyRDAmount || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Accumulated RD Balance:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end text-success fs-5">₹{(selectedMember.rdBalance || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Total Share Capital:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end text-primary">₹{(selectedMember.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Total Dividends Earned:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end text-info">₹{(selectedMember.dividends || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                        </CTableBody>
                      </CTable>
                    </CCardBody>
                  </CCard>
                </CCol>

                <CCol lg={6} className="mb-4">
                  <CCard className="shadow-sm border-0 h-100">
                    <CCardHeader className="bg-white fw-bold border-bottom">
                      <CIcon icon={cilBank} className="me-2 text-primary"/>Loan Obligations & Health
                    </CCardHeader>
                    <CCardBody>
                      <CTable borderless align="middle">
                        <CTableBody>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Active Loan Accounts:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end">{loans.length}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Total Principal Pending:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end text-danger fs-5">₹{totalOutstanding.toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Monthly EMI Commitment:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end text-warning">₹{(selectedMember.monthlyEmiAmount || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                          <CTableRow>
                            <CTableDataCell className="text-muted">Pending Interest Balance:</CTableDataCell>
                            <CTableDataCell className="fw-bold text-end">₹{(selectedMember.pendingLoanInterest || 0).toLocaleString('en-IN')}</CTableDataCell>
                          </CTableRow>
                        </CTableBody>
                      </CTable>
                    </CCardBody>
                  </CCard>
                </CCol>
              </CRow>
            )}

            {/* TAB 2: RD PASSBOOK */}
            {activeTab === 'rd' && (
              <CCard className="shadow-sm border-0 mb-4">
                <CCardHeader className="bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
                  <span>Passbook & Savings Ledger ({sortedRdTransactions.length} Entries)</span>
                  <CButton color="success" size="sm" className="text-white fw-bold" onClick={exportPDF}>
                    <CIcon icon={cilCloudDownload} className="me-2"/>Export Passbook PDF
                  </CButton>
                </CCardHeader>
                <CCardBody>
                  {sortedRdTransactions.length === 0 ? (
                    <CAlert color="info" className="text-center py-4">No RD/Savings transactions found for this member.</CAlert>
                  ) : (
                    <div className="table-responsive">
                      <CTable bordered align="middle" hover striped small>
                        <CTableHead color="dark">
                          <CTableRow>
                            <CTableHeaderCell onClick={() => handleRdSort('transactionDate')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Date {getSortIcon(rdSortConfig, 'transactionDate')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleRdSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Category / Description {getSortIcon(rdSortConfig, 'category')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleRdSort('ledgerFolio')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Ref No / Folio {getSortIcon(rdSortConfig, 'ledgerFolio')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleRdSort('amount')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-end">
                              Credit (IN) {getSortIcon(rdSortConfig, 'amount')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleRdSort('amount')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-end">
                              Debit (OUT) {getSortIcon(rdSortConfig, 'amount')}
                            </CTableHeaderCell>
                          </CTableRow>
                        </CTableHead>
                        <CTableBody>
                          {sortedRdTransactions.map(tx => (
                            <CTableRow key={tx._id || tx.transactionId}>
                              <CTableDataCell>{new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN')}</CTableDataCell>
                              <CTableDataCell><strong className="text-primary">{tx.category}</strong> — {tx.description || '-'}</CTableDataCell>
                              <CTableDataCell><small className="text-muted">{tx.ledgerFolio || tx.referenceNumber || '-'}</small></CTableDataCell>
                              <CTableDataCell className="text-end text-success fw-bold">
                                {tx.entryType === 'CREDIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-'}
                              </CTableDataCell>
                              <CTableDataCell className="text-end text-danger fw-bold">
                                {tx.entryType === 'DEBIT' ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '-'}
                              </CTableDataCell>
                            </CTableRow>
                          ))}
                        </CTableBody>
                      </CTable>
                    </div>
                  )}
                </CCardBody>
              </CCard>
            )}

            {/* TAB 3: LOANS MONITOR */}
            {activeTab === 'loan' && (
              <CCard className="shadow-sm border-0 mb-4">
                <CCardHeader className="bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
                  <span>Loan Accounts ({sortedLoans.length} Total)</span>
                  {selectedLoan && (
                    <div className="d-flex gap-2">
                      <CButton color="secondary" size="sm" variant="outline" onClick={() => setSelectedLoan(null)}>
                        ← Back to All Loans List
                      </CButton>
                      <CButton color="primary" size="sm" className="text-white fw-bold" onClick={() => exportLoanPDF(selectedLoan)}>
                        <CIcon icon={cilCloudDownload} className="me-2"/>Export Loan Statement PDF
                      </CButton>
                    </div>
                  )}
                </CCardHeader>
                <CCardBody>
                  {sortedLoans.length === 0 ? (
                    <CAlert color="info" className="text-center py-4">This member currently has no recorded loans.</CAlert>
                  ) : !selectedLoan ? (
                    /* MODE A: COMPACT LIST OF LOANS */
                    <div className="table-responsive">
                      <CTable bordered align="middle" hover striped small className="mb-0 text-center">
                        <CTableHead color="dark">
                          <CTableRow>
                            <CTableHeaderCell onClick={() => handleLoanSort('loanId')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Loan ID {getSortIcon(loanSortConfig, 'loanId')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleLoanSort('issueDate')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Issue / Start Date {getSortIcon(loanSortConfig, 'issueDate')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleLoanSort('loanAmount')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-end">
                              Sanctioned Amount {getSortIcon(loanSortConfig, 'loanAmount')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleLoanSort('principalPending')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-end">
                              Principal Outstanding {getSortIcon(loanSortConfig, 'principalPending')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleLoanSort('tenure')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-center">
                              Tenure {getSortIcon(loanSortConfig, 'tenure')}
                            </CTableHeaderCell>
                            <CTableHeaderCell onClick={() => handleLoanSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-center">
                              Status {getSortIcon(loanSortConfig, 'status')}
                            </CTableHeaderCell>
                            <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                          </CTableRow>
                        </CTableHead>
                        <CTableBody>
                          {sortedLoans.map(loan => {
                            const amount = Number(loan.loanAmount || 0)
                            const pending = Number(loan.principalPending !== undefined ? loan.principalPending : loan.loanAmount || 0)
                            const issueDate = loan.startDate || loan.issueDate || loan.createdAt
                            return (
                              <CTableRow key={loan._id || loan.loanId}>
                                <CTableDataCell className="fw-bold text-primary">{loan.loanId || `LN-${loan._id}`}</CTableDataCell>
                                <CTableDataCell>{issueDate ? new Date(issueDate).toLocaleDateString('en-IN') : '-'}</CTableDataCell>
                                <CTableDataCell className="text-end fw-bold">₹{amount.toLocaleString('en-IN')}</CTableDataCell>
                                <CTableDataCell className="text-end text-danger fw-bold">₹{pending.toLocaleString('en-IN')}</CTableDataCell>
                                <CTableDataCell className="text-center">{loan.tenure || 12} Mos</CTableDataCell>
                                <CTableDataCell className="text-center">
                                  <CBadge color={loan.status === 'ACTIVE' ? 'success' : loan.status === 'CLOSED' ? 'secondary' : 'warning'}>
                                    {loan.status}
                                  </CBadge>
                                </CTableDataCell>
                                <CTableDataCell className="text-center">
                                  <CButton size="sm" color="info" className="text-white fw-bold shadow-sm" onClick={() => setSelectedLoan(loan)}>
                                    Inspect Statement ➔
                                  </CButton>
                                </CTableDataCell>
                              </CTableRow>
                            )
                          })}
                        </CTableBody>
                      </CTable>
                    </div>
                  ) : (
                    /* MODE B: DETAILED SELECTED LOAN VIEW */
                    <div>
                      <CRow className="mb-4 align-items-stretch">
                        <CCol md={6} className="mb-3 mb-md-0">
                          <CCard className="bg-light border h-100">
                            <CCardBody className="p-3">
                              <div className="small text-muted fw-bold text-uppercase mb-2">Loan Summary: {selectedLoan.loanId}</div>
                              <div className="row g-2">
                                <div className="col-6">
                                  <small className="text-muted">Sanctioned Loan</small>
                                  <h5 className="fw-bold text-dark mb-0">₹{(selectedLoan.loanAmount || 0).toLocaleString('en-IN')}</h5>
                                </div>
                                <div className="col-6">
                                  <small className="text-muted">Principal Outstanding</small>
                                  <h5 className="fw-bold text-danger mb-0">
                                    ₹{(selectedLoan.principalPending !== undefined ? selectedLoan.principalPending : selectedLoan.loanAmount || 0).toLocaleString('en-IN')}
                                  </h5>
                                </div>
                                <div className="col-6 mt-3">
                                  <small className="text-muted">Tenure</small>
                                  <h6 className="fw-bold text-dark mb-0">{selectedLoan.tenure || 12} Months</h6>
                                </div>
                                <div className="col-6 mt-3">
                                  <small className="text-muted">Status</small>
                                  <div>
                                    <CBadge color={selectedLoan.status === 'ACTIVE' ? 'success' : selectedLoan.status === 'CLOSED' ? 'secondary' : 'warning'}>
                                      {selectedLoan.status}
                                    </CBadge>
                                  </div>
                                </div>
                              </div>
                            </CCardBody>
                          </CCard>
                        </CCol>

                        <CCol md={6}>
                          <CCard className="bg-success bg-opacity-10 border border-success h-100">
                            <CCardBody className="p-3 d-flex flex-column justify-content-center">
                              {(() => {
                                const amount = Number(selectedLoan.loanAmount || 0)
                                const pending = Number(selectedLoan.principalPending !== undefined ? selectedLoan.principalPending : selectedLoan.loanAmount || 0)
                                const paid = Math.max(0, amount - pending)
                                const pct = amount > 0 ? Math.round((paid / amount) * 100) : 0
                                return (
                                  <>
                                    <div className="d-flex justify-content-between fw-bold mb-2">
                                      <span className="text-success">Repayment Progress</span>
                                      <span className="text-success fs-5">{pct}% Repaid</span>
                                    </div>
                                    <CProgress value={pct} color="success" height={16} animated className="mb-3" />
                                    <div className="d-flex justify-content-between text-muted small fw-bold">
                                      <span>Paid: ₹{paid.toLocaleString('en-IN')}</span>
                                      <span>Remaining: ₹{pending.toLocaleString('en-IN')}</span>
                                    </div>
                                  </>
                                )
                              })()}
                            </CCardBody>
                          </CCard>
                        </CCol>
                      </CRow>

                      {/* AMORTIZATION SCHEDULE TABLE */}
                      <h6 className="fw-bold text-dark mb-3">📋 Repayment & Amortization Statement</h6>
                      <div className="table-responsive border rounded shadow-sm">
                        <CTable bordered align="middle" hover small striped className="mb-0 text-center">
                          <CTableHead color="dark">
                            <CTableRow>
                              <CTableHeaderCell>No.</CTableHeaderCell>
                              <CTableHeaderCell>Due Date</CTableHeaderCell>
                              <CTableHeaderCell className="text-end">EMI Amount</CTableHeaderCell>
                              <CTableHeaderCell className="text-end">Principal</CTableHeaderCell>
                              <CTableHeaderCell className="text-end">Interest</CTableHeaderCell>
                              <CTableHeaderCell className="text-end text-warning">Closing Balance</CTableHeaderCell>
                            </CTableRow>
                          </CTableHead>
                          <CTableBody>
                            {(() => {
                              const tenure = selectedLoan.tenure || 12
                              const amount = selectedLoan.loanAmount || 0
                              const startDate = new Date(selectedLoan.createdAt || selectedLoan.startDate || new Date())
                              const annualInterestRate = selectedLoan.interestRate || 10
                              const monthlyRate = (annualInterestRate / 100) / 12
                              let trueEmi = 0
                              if (monthlyRate > 0) {
                                trueEmi = Math.round((amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1))
                              } else {
                                trueEmi = Math.round(amount / tenure)
                              }
                              let outstanding = amount
                              const scheduleRows = []
                              for (let i = 1; i <= tenure; i++) {
                                const dueDate = new Date(startDate)
                                dueDate.setMonth(dueDate.getMonth() + i)
                                let interestComp = Math.round(outstanding * monthlyRate)
                                let principalComp = trueEmi - interestComp
                                if (i === tenure || principalComp > outstanding) {
                                  principalComp = outstanding
                                }
                                outstanding -= principalComp
                                if (outstanding < 0) outstanding = 0
                                scheduleRows.push(
                                  <CTableRow key={i}>
                                    <CTableDataCell className="fw-bold">{i}</CTableDataCell>
                                    <CTableDataCell>{dueDate.toLocaleDateString('en-IN')}</CTableDataCell>
                                    <CTableDataCell className="text-end fw-bold text-primary">₹{trueEmi.toLocaleString('en-IN')}</CTableDataCell>
                                    <CTableDataCell className="text-end text-success">₹{principalComp.toLocaleString('en-IN')}</CTableDataCell>
                                    <CTableDataCell className="text-end text-muted">₹{interestComp.toLocaleString('en-IN')}</CTableDataCell>
                                    <CTableDataCell className="text-end fw-bold text-dark">₹{outstanding.toLocaleString('en-IN')}</CTableDataCell>
                                  </CTableRow>
                                )
                              }
                              return scheduleRows
                            })()}
                          </CTableBody>
                        </CTable>
                      </div>
                    </div>
                  )}
                </CCardBody>
              </CCard>
            )}
          </CTabContent>
        </>
      ) : null}
    </>
  )
}

export default Member360Monitor
