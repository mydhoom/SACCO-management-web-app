import React, { useState, useEffect, useCallback } from 'react'
import {
  CRow, CCol, CCard, CCardBody, CAlert,
  CProgress, CProgressBar, CSpinner,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWallet, cilMoney, cilChartPie, cilHistory, cilCheckCircle, cilWarning } from '@coreui/icons'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// A small KPI Card component
const KpiCard = ({ title, value, icon, color, subText }) => (
  <CCard className={`mb-4 border-top-${color} border-top-3 shadow-sm h-100 kpi-card`}>
    <CCardBody className="d-flex flex-column justify-content-center">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <div className="text-medium-emphasis small text-uppercase fw-semibold">{title}</div>
          <div className={`fs-4 fw-bold text-${color}`}>{value}</div>
        </div>
        <div className={`bg-${color} bg-opacity-10 p-3 rounded`}>
          <CIcon icon={icon} className={`text-${color}`} size="xl" />
        </div>
      </div>
      {subText && <div className="text-medium-emphasis small mt-auto">{subText}</div>}
    </CCardBody>
  </CCard>
)

const MemberDashboard = ({ user }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('loans') // 'loans' or 'shares'

  const fetchMemberData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken')

    try {
      const res = await fetch(`${API_BASE}/api/dashboard/member`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) throw new Error('Failed to load dashboard data.')

      const json = await res.json()
      setData(json.data)
    } catch (err) {
      console.error(err)
      setError('Could not connect to the live dashboard. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemberData()
  }, [fetchMemberData])

  const fmt = (num) => '₹' + new Intl.NumberFormat('en-IN').format(num || 0)
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  if (loading) {
    return (
      <div className="text-center py-5">
        <CSpinner color="primary" />
        <div className="mt-3 text-medium-emphasis">Fetching your live dashboard...</div>
      </div>
    )
  }

  if (error) {
    return <CAlert color="danger">{error}</CAlert>
  }

  if (!data) return null

  const { profile, loanPaid, repaymentProgress, loanHistory, shareHistory } = data

  return (
    <>
      <style>{`
        .kpi-card { transition: 0.2s ease; }
        .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12) !important; }
        .tab-btn { border:none; background:none; padding: 8px 18px; border-radius:8px; font-weight:600; color:#6c757d; transition:.2s; }
        .tab-btn.active { background:var(--cui-primary); color:#fff; }
        .tab-btn:hover:not(.active) { background:rgba(0,0,0,.06); }
      `}</style>

      <div className="d-flex align-items-center mb-4">
        <div>
          <h3 className="mb-0 fw-bold">Welcome back, {profile?.name || 'Member'}!</h3>
          <p className="text-medium-emphasis small mb-0">Vendor No: {profile?.vendorNo} • {profile?.designation}</p>
        </div>
      </div>

      <CRow>
        <CCol sm={6} lg={4}>
          <KpiCard
            title="My Share Capital"
            value={fmt(profile?.shareCapital)}
            icon={cilChartPie}
            color="primary"
            subText="Your total shares in the Sacco."
          />
        </CCol>

        <CCol sm={6} lg={4}>
          <KpiCard
            title="My Outstanding Loan"
            value={fmt(profile?.pendingLoanBalance)}
            icon={cilMoney}
            color="danger"
            subText={profile?.pendingLoanBalance > 0 ? `Active EMI: ${fmt(profile?.monthlyEmiAmount)}/mo` : 'No active loans! 🎉'}
          />
        </CCol>

        <CCol sm={6} lg={4}>
          <KpiCard
            title="My Monthly Savings"
            value={fmt(profile?.rdPool || 0)} // Assuming rdPool might be added later, fallback for now
            icon={cilWallet}
            color="success"
            subText="Your total recurring deposits."
          />
        </CCol>
      </CRow>

      {profile?.pendingLoanBalance > 0 && (
        <CCard className="mb-4 shadow-sm border-0">
          <CCardBody>
            <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
              <CIcon icon={cilCheckCircle} className="text-success" />
              Active Loan Repayment Progress
            </h6>
            <div className="d-flex justify-content-between text-medium-emphasis small mb-1">
              <span>Paid: {fmt(loanPaid)}</span>
              <span>Total: {fmt(profile?.activeLoanAmount)}</span>
            </div>
            <CProgress height={10} className="mb-2">
              <CProgressBar color="success" value={repaymentProgress} />
            </CProgress>
            <div className="text-end small fw-bold text-success">{repaymentProgress}% Cleared</div>
          </CCardBody>
        </CCard>
      )}

      {/* ── Transaction History Tabs ── */}
      <h5 className="fw-bold mb-3 mt-2 d-flex align-items-center gap-2">
        <CIcon icon={cilHistory} />
        Recent Transactions
      </h5>

      <div className="mb-3 p-1 bg-light rounded-3 d-inline-flex gap-1">
        <button className={`tab-btn ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>
          Loan History ({loanHistory?.length || 0})
        </button>
        <button className={`tab-btn ${activeTab === 'shares' ? 'active' : ''}`} onClick={() => setActiveTab('shares')}>
          Share & Savings History ({shareHistory?.length || 0})
        </button>
      </div>

      <CCard className="shadow-sm border-0 mb-5">
        <CCardBody className="p-0">
          <CTable align="middle" className="mb-0 border" hover responsive>
            <CTableHead color="light">
              <CTableRow>
                <CTableHeaderCell className="text-secondary small text-uppercase">Date</CTableHeaderCell>
                <CTableHeaderCell className="text-secondary small text-uppercase">Category</CTableHeaderCell>
                <CTableHeaderCell className="text-secondary small text-uppercase">Amount</CTableHeaderCell>
                <CTableHeaderCell className="text-secondary small text-uppercase text-end">Transaction ID</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {(activeTab === 'loans' ? loanHistory : shareHistory)?.map((tx) => (
                <CTableRow key={tx._id}>
                  <CTableDataCell className="fw-semibold small">{fmtDate(tx.transactionDate)}</CTableDataCell>
                  <CTableDataCell>
                    <CBadge color={tx.entryType === 'CREDIT' ? 'success' : 'danger'} shape="rounded-pill">
                      {tx.category.replace(/_/g, ' ')}
                    </CBadge>
                  </CTableDataCell>
                  <CTableDataCell className={`fw-bold text-${tx.entryType === 'CREDIT' ? 'success' : 'danger'}`}>
                    {tx.entryType === 'CREDIT' ? '+' : '-'}{fmt(tx.amount)}
                  </CTableDataCell>
                  <CTableDataCell className="text-end text-medium-emphasis small font-monospace">
                    {tx.transactionId}
                  </CTableDataCell>
                </CTableRow>
              ))}
              {(activeTab === 'loans' ? loanHistory : shareHistory)?.length === 0 && (
                <CTableRow>
                  <CTableDataCell colSpan="4" className="text-center py-4 text-medium-emphasis">
                    <CIcon icon={cilWarning} size="xl" className="mb-2 text-warning" />
                    <div>No recent transactions found.</div>
                  </CTableDataCell>
                </CTableRow>
              )}
            </CTableBody>
          </CTable>
        </CCardBody>
      </CCard>
    </>
  )
}

export default MemberDashboard
