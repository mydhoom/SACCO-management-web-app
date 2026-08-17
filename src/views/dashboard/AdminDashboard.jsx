import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CWidgetStatsF,
  CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell,
  CTableRow, CBadge, CSpinner, CAlert, CButton, CProgress, CProgressBar,
  CDropdown, CDropdownToggle, CDropdownMenu, CDropdownItem,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilUserFollow, cilBriefcase, cilChartPie, cilCreditCard,
  cilMoney, cilWarning, cilReload, cilGroup, cilChart, cilList,
} from '@coreui/icons'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend, LineElement, PointElement,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, LineElement, PointElement, ChartDataLabels)

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'

// ─── Helpers ───────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)
const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(n || 0)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const categoryColor = {
  SHARE_CAPITAL: 'primary', MONTHLY_THRIFT: 'info', LOAN_DISBURSEMENT: 'danger',
  LOAN_EMI: 'success', LOAN_REPAYMENT: 'success', RECURRING_DEPOSIT: 'warning',
  DIVIDEND_PAYOUT: 'secondary', REVERSAL: 'dark', default: 'secondary',
}

// ─── Sub-component: KPI Widget Card ────────────────────────
const KpiCard = ({ color, icon, title, value, subValue, link, pulse }) => (
  <CCard className={`mb-3 border-0 shadow-sm h-100 kpi-card ${pulse ? 'kpi-pulse' : ''}`} style={{ borderRadius: 14, transition: 'transform .2s' }}>
    <CCardBody>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <div className="text-uppercase fw-semibold small text-medium-emphasis mb-1">{title}</div>
          <div className={`fs-4 fw-bold text-${color}`}>{value}</div>
          {subValue && <div className="small text-medium-emphasis mt-1">{subValue}</div>}
        </div>
        <div className={`bg-${color} bg-opacity-10 p-3 rounded-3`}>
          <CIcon icon={icon} className={`text-${color}`} size="xl" />
        </div>
      </div>
      {link && (
        <Link to={link} className={`btn btn-sm btn-outline-${color} mt-3 w-100`}>View Details →</Link>
      )}
    </CCardBody>
  </CCard>
)

// ─── Sub-component: Live Transaction Row ───────────────────
const TxRow = ({ tx }) => {
  const catColor = categoryColor[tx.category] || categoryColor.default
  return (
    <CTableRow className="align-middle">
      <CTableDataCell className="small text-muted">{fmtDate(tx.transactionDate)}</CTableDataCell>
      <CTableDataCell>
        <div className="fw-semibold small">{tx.memberName || tx.vendorNo}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{tx.transactionId}</div>
      </CTableDataCell>
      <CTableDataCell>
        <CBadge color={catColor} shape="rounded-pill" style={{ fontSize: 10 }}>
          {tx.category?.replace(/_/g, ' ')}
        </CBadge>
      </CTableDataCell>
      <CTableDataCell className={`fw-bold text-end ${tx.entryType === 'CREDIT' ? 'text-success' : 'text-danger'}`}>
        {tx.entryType === 'CREDIT' ? '+' : '−'} {fmt(tx.amount)}
      </CTableDataCell>
    </CTableRow>
  )
}

// ─── Sub-component: Defaulter Row ──────────────────────────
const DefaulterRow = ({ m }) => (
  <CTableRow className="align-middle">
    <CTableDataCell>
      <div className="fw-semibold small">{m.name}</div>
      <div className="text-muted" style={{ fontSize: 11 }}>{m.vendorNo} · {m.designation}</div>
    </CTableDataCell>
    <CTableDataCell className="text-muted small">{m.circle || '—'}</CTableDataCell>
    <CTableDataCell className="fw-bold text-danger text-end">{fmt(m.pendingLoanBalance)}</CTableDataCell>
    <CTableDataCell className="text-end text-warning fw-semibold small">{fmt(m.monthlyEmiAmount)}</CTableDataCell>
  </CTableRow>
)

