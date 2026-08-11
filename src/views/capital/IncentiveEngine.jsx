import React, { useState, useEffect, useMemo } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CFormInput,
  CInputGroup, CInputGroupText, CAlert, CBadge, CSpinner, CNav, CNavItem, CNavLink
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilChartPie, cilCheckCircle, cilGift, cilCloudDownload } from '@coreui/icons'

const IncentiveEngine = () => {
  const [activeTab, setActiveTab] = useState('dividend') 
  
  const [dividendRate, setDividendRate] = useState(8.5) 
  const [incentiveRate, setIncentiveRate] = useState(2.0) 

  const [members, setMembers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDisbursing, setIsDisbursing] = useState(false)

  // Mock Fetching Data
  useEffect(() => {
    setTimeout(() => {
      setMembers([
        { vendorNo: '1045', name: 'Amit Kumar', shareCapital: 25000, loanInterestPaid: 12500 },
        { vendorNo: '2088', name: 'Sunita Sharma', shareCapital: 15000, loanInterestPaid: 4200 },
        { vendorNo: '3102', name: 'Rajesh Singh', shareCapital: 50000, loanInterestPaid: 0 },
        { vendorNo: '4019', name: 'Priya Verma', shareCapital: 10000, loanInterestPaid: 21000 },
      ])
      setIsLoading(false)
    }, 800)
  }, [])

  // Calculate Totals
  const { totalShares, totalDividendPayout } = useMemo(() => {
    const shares = members.reduce((sum, m) => sum + m.shareCapital, 0)
    const rate = parseFloat(dividendRate) || 0
    return { totalShares: shares, totalDividendPayout: Math.round(shares * (rate / 100)) }
  }, [members, dividendRate])

  const { totalInterest, totalIncentivePayout } = useMemo(() => {
    const interest = members.reduce((sum, m) => sum + (m.loanInterestPaid || 0), 0)
    const rate = parseFloat(incentiveRate) || 0
    return { totalInterest: interest, totalIncentivePayout: Math.round(interest * (rate / 100)) }
  }, [members, incentiveRate])

  // --- NEW: CSV Export Function ---
  const downloadCSV = (type) => {
    let csvContent = "data:text/csv;charset=utf-8,"
    
    if (type === 'dividend') {
      csvContent += "Vendor No.,Member Name,Share Capital (INR),Calculated Dividend (INR)\n"
      members.forEach(m => {
        const div = Math.round(m.shareCapital * (parseFloat(dividendRate) / 100) || 0)
        csvContent += `${m.vendorNo},${m.name},${m.shareCapital},${div}\n`
      })
    } else {
      csvContent += "Vendor No.,Member Name,Interest Paid (INR),Calculated Incentive (INR)\n"
      members.forEach(m => {
        const inc = Math.round(m.loanInterestPaid * (parseFloat(incentiveRate) / 100) || 0)
        csvContent += `${m.vendorNo},${m.name},${m.loanInterestPaid},${inc}\n`
      })
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Society_${type}_Report_${new Date().getFullYear()}.csv`)
    document.body.appendChild(link) // Required for Firefox
    link.click()
    document.body.removeChild(link)
  }

  const handleDisbursement = (type) => {
    const payout = type === 'dividend' ? totalDividendPayout : totalIncentivePayout
    const folioName = type === 'dividend' ? 'Folio 158 (Dividend Payable)' : 'Folio 157 (Honorarium/Incentives)'
    
    if (!window.confirm(`Are you sure you want to process this ${type}? \n\nThis will credit ₹${payout.toLocaleString('en-IN')} across eligible members and log to ${folioName}.`)) return
    
    setIsDisbursing(true)
    setTimeout(() => {
      alert(`Success! ₹${payout.toLocaleString('en-IN')} has been processed to ${folioName}.`)
      setIsDisbursing(false)
    }, 1500)
  }

  return (
    <CRow className="mb-4">
      <CCol xs={12}>
        <CCard className="shadow-sm border-top-success border-top-3">
          <CCardHeader className="py-3 d-flex justify-content-between align-items-center bg-white">
            <h4 className="mb-0 d-flex align-items-center gap-2">
              <CIcon icon={cilChartPie} className="text-success" size="lg" />
              Dividend & Incentive Engine
            </h4>
          </CCardHeader>
          <CCardBody className="p-4">
            
            <CNav variant="tabs" className="mb-4 fs-5 fw-semibold">
              <CNavItem>
                <CNavLink 
                  active={activeTab === 'dividend'} 
                  onClick={() => setActiveTab('dividend')}
                  style={{cursor: 'pointer', color: activeTab === 'dividend' ? '#198754' : '#6c757d'}}
                >
                  <CIcon icon={cilChartPie} className="me-2"/>
                  Share Capital Dividends
                </CNavLink>
              </CNavItem>
              <CNavItem>
                <CNavLink 
                  active={activeTab === 'incentive'} 
                  onClick={() => setActiveTab('incentive')}
                  style={{cursor: 'pointer', color: activeTab === 'incentive' ? '#0dcaf0' : '#6c757d'}}
                >
                  <CIcon icon={cilGift} className="me-2"/>
                  Borrower Incentives
                </CNavLink>
              </CNavItem>
            </CNav>

            {isLoading ? (
              <div className="text-center py-5"><CSpinner color="success" /></div>
            ) : activeTab === 'dividend' ? (
              
              /* ==========================================
                 DIVIDEND TAB
                 ========================================== */
              <div className="animate__animated animate__fadeIn">
                <CRow className="mb-5 justify-content-center">
                  <CCol md={4} className="mb-3 mb-md-0">
                    <CCard className="bg-light border-0 h-100 p-3 text-center">
                      <div className="text-muted small fw-bold text-uppercase mb-1">Total Eligible Share Capital</div>
                      <h3 className="mb-0 text-dark fw-bold">₹{totalShares.toLocaleString('en-IN')}</h3>
                    </CCard>
                  </CCol>
                  <CCol md={4} className="mb-3 mb-md-0">
                    <CCard className="bg-success bg-opacity-10 border-success h-100 p-3 text-center">
                      <div className="text-success small fw-bold text-uppercase mb-1">Proposed Dividend Rate</div>
                      <CInputGroup size="lg" className="w-75 mx-auto mt-2">
                        <CFormInput type="number" step="0.1" className="text-center fw-bold fs-4 text-success" value={dividendRate} onChange={(e) => setDividendRate(e.target.value)} />
                        <CInputGroupText className="bg-white fw-bold">%</CInputGroupText>
                      </CInputGroup>
                    </CCard>
                  </CCol>
                  <CCol md={4}>
                    <CCard className="bg-success bg-opacity-25 border-success h-100 p-3 text-center">
                      <div className="text-success small fw-bold text-uppercase mb-1">Estimated Dividend Payout</div>
                      <h3 className="mb-0 text-success fw-bold">₹{totalDividendPayout.toLocaleString('en-IN')}</h3>
                    </CCard>
                  </CCol>
                </CRow>

                <div className="d-flex justify-content-end mb-2">
                  <CButton color="dark" variant="outline" size="sm" onClick={() => downloadCSV('dividend')}>
                    <CIcon icon={cilCloudDownload} className="me-2" />
                    Export CSV Report
                  </CButton>
                </div>

                <div className="table-responsive border rounded shadow-sm mb-4">
                  <CTable hover align="middle" className="mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                        <CTableHeaderCell>Member Name</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Share Capital (₹)</CTableHeaderCell>
                        <CTableHeaderCell className="text-end text-success">Calculated Dividend (₹)</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {members.map((member) => (
                        <CTableRow key={`div-${member.vendorNo}`}>
                          <CTableDataCell className="fw-semibold text-medium-emphasis">{member.vendorNo}</CTableDataCell>
                          <CTableDataCell>{member.name}</CTableDataCell>
                          <CTableDataCell className="text-end">{member.shareCapital.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-success">
                            + {Math.round(member.shareCapital * (parseFloat(dividendRate) / 100) || 0).toLocaleString('en-IN')}
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                </div>
                
                <CButton color="success" size="lg" className="text-white fw-bold shadow w-100" onClick={() => handleDisbursement('dividend')} disabled={isDisbursing}>
                  {isDisbursing ? <CSpinner size="sm"/> : 'Process & Disburse Share Dividends (Folio 158)'}
                </CButton>
              </div>

            ) : (

              /* ==========================================
                 INCENTIVE TAB
                 ========================================== */
              <div className="animate__animated animate__fadeIn">
                <CRow className="mb-5 justify-content-center">
                  <CCol md={4} className="mb-3 mb-md-0">
                    <CCard className="bg-light border-0 h-100 p-3 text-center">
                      <div className="text-muted small fw-bold text-uppercase mb-1">Total Loan Interest Collected</div>
                      <h3 className="mb-0 text-dark fw-bold">₹{totalInterest.toLocaleString('en-IN')}</h3>
                    </CCard>
                  </CCol>
                  <CCol md={4} className="mb-3 mb-md-0">
                    <CCard className="bg-info bg-opacity-10 border-info h-100 p-3 text-center">
                      <div className="text-info small fw-bold text-uppercase mb-1">Patronage Incentive Rate</div>
                      <CInputGroup size="lg" className="w-75 mx-auto mt-2">
                        <CFormInput type="number" step="0.1" className="text-center fw-bold fs-4 text-info" value={incentiveRate} onChange={(e) => setIncentiveRate(e.target.value)} />
                        <CInputGroupText className="bg-white fw-bold">%</CInputGroupText>
                      </CInputGroup>
                    </CCard>
                  </CCol>
                  <CCol md={4}>
                    <CCard className="bg-info bg-opacity-25 border-info h-100 p-3 text-center">
                      <div className="text-info small fw-bold text-uppercase mb-1">Estimated Incentive Payout</div>
                      <h3 className="mb-0 text-info fw-bold">₹{totalIncentivePayout.toLocaleString('en-IN')}</h3>
                    </CCard>
                  </CCol>
                </CRow>

                <div className="d-flex justify-content-end mb-2">
                  <CButton color="dark" variant="outline" size="sm" onClick={() => downloadCSV('incentive')}>
                    <CIcon icon={cilCloudDownload} className="me-2" />
                    Export CSV Report
                  </CButton>
                </div>

                <div className="table-responsive border rounded shadow-sm mb-4">
                  <CTable hover align="middle" className="mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                        <CTableHeaderCell>Member Name</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Interest Paid this Year (₹)</CTableHeaderCell>
                        <CTableHeaderCell className="text-end text-info">Calculated Incentive (₹)</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {members.map((member) => (
                        <CTableRow key={`inc-${member.vendorNo}`}>
                          <CTableDataCell className="fw-semibold text-medium-emphasis">{member.vendorNo}</CTableDataCell>
                          <CTableDataCell>{member.name}</CTableDataCell>
                          <CTableDataCell className="text-end">{member.loanInterestPaid.toLocaleString('en-IN')}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-info">
                            + {Math.round(member.loanInterestPaid * (parseFloat(incentiveRate) / 100) || 0).toLocaleString('en-IN')}
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                </div>

                <CButton color="info" size="lg" className="text-white fw-bold shadow w-100" onClick={() => handleDisbursement('incentive')} disabled={isDisbursing}>
                  {isDisbursing ? <CSpinner size="sm"/> : 'Process & Disburse Borrower Incentives'}
                </CButton>
              </div>
            )}
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  )
}

export default IncentiveEngine