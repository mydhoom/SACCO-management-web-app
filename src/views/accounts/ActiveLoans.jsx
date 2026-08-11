import React, { useState } from 'react'
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
  CProgress
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilMoney, cilChartPie, cilWarning, cilDescription } from '@coreui/icons'

// Mock Data for Active Loans (Adjusted so EMI math is perfectly clean)
const activeLoans = [
  { id: 'LN-2026-001', vendorNo: '10452', name: 'Rahul Sharma', principal: 200000, outstanding: 120000, emi: 5000, status: 'Healthy' },
  { id: 'LN-2026-045', vendorNo: '10454', name: 'Amit Singh', principal: 100000, outstanding: 50000, emi: 5000, status: 'Defaulted' },
  { id: 'LN-2026-088', vendorNo: '10455', name: 'Desh Raj', principal: 50000, outstanding: 6000, emi: 2000, status: 'Closing Soon' },
  { id: 'LN-2026-102', vendorNo: '10488', name: 'Vikram Verma', principal: 300000, outstanding: 290000, emi: 10000, status: 'Healthy' }
]

const ActiveLoans = () => {
  const [searchTerm, setSearchTerm] = useState('')

  // Filter loans based on search
  const filteredLoans = activeLoans.filter((loan) => {
    const searchString = Object.values(loan).join(' ').toLowerCase()
    return searchString.includes(searchTerm.toLowerCase())
  })

  const getStatusBadge = (status) => {
    if (status === 'Healthy') return 'success'
    if (status === 'Defaulted') return 'danger'
    if (status === 'Closing Soon') return 'info'
    return 'secondary'
  }

  // Calculate the percentage paid off for the progress bar
  const calculateProgress = (principal, outstanding) => {
    const paid = principal - outstanding
    return Math.round((paid / principal) * 100)
  }

  // Helper component for the top summary cards
  const SummaryWidget = ({ title, value, icon, subtitle, color }) => (
    <CCard className={`mb-4 shadow-sm border-0 border-start border-4 border-${color} h-100`}>
      <CCardBody className="p-4 d-flex align-items-center">
        <div className={`bg-${color} bg-opacity-10 p-3 rounded me-4`}>
          <CIcon icon={icon} size="xl" className={`text-${color}`} />
        </div>
        <div>
          <div className="text-medium-emphasis small text-uppercase fw-semibold mb-1">{title}</div>
          {/* Removed text-dark so it inherits the theme color */}
          <div className="fs-4 fw-bold">{value}</div>
          <div className="small text-muted mt-1">{subtitle}</div>
        </div>
      </CCardBody>
    </CCard>
  )

  return (
    <>
      {/* Page Header */}
      <div className="mb-4 d-flex justify-content-between align-items-end">
        <div>
          {/* Removed text-dark */}
          <h4 className="mb-0 fw-bold">Active Loans Dashboard</h4>
          <div className="small text-medium-emphasis">Division-wide outstanding loans and EMI tracking.</div>
        </div>
        <CButton color="primary" className="text-white shadow-sm d-flex align-items-center gap-2">
          <CIcon icon={cilDescription} /> Generate Defaulters Report
        </CButton>
      </div>

      {/* Top Summary Metrics */}
      <CRow className="mb-2">
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Total Outstanding" 
            value="₹ 46,50,000" 
            icon={cilMoney} 
            subtitle="Across all active loans"
            color="danger"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Expected EMI Collection" 
            value="₹ 1,85,000" 
            icon={cilChartPie} 
            subtitle="For the upcoming payroll"
            color="primary"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Accounts in Default" 
            value="3" 
            icon={cilWarning} 
            subtitle="Requires immediate action"
            color="warning"
          />
        </CCol>
        <CCol sm={6} lg={3}>
          <SummaryWidget 
            title="Loans Closing Soon" 
            value="12" 
            icon={cilMoney} 
            subtitle="< 3 EMIs remaining"
            color="info"
          />
        </CCol>
      </CRow>

      {/* Main Ledger Table */}
      <CCard className="shadow-sm border-0">
        {/* Removed bg-white so the header matches the dark mode card naturally */}
        <CCardHeader className="pb-3 pt-3 border-bottom d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">Loan Directory</h5>
          
          <CInputGroup style={{ width: '300px' }}>
            <CInputGroupText>
              <CIcon icon={cilSearch} />
            </CInputGroupText>
            <CFormInput 
              placeholder="Search by ID, Name, Vendor No..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CInputGroup>
        </CCardHeader>
        
        <CCardBody className="p-0">
          <div className="table-responsive">
            <CTable hover align="middle" className="mb-0">
              <CTableHead color="light">
                <CTableRow>
                  <CTableHeaderCell className="ps-4 py-3">Loan ID</CTableHeaderCell>
                  <CTableHeaderCell className="py-3">Member Info</CTableHeaderCell>
                  <CTableHeaderCell className="text-end py-3">Principal (₹)</CTableHeaderCell>
                  <CTableHeaderCell className="text-end py-3">Monthly EMI (₹)</CTableHeaderCell>
                  <CTableHeaderCell className="py-3 px-4" style={{ width: '25%' }}>Recovery Progress</CTableHeaderCell>
                  <CTableHeaderCell className="text-center pe-4 py-3">Status</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filteredLoans.map((loan) => {
                  // --- NEW EMI MATH LOGIC ---
                  const progress = calculateProgress(loan.principal, loan.outstanding)
                  const totalEmis = Math.ceil(loan.principal / loan.emi)
                  const remainingEmis = Math.ceil(loan.outstanding / loan.emi)
                  const paidEmis = totalEmis - remainingEmis

                  return (
                    <CTableRow key={loan.id}>
                      <CTableDataCell className="ps-4 text-medium-emphasis small font-monospace">
                        {loan.id}
                      </CTableDataCell>
                      <CTableDataCell>
                        {/* Removed text-dark */}
                        <div className="fw-semibold">{loan.name}</div>
                        <div className="small text-medium-emphasis">Vendor: {loan.vendorNo}</div>
                      </CTableDataCell>
                      <CTableDataCell className="text-end fw-medium">
                        {loan.principal.toLocaleString('en-IN')}
                      </CTableDataCell>
                      <CTableDataCell className="text-end fw-bold">
                        {loan.emi.toLocaleString('en-IN')}
                      </CTableDataCell>
                      <CTableDataCell className="px-4">
                        
                        {/* Top text of progress bar */}
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="small fw-semibold text-danger">₹{loan.outstanding.toLocaleString('en-IN')} left</span>
                          <span className="small text-medium-emphasis">{progress}%</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <CProgress value={progress} color={progress > 80 ? 'success' : 'primary'} height={6} className="mb-1" />
                        
                        {/* NEW: EMI Paid vs Remaining Tracker */}
                        <div className="d-flex justify-content-between small text-medium-emphasis mt-1">
                          <span><strong>{paidEmis}</strong> Paid</span>
                          <span><strong>{remainingEmis}</strong> Left</span>
                        </div>

                      </CTableDataCell>
                      <CTableDataCell className="text-center pe-4">
                        <CBadge color={getStatusBadge(loan.status)} shape="rounded-pill" className="px-3 py-2">
                          {loan.status}
                        </CBadge>
                      </CTableDataCell>
                    </CTableRow>
                  )
                })}
                
                {filteredLoans.length === 0 && (
                  <CTableRow>
                    <CTableDataCell colSpan="6" className="text-center py-5 text-muted">
                      No active loans found matching "{searchTerm}"
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

export default ActiveLoans