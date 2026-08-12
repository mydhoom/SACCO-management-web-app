import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../../apiConfig'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CRow,
  CCol,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CBadge,
  CButton,
  CSpinner,
  CAlert
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilBank, cilArrowTop, cilWallet, cilSave, cilCloudDownload } from '@coreui/icons'

const ShareSavings = () => {
  // 1. State for search and loading
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // 2. State for our live database data
  const [summaryData, setSummaryData] = useState({
    shares: 0,
    mandatory: 0,
    voluntary: 0,
    thisMonthCollection: 0
  })
  const [transactions, setTransactions] = useState([])

  // 3. The trigger that fetches data when the page loads
  useEffect(() => {
    const fetchLedgerData = async () => {
      try {
        setErrorMsg('')
        const token = localStorage.getItem('token') || localStorage.getItem('adminToken')
        const config = {
          headers: {
            Authorization: token ? `Bearer ${token}` : ''
          }
        }

        // Fetch both summary totals and recent transactions using API_BASE_URL
        const [summaryResponse, transactionsResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/savings/summary`, config),
          axios.get(`${API_BASE_URL}/api/savings/transactions`, config)
        ])

        if (summaryResponse.data.success) {
          setSummaryData(summaryResponse.data.data)
        }
        if (transactionsResponse.data.success) {
          setTransactions(transactionsResponse.data.data)
        }
      } catch (error) {
        console.error("Error fetching ledger data:", error)
        setErrorMsg(error.response?.data?.message || error.message || 'Failed to fetch ledger data.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLedgerData()
  }, []) // The empty brackets mean "only run this once when the page opens"

  // State and handler for interactive column sorting
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ⇅'
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
  }

  // Filter & sort the live transactions based on search and selected column
  const filteredDeposits = useMemo(() => {
    const list = transactions.filter((trx) => {
      const searchString = Object.values(trx).join(' ').toLowerCase()
      return searchString.includes(searchTerm.toLowerCase())
    })

    if (!sortConfig.key) return list

    return [...list].sort((a, b) => {
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]

      if (sortConfig.key === 'amount') {
        aVal = Number(aVal || 0)
        bVal = Number(bVal || 0)
      } else if (sortConfig.key === 'date') {
        aVal = new Date(aVal || 0).getTime()
        bVal = new Date(bVal || 0).getTime()
      } else {
        aVal = String(aVal || '').toLowerCase()
        bVal = String(bVal || '').toLowerCase()
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [transactions, searchTerm, sortConfig])

  // Visual helper functions
  const getStatusBadge = (status) => {
    if (status === 'Credited') return 'success'
    if (status === 'Pending') return 'warning'
    return 'secondary'
  }

  const getTypeBadgeColor = (type) => {
    if (type === 'Share Capital') return 'primary'
    if (type === 'Mandatory Savings') return 'info'
    if (type === 'Voluntary Savings') return 'secondary'
    return 'dark'
  }

  const SummaryWidget = ({ title, value, icon, subtitle, color }) => (
    <CCard className={`mb-4 shadow-sm border-0 border-start border-4 border-${color} h-100`}>
      <CCardBody className="p-4 d-flex align-items-center">
        <div className={`bg-${color} bg-opacity-10 p-3 rounded me-4`}>
          <CIcon icon={icon} size="xl" className={`text-${color}`} />
        </div>
        <div>
          <div className="text-medium-emphasis small text-uppercase fw-semibold mb-1">{title}</div>
          <div className="fs-4 fw-bold text-dark">₹ {value.toLocaleString('en-IN')}</div>
          <div className="small text-muted mt-1">{subtitle}</div>
        </div>
      </CCardBody>
    </CCard>
  )

  const handleGenerateReport = () => {
    if (!transactions.length) {
      alert("No transaction records available to export.")
      return
    }

    let csv = "SHARE & SAVINGS LEDGER REPORT\n"
    csv += `Generated Date,${new Date().toLocaleDateString('en-IN')}\n\n`
    csv += `Total Share Capital,${summaryData.shares}\n`
    csv += `Mandatory Savings,${summaryData.mandatory}\n`
    csv += `Voluntary Savings,${summaryData.voluntary}\n`
    csv += `This Month Collection,${summaryData.thisMonthCollection}\n\n`

    csv += "Trx ID,Date,Member Name,Vendor No,Deposit Type,Amount (Rs),Status\n"
    transactions.forEach(trx => {
      const safeId = trx.transactionId || (trx.id ? String(trx.id).slice(-8).toUpperCase() : 'N/A')
      csv += `"${safeId}","${trx.date || ''}","${trx.name || ''}","${trx.vendorNo || ''}","${trx.type || ''}",${trx.amount || 0},"${trx.status || ''}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Share_Savings_Ledger_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Show a loading spinner while waiting for the server
  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <CSpinner color="primary" variant="grow" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 d-flex justify-content-between align-items-end">
        <div>
          <h4 className="mb-0 text-dark fw-bold">Share & Savings Ledger</h4>
          <div className="small text-medium-emphasis">Division-wide capital, mandatory, and voluntary savings overview.</div>
        </div>
        <CButton color="success" className="text-white shadow-sm fw-bold" onClick={handleGenerateReport}>
          <CIcon icon={cilCloudDownload} className="me-2" />
          Generate Monthly Report
        </CButton>
      </div>

      {errorMsg && (
        <CAlert color="danger" dismissible className="mb-4">
          {errorMsg}
        </CAlert>
      )}

      <CRow className="mb-2">
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Total Share Capital" 
            value={summaryData.shares} 
            icon={cilBank} 
            subtitle="Overall division holdings"
            color="primary"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Mandatory Savings" 
            value={summaryData.mandatory} 
            icon={cilSave} 
            subtitle="Compulsory monthly deposits"
            color="info"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Voluntary Savings" 
            value={summaryData.voluntary} 
            icon={cilWallet} 
            subtitle="Additional member deposits"
            color="secondary"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="This Month's Collection" 
            value={summaryData.thisMonthCollection} 
            icon={cilArrowTop} 
            subtitle="Overall recent influx"
            color="success"
          />
        </CCol>
      </CRow>

      <CCard className="shadow-sm border-0">
        <CCardHeader className="bg-white pb-3 pt-3 border-bottom d-flex justify-content-between align-items-center">
          <h5 className="mb-0 text-dark fw-bold">Recent Transactions</h5>
          
          <CInputGroup style={{ width: '300px' }}>
            <CInputGroupText className="bg-light border-end-0">
              <CIcon icon={cilSearch} />
            </CInputGroupText>
            <CFormInput 
              className="border-start-0 bg-light"
              placeholder="Search by ID, Name, Vendor No..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CInputGroup>
        </CCardHeader>
        
        <CCardBody className="p-0">
          <div className="table-responsive">
            <CTable hover striped align="middle" className="mb-0">
              <CTableHead color="light">
                <CTableRow>
                  <CTableHeaderCell onClick={() => handleSort('transactionId')} style={{ cursor: 'pointer', userSelect: 'none' }} className="ps-4 py-3">
                    Trx ID {getSortIcon('transactionId')}
                  </CTableHeaderCell>
                  <CTableHeaderCell onClick={() => handleSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }} className="py-3">
                    Date {getSortIcon('date')}
                  </CTableHeaderCell>
                  <CTableHeaderCell onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }} className="py-3">
                    Member Info {getSortIcon('name')}
                  </CTableHeaderCell>
                  <CTableHeaderCell onClick={() => handleSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }} className="py-3">
                    Deposit Type {getSortIcon('type')}
                  </CTableHeaderCell>
                  <CTableHeaderCell onClick={() => handleSort('amount')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-end py-3">
                    Amount (₹) {getSortIcon('amount')}
                  </CTableHeaderCell>
                  <CTableHeaderCell onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }} className="text-center pe-4 py-3">
                    Status {getSortIcon('status')}
                  </CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filteredDeposits.map((trx, idx) => {
                  const safeId = trx.transactionId || (trx.id ? String(trx.id).slice(-8).toUpperCase() : `TRX-${idx + 1}`)

                  return (
                    <CTableRow key={trx.id || idx}>
                      <CTableDataCell className="ps-4 text-dark fw-bold small font-monospace">
                        {safeId}
                      </CTableDataCell>
                      <CTableDataCell className="fw-medium">
                        {trx.date || 'N/A'}
                      </CTableDataCell>
                      <CTableDataCell>
                        <div className="fw-semibold text-dark">{trx.name || 'Unknown'}</div>
                        <div className="small text-medium-emphasis">Vendor: {trx.vendorNo || 'N/A'}</div>
                      </CTableDataCell>
                      <CTableDataCell>
                        <CBadge color={getTypeBadgeColor(trx.type)} shape="rounded-pill" className="bg-opacity-10 text-dark border">
                          {trx.type || 'Savings'}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="text-end fw-bold text-success">
                        + {(Number(trx.amount) || 0).toLocaleString('en-IN')}
                      </CTableDataCell>
                      <CTableDataCell className="text-center pe-4">
                        <CBadge color={getStatusBadge(trx.status)} shape="rounded-pill" className="px-3 py-2">
                          {trx.status || 'Credited'}
                        </CBadge>
                      </CTableDataCell>
                    </CTableRow>
                  )
                })}
                
                {filteredDeposits.length === 0 && (
                  <CTableRow>
                    <CTableDataCell colSpan="6" className="text-center py-5 text-muted">
                      No transactions found.
                    </CTableDataCell>
                  </CTableRow>
                )}
              </CTableBody>
            </CTable>
          </div>
        </CCardBody>
      </CCard>
    </>
  )
}

export default ShareSavings