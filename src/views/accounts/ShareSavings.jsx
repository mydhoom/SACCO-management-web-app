import React, { useState, useEffect } from 'react'
import axios from 'axios'
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
  CSpinner // Added a spinner for loading state
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilBank, cilArrowTop, cilWallet, cilSave } from '@coreui/icons'

const ShareSavings = () => {
  // 1. State for search and loading
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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
        // Grab the login token (adjust 'token' if you saved it under a different name in your Login file)
        const token = localStorage.getItem('token') 
        const config = {
          headers: {
            Authorization: `Bearer ${token}` 
          }
        }

        // Fetch both summary totals and recent transactions from your new backend routes
        const [summaryResponse, transactionsResponse] = await Promise.all([
          axios.get('/api/savings/summary', config),
          axios.get('/api/savings/transactions', config)
        ])

        // Save the fetched data into React's memory
        if (summaryResponse.data.success) {
          setSummaryData(summaryResponse.data.data)
        }
        if (transactionsResponse.data.success) {
          setTransactions(transactionsResponse.data.data)
        }
      } catch (error) {
        console.error("Error fetching ledger data:", error)
        // Optionally add a toast or alert here later if the request fails
      } finally {
        setIsLoading(false) // Stop the loading spinner
      }
    }

    fetchLedgerData()
  }, []) // The empty brackets mean "only run this once when the page opens"

  // Filter the live transactions based on the search box
  const filteredDeposits = transactions.filter((trx) => {
    const searchString = Object.values(trx).join(' ').toLowerCase()
    return searchString.includes(searchTerm.toLowerCase())
  })

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
        <CButton color="success" className="text-white shadow-sm">
          Generate Monthly Report
        </CButton>
      </div>

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
                  <CTableHeaderCell className="ps-4 py-3">Trx ID</CTableHeaderCell>
                  <CTableHeaderCell className="py-3">Date</CTableHeaderCell>
                  <CTableHeaderCell className="py-3">Member Info</CTableHeaderCell>
                  <CTableHeaderCell className="py-3">Deposit Type</CTableHeaderCell>
                  <CTableHeaderCell className="text-end py-3">Amount (₹)</CTableHeaderCell>
                  <CTableHeaderCell className="text-center pe-4 py-3">Status</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filteredDeposits.map((trx) => (
                  <CTableRow key={trx.id}>
                    <CTableDataCell className="ps-4 text-medium-emphasis small font-monospace">
                      {/* Using the last 6 characters of the MongoDB ID to keep it visually clean */}
                      ...{trx.id.substring(trx.id.length - 6)}
                    </CTableDataCell>
                    <CTableDataCell className="fw-medium">
                      {trx.date}
                    </CTableDataCell>
                    <CTableDataCell>
                      <div className="fw-semibold text-dark">{trx.name}</div>
                      <div className="small text-medium-emphasis">Vendor: {trx.vendorNo}</div>
                    </CTableDataCell>
                    <CTableDataCell>
                      <CBadge color={getTypeBadgeColor(trx.type)} shape="rounded-pill" className="bg-opacity-10 text-dark border">
                        {trx.type}
                      </CBadge>
                    </CTableDataCell>
                    <CTableDataCell className="text-end fw-bold text-success">
                      + {trx.amount.toLocaleString('en-IN')}
                    </CTableDataCell>
                    <CTableDataCell className="text-center pe-4">
                      <CBadge color={getStatusBadge(trx.status)} shape="rounded-pill" className="px-3 py-2">
                        {trx.status}
                      </CBadge>
                    </CTableDataCell>
                  </CTableRow>
                ))}
                
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