// ─── Main Dashboard Component ──────────────────────────────
const AdminDashboard = () => {
  const [userName, setUserName] = useState('Admin')
  const [kpis, setKpis] = useState(null)
  const [defaulters, setDefaulters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'defaulters' | 'transactions'
  const [chartPeriod, setChartPeriod] = useState(6)
  const [lastRefresh, setLastRefresh] = useState(null)
  const refreshTimer = useRef(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    try {
      const [kpiRes, defRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/kpis?period=${chartPeriod}`, { headers }),
        fetch(`${API_BASE}/api/dashboard/defaulters`, { headers }),
      ])

      if (!kpiRes.ok) throw new Error(`Dashboard API error: ${kpiRes.status}`)

      const kpiData = await kpiRes.json()
      setKpis(kpiData.data)

      if (defRes.ok) {
        const defData = await defRes.json()
        setDefaulters(defData.data || [])
      }

      setLastRefresh(new Date())
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError('Could not load live data. Retrying...')
    } finally {
      setLoading(false)
    }
  }, [chartPeriod])

  useEffect(() => {
    const savedName = localStorage.getItem('userName')
    if (savedName) setUserName(savedName)
    fetchData()

    // Auto-refresh every 60 seconds
    refreshTimer.current = setInterval(() => fetchData(true), 60000)
    return () => clearInterval(refreshTimer.current)
  }, [fetchData])

  // ─── Chart Data ────────────────────────────────────────────
  const barChartData = kpis ? {
    labels: kpis.cashFlowChart?.labels || [],
    datasets: [
      {
        label: 'Total Receipts (₹)',
        data: kpis.cashFlowChart?.credits || [],
        backgroundColor: 'rgba(46, 213, 115, 0.75)',
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: 'Total Disbursements (₹)',
        data: kpis.cashFlowChart?.debits || [],
        backgroundColor: 'rgba(255, 71, 87, 0.7)',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  } : null

  const doughnutData = kpis ? {
    labels: ['Share Capital', 'RD Pool', 'Active Loan Portfolio'],
    datasets: [{
      data: [
        kpis.financials?.shareCapital || 0,
        kpis.financials?.rdPool || 0,
        kpis.financials?.activeLoanPortfolio || 0,
      ],
      backgroundColor: ['#2ed573', '#1e90ff', '#ff4757'],
      borderColor: '#fff',
      borderWidth: 3,
      hoverOffset: 8,
    }]
  } : null

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ₹${new Intl.NumberFormat('en-IN').format(ctx.raw)}`
        }
      },
      datalabels: {
        color: '#495057',
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 10 },
        formatter: (value) => value > 0 ? '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value) : ''
      }
    },
    layout: { padding: { top: 20 } },
    scales: {
      y: {
        ticks: {
          callback: (val) => '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(val),
          font: { size: 10 }
        },
        grid: { color: 'rgba(0,0,0,0.05)' }
      },
      x: { grid: { display: false } }
    }
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ₹${new Intl.NumberFormat('en-IN').format(ctx.raw)}`
        }
      },
      datalabels: {
        color: '#fff',
        font: { weight: 'bold', size: 12 },
        formatter: (value) => value > 0 ? '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value) : ''
      }
    },
    cutout: '65%',
  }

  return (
    <>
      <style>{`
        .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12) !important; }
        .kpi-pulse { animation: pulse-border 2s ease infinite; }
        @keyframes pulse-border { 0%,100%{box-shadow:0 0 0 0 rgba(255,71,87,.3)} 50%{box-shadow:0 0 0 8px rgba(255,71,87,0)} }
        .live-dot { width:8px; height:8px; border-radius:50%; background:#2ed573; display:inline-block; margin-right:6px; animation: blink 1.4s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        .tab-btn { border:none; background:none; padding: 8px 18px; border-radius:8px; font-weight:600; color:#6c757d; transition:.2s; }
        .tab-btn.active { background:var(--cui-primary); color:#fff; }
        .tab-btn:hover:not(.active) { background:rgba(0,0,0,.06); }
      `}</style>

      {/* ── Header ── */}
      <CRow className="mb-3 align-items-center">
        <CCol>
          <h4 className="fw-bold mb-0">Society Analytics Dashboard</h4>
          <p className="text-medium-emphasis small mb-0">
            <span className="live-dot" />
            Live Data · Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString('en-IN') : '—'}
          </p>
        </CCol>
        <CCol xs="auto" className="d-flex gap-2">
          <CButton color="light" size="sm" onClick={() => fetchData()} disabled={loading}>
            <CIcon icon={cilReload} className="me-1" />{loading ? 'Refreshing…' : 'Refresh'}
          </CButton>
        </CCol>
      </CRow>

      {error && <CAlert color="warning" className="small">{error}</CAlert>}

      {/* ── Tabs ── */}
      <div className="mb-4 p-1 bg-light rounded-3 d-inline-flex gap-1">
        {[['overview', cilChart, 'Overview'], ['transactions', cilList, 'Live Feed'], ['defaulters', cilWarning, 'Defaulter Watch']].map(([key, icon, label]) => (
          <button key={key} className={`tab-btn ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            <CIcon icon={icon} className="me-1" />{label}
            {key === 'defaulters' && defaulters.length > 0 && (
              <CBadge color="danger" className="ms-2" shape="rounded-pill">{defaulters.length}</CBadge>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5">
          <CSpinner color="primary" />
          <div className="mt-3 text-medium-emphasis">Fetching live society data…</div>
        </div>
      ) : (
        <>
          {/* ══════════ TAB: OVERVIEW ══════════ */}
          {activeTab === 'overview' && kpis && (
            <>
              {/* Pending Actions Alert */}
              {(kpis.members?.pending > 0 || kpis.members?.pendingLoans > 0) && (
                <CAlert color="warning" className="d-flex align-items-center gap-2 py-2 small">
                  <CIcon icon={cilWarning} />
                  <span>
                    <strong>Action Required:</strong>{' '}
                    {kpis.members?.pending > 0 && <>{kpis.members.pending} member registration{kpis.members.pending > 1 ? 's' : ''} awaiting approval.{' '}</>}
                    {kpis.members?.pendingLoans > 0 && <>{kpis.members.pendingLoans} loan application{kpis.members.pendingLoans > 1 ? 's' : ''} pending review.</>}
                  </span>
                  <Link to="/admin/approvals" className="btn btn-sm btn-warning ms-auto">Review Now →</Link>
                </CAlert>
              )}

              {/* ── KPI Row 1: Member & Society Health ── */}
              <CRow className="mb-2">
                <CCol xs={6} lg={3}>
                  <KpiCard color="primary" icon={cilGroup} title="Total Members" value={fmtNum(kpis.members?.approved)} subValue={`${kpis.members?.pending || 0} pending approval`} link="/admin/directory" />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="success" icon={cilChartPie} title="Total Share Capital" value={fmt(kpis.financials?.shareCapital)} subValue={`Dividends paid: ${fmt(kpis.financials?.totalDividends)}`} link="/accounts/shares" />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="info" icon={cilMoney} title="RD Pool (Savings)" value={fmt(kpis.financials?.rdPool)} subValue={`Monthly collection: ${fmt(kpis.financials?.monthlyRDCollection)}`} link="/accounts/shares" />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="danger" icon={cilCreditCard} title="Active Loan Portfolio" value={fmt(kpis.financials?.activeLoanPortfolio)} subValue={`${fmtNum(kpis.financials?.activeLoansCount)} active loans`} link="/accounts/loans" pulse={kpis.members?.pendingLoans > 0} />
                </CCol>
              </CRow>

              {/* ── KPI Row 2: Health Indicators ── */}
              <CRow className="mb-4">
                <CCol xs={6} lg={3}>
                  <KpiCard color="warning" icon={cilWarning} title="Defaulters Detected" value={fmtNum(defaulters.length)} subValue="EMI overdue > 35 days" link={null} pulse={defaulters.length > 0} />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="success" icon={cilBriefcase} title="Estimated Liquid Fund" value={fmt(kpis.financials?.liquidFund)} subValue="Share Capital + RD − Loans" />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="secondary" icon={cilMoney} title="Total Interest Pending" value={fmt(kpis.financials?.activeLoanInterest)} subValue="Across all active loans" />
                </CCol>
                <CCol xs={6} lg={3}>
                  <KpiCard color="warning" icon={cilUserFollow} title="Pending Actions" value={`${(kpis.members?.pending || 0) + (kpis.members?.pendingLoans || 0)}`} subValue={`${kpis.members?.pending || 0} registrations · ${kpis.members?.pendingLoans || 0} loans`} link="/admin/approvals" />
                </CCol>
              </CRow>

              {/* ── Charts Row ── */}
              <CRow className="mb-4">
                <CCol lg={7}>
                  <CCard className="border-0 shadow-sm h-100">
                    <CCardHeader className="bg-transparent fw-semibold border-bottom-0 pb-0 d-flex justify-content-between align-items-center">
                      <span>📊 Monthly Cash Flow</span>
                      <CDropdown variant="btn-group">
                        <CDropdownToggle color="secondary" size="sm" variant="outline">
                          {chartPeriod === 1 ? 'Last 1 Month' : chartPeriod === 6 ? 'Last 6 Months' : 'Last 1 Year'}
                        </CDropdownToggle>
                        <CDropdownMenu>
                          <CDropdownItem onClick={() => setChartPeriod(1)}>Last 1 Month</CDropdownItem>
                          <CDropdownItem onClick={() => setChartPeriod(6)}>Last 6 Months</CDropdownItem>
                          <CDropdownItem onClick={() => setChartPeriod(12)}>Last 1 Year</CDropdownItem>
                        </CDropdownMenu>
                      </CDropdown>
                    </CCardHeader>
                    <CCardBody style={{ height: 300 }}>
                      {barChartData && barChartData.labels.length > 0
                        ? <Bar data={barChartData} options={barChartOptions} />
                        : <div className="text-center text-muted py-5">No transaction data available for chart.</div>
                      }
                    </CCardBody>
                  </CCard>
                </CCol>
                <CCol lg={5}>
                  <CCard className="border-0 shadow-sm h-100">
                    <CCardHeader className="bg-transparent fw-semibold border-bottom-0 pb-0">
                      🥧 Portfolio Distribution
                    </CCardHeader>
                    <CCardBody style={{ height: 300 }}>
                      {doughnutData
                        ? <Doughnut data={doughnutData} options={doughnutOptions} />
                        : <div className="text-center text-muted py-5">No data yet.</div>
                      }
                    </CCardBody>
                  </CCard>
                </CCol>
              </CRow>
            </>
          )}

          {/* ══════════ TAB: LIVE TRANSACTION FEED ══════════ */}
          {activeTab === 'transactions' && kpis && (
            <CCard className="border-0 shadow-sm">
              <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
                <span className="live-dot" />
                Live Transaction Feed (Last 10)
              </CCardHeader>
              <CCardBody className="p-0">
                {kpis.recentTransactions?.length > 0 ? (
                  <CTable hover responsive align="middle" className="mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell>Member</CTableHeaderCell>
                        <CTableHeaderCell>Category</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Amount</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {kpis.recentTransactions.map((tx, i) => <TxRow key={i} tx={tx} />)}
                    </CTableBody>
                  </CTable>
                ) : (
                  <div className="text-center text-muted py-5">No transactions recorded yet.</div>
                )}
              </CCardBody>
            </CCard>
          )}

          {/* ══════════ TAB: DEFAULTER WATCH ══════════ */}
          {activeTab === 'defaulters' && (
            <CCard className="border-0 shadow-sm">
              <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
                <CIcon icon={cilWarning} className="text-danger" />
                Defaulter Watch — EMI Overdue &gt; 35 Days
                {defaulters.length > 0 && (
                  <CBadge color="danger" className="ms-2">{defaulters.length} member{defaulters.length > 1 ? 's' : ''}</CBadge>
                )}
              </CCardHeader>
              <CCardBody className="p-0">
                {defaulters.length > 0 ? (
                  <CTable hover responsive align="middle" className="mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Member</CTableHeaderCell>
                        <CTableHeaderCell>Circle</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Pending Balance</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Monthly EMI</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {defaulters.map((m, i) => <DefaulterRow key={i} m={m} />)}
                    </CTableBody>
                  </CTable>
                ) : (
                  <div className="text-center py-5">
                    <div className="fs-1">✅</div>
                    <div className="fw-semibold text-success mt-2">No defaulters detected!</div>
                    <div className="text-muted small">All members with active loans have paid EMI within the last 35 days.</div>
                  </div>
                )}
              </CCardBody>
            </CCard>
          )}
        </>
      )}
    </>
  )
}

export default AdminDashboard
