/**
 * DuplicateReviewQueue.jsx
 *
 * Admin-only screen for reviewing flagged duplicate entries.
 *
 * Features:
 *  - Shows ALL pending duplicate flags from any upload session
 *  - Side-by-side comparison: Incoming vs Existing record
 *  - Admin can: Accept (keep incoming), Reject (discard incoming), Add note
 *  - Bulk Accept / Bulk Reject with filter
 *  - Status badges: PENDING / ACCEPTED / REJECTED
 *  - Export resolved queue to Excel
 *  - Badge count on nav shows pending duplicates
 *  - Auto-refreshes when new duplicates are detected (custom event)
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CButton, CAlert,
  CBadge, CTable, CTableHead, CTableRow, CTableHeaderCell,
  CTableBody, CTableDataCell, CModal, CModalHeader, CModalTitle,
  CModalBody, CModalFooter, CFormTextarea, CNav, CNavItem, CNavLink,
  CTabContent, CTabPane, CProgress, CFormSelect, CInputGroup,
  CInputGroupText, CFormInput, CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCheckCircle, cilBan, cilWarning, cilFilter,
  cilCloudDownload, cilTrash, cilReload, cilInfo,
} from '@coreui/icons'
import * as XLSX from 'xlsx'
import {
  getStoredQueue, updateFlagStatus, clearResolvedFlags, getPendingCount,
} from '../../utils/duplicateDetector'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => {
  const num = Number(String(n || 0).replace(/[₹,\s]/g, ''))
  return isNaN(num) ? String(n || '—') : `₹ ${num.toLocaleString('en-IN')}`
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const SEVERITY_COLORS = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'info' }
const TYPE_LABELS = {
  INTRA_BATCH: '📄 Within Same File',
  EXISTING_RECORD: '🗄️ Already in Database',
}
const UPLOAD_TYPE_LABELS = { shares: '📊 Shares/RD Batch', loans: '💳 Loan EMI Batch', master: '👤 Member Master' }
const STATUS_COLORS = { PENDING: 'warning', ACCEPTED: 'success', REJECTED: 'danger' }

// ─── Row comparison renderer ──────────────────────────────────────────────────
const CompareRow = ({ label, incoming, existing, highlight }) => {
  const diff = String(incoming ?? '') !== String(existing ?? '')
  return (
    <tr style={{ background: diff && highlight ? '#fff8e8' : 'transparent' }}>
      <td className="text-muted fw-semibold small" style={{ width: '30%', paddingLeft: 12, borderRight: '1px solid #e2e8f0' }}>
        {label}
      </td>
      <td className="small" style={{ width: '35%', color: diff ? '#be123c' : '#1d2d3e', fontWeight: diff ? 600 : 400 }}>
        {incoming ?? '—'}
      </td>
      <td className="small" style={{ width: '35%', color: diff ? '#107e3e' : '#1d2d3e' }}>
        {existing ?? '—'}
      </td>
    </tr>
  )
}

const NUMERIC_FIELDS = ['Share_Deduction', 'RD_Deduction', 'Total_EMI_Amount', 'Opening_Share_Balance', 'Opening_RD_Balance', 'Opening_Principal_Pending', 'Current_EMI_Amount']
const DATE_FIELDS = ['Transaction_Date', 'issueDate', 'transactionDate', 'createdAt']

const renderValue = (key, val) => {
  if (NUMERIC_FIELDS.includes(key)) return fmt(val)
  if (DATE_FIELDS.includes(key)) return fmtDate(val)
  return val ?? '—'
}

// ─── Field list for comparison ────────────────────────────────────────────────
const getCompareFields = (flag) => {
  const incoming = flag.incomingRow || {}
  const existing = flag.conflictRow || {}
  const allKeys = new Set([
    ...Object.keys(incoming).filter(k => !k.startsWith('_')),
    ...Object.keys(existing).filter(k => !k.startsWith('_')),
  ])
  return Array.from(allKeys)
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DuplicateReviewQueue() {
  const [queue, setQueue] = useState([])
  const [activeTab, setActiveTab] = useState(1) // 1=Pending 2=Accepted 3=Rejected
  const [filterType, setFilterType] = useState('ALL') // ALL | shares | loans | master
  const [filterSeverity, setFilterSeverity] = useState('ALL')
  const [searchText, setSearchText] = useState('')
  const [selectedFlag, setSelectedFlag] = useState(null)
  const [adminNote, setAdminNote] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [alertMsg, setAlertMsg] = useState(null)

  const loadQueue = useCallback(() => {
    setQueue(getStoredQueue())
  }, [])

  useEffect(() => {
    loadQueue()
    window.addEventListener('duplicateQueueUpdated', loadQueue)
    return () => window.removeEventListener('duplicateQueueUpdated', loadQueue)
  }, [loadQueue])

  // ─── Filtered views ───────────────────────────────────────────────────────
  const filterFlags = (status) => {
    let list = queue.filter(f => f.status === status)
    if (filterType !== 'ALL') list = list.filter(f => f.uploadType === filterType)
    if (filterSeverity !== 'ALL') list = list.filter(f => f.severity === filterSeverity)
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      list = list.filter(f =>
        JSON.stringify(f.incomingRow || {}).toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        (f.reason || '').toLowerCase().includes(q)
      )
    }
    return list
  }

  const pendingList = filterFlags('PENDING')
  const acceptedList = filterFlags('ACCEPTED')
  const rejectedList = filterFlags('REJECTED')

  // ─── Actions ───────────────────────────────────────────────────────────────
  const resolveFlag = (flagId, status, note = adminNote) => {
    setIsProcessing(true)
    setTimeout(() => {
      updateFlagStatus(flagId, status, note)
      loadQueue()
      setSelectedFlag(null)
      setAdminNote('')
      setIsProcessing(false)
      setAlertMsg({
        type: status === 'ACCEPTED' ? 'success' : 'danger',
        text: status === 'ACCEPTED'
          ? '✅ Entry accepted — it will be included in the upload.'
          : '🚫 Entry rejected — it will be excluded from the upload.',
      })
      setTimeout(() => setAlertMsg(null), 4000)
    }, 300)
  }

  const bulkResolve = (status) => {
    if (bulkSelected.size === 0) return
    setIsProcessing(true)
    bulkSelected.forEach(id => updateFlagStatus(id, status, `Bulk ${status.toLowerCase()} by admin`))
    loadQueue()
    setBulkSelected(new Set())
    setIsProcessing(false)
    setAlertMsg({
      type: status === 'ACCEPTED' ? 'success' : 'secondary',
      text: `${status === 'ACCEPTED' ? '✅ Accepted' : '🚫 Rejected'} ${bulkSelected.size} entries.`,
    })
    setTimeout(() => setAlertMsg(null), 3000)
  }

  const toggleBulk = (id) => {
    const next = new Set(bulkSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setBulkSelected(next)
  }

  const selectAllVisible = () => {
    const ids = pendingList.map(f => f.id)
    setBulkSelected(new Set(ids))
  }

  // ─── Export to Excel ─────────────────────────────────────────────────────
  const exportToExcel = () => {
    const rows = queue.map(f => ({
      'Flag ID': f.id,
      'Status': f.status,
      'Severity': f.severity,
      'Upload Type': f.uploadType,
      'Detected At': f.detectedAt ? new Date(f.detectedAt).toLocaleString('en-IN') : '',
      'Resolved At': f.resolvedAt ? new Date(f.resolvedAt).toLocaleString('en-IN') : '',
      'Reason': f.reason,
      'Incoming Description': f.description,
      'Admin Note': f.adminNote,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 50 }, { wch: 50 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Duplicate Review')
    XLSX.writeFile(wb, `DuplicateReview_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // ─── Flag table renderer ──────────────────────────────────────────────────
  const FlagTable = ({ flags, showActions = true }) => (
    <div className="table-responsive">
      <CTable hover bordered align="middle" className="mb-0">
        <CTableHead color="light">
          <CTableRow>
            {showActions && (
              <CTableHeaderCell style={{ width: 44 }}>
                <input type="checkbox"
                  checked={bulkSelected.size === pendingList.length && pendingList.length > 0}
                  onChange={(e) => e.target.checked ? selectAllVisible() : setBulkSelected(new Set())}
                />
              </CTableHeaderCell>
            )}
            <CTableHeaderCell style={{ width: 110 }}>Severity</CTableHeaderCell>
            <CTableHeaderCell style={{ width: 160 }}>Duplicate Type</CTableHeaderCell>
            <CTableHeaderCell>Incoming Record</CTableHeaderCell>
            <CTableHeaderCell>Reason</CTableHeaderCell>
            <CTableHeaderCell style={{ width: 110 }}>Upload Type</CTableHeaderCell>
            <CTableHeaderCell style={{ width: 100 }}>Detected</CTableHeaderCell>
            {showActions && <CTableHeaderCell style={{ width: 180 }} className="text-center">Actions</CTableHeaderCell>}
            {!showActions && <CTableHeaderCell style={{ width: 100 }}>Resolved</CTableHeaderCell>}
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {flags.length === 0 && (
            <CTableRow>
              <CTableDataCell colSpan={showActions ? 8 : 8} className="text-center text-muted py-5">
                No entries found.
              </CTableDataCell>
            </CTableRow>
          )}
          {flags.map(flag => (
            <CTableRow
              key={flag.id}
              style={{
                borderLeft: `4px solid ${flag.severity === 'HIGH' ? '#dc3545' : flag.severity === 'MEDIUM' ? '#f59e0b' : '#0ea5e9'}`,
                cursor: 'pointer',
                background: bulkSelected.has(flag.id) ? '#f0f9ff' : undefined,
              }}
            >
              {showActions && (
                <CTableDataCell onClick={e => { e.stopPropagation(); toggleBulk(flag.id) }}>
                  <input type="checkbox" checked={bulkSelected.has(flag.id)} readOnly />
                </CTableDataCell>
              )}
              <CTableDataCell>
                <CBadge color={SEVERITY_COLORS[flag.severity] || 'secondary'} className="px-2 py-1">
                  {flag.severity}
                </CBadge>
              </CTableDataCell>
              <CTableDataCell>
                <div className="small fw-semibold">{TYPE_LABELS[flag.type] || flag.type}</div>
              </CTableDataCell>
              <CTableDataCell onClick={() => { setSelectedFlag(flag); setAdminNote(flag.adminNote || '') }}>
                <div className="small fw-semibold" style={{ color: '#1d2d3e', maxWidth: 280 }}>
                  {flag.description || JSON.stringify(flag.incomingRow).slice(0, 60) + '…'}
                </div>
                {flag.matchFields?.length > 0 && (
                  <div className="mt-1">
                    {flag.matchFields.map(f => (
                      <CBadge key={f} color="light" textColor="dark" className="me-1 small px-1">{f}</CBadge>
                    ))}
                  </div>
                )}
              </CTableDataCell>
              <CTableDataCell>
                <div className="small text-muted" style={{ maxWidth: 200 }}>{flag.reason}</div>
                {flag.adminNote && <div className="small text-primary mt-1">📝 {flag.adminNote}</div>}
              </CTableDataCell>
              <CTableDataCell>
                <CBadge color="secondary" className="px-2 small">
                  {UPLOAD_TYPE_LABELS[flag.uploadType] || flag.uploadType || '—'}
                </CBadge>
              </CTableDataCell>
              <CTableDataCell className="small text-muted">
                {flag.detectedAt ? new Date(flag.detectedAt).toLocaleDateString('en-IN') : '—'}
              </CTableDataCell>
              {showActions && (
                <CTableDataCell className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    <CButton
                      size="sm" color="success" variant="outline"
                      title="Accept this entry — include it in upload"
                      onClick={() => resolveFlag(flag.id, 'ACCEPTED')}
                    >
                      <CIcon icon={cilCheckCircle} /> Accept
                    </CButton>
                    <CButton
                      size="sm" color="danger" variant="outline"
                      title="Reject this entry — exclude it from upload"
                      onClick={() => resolveFlag(flag.id, 'REJECTED')}
                    >
                      <CIcon icon={cilBan} /> Reject
                    </CButton>
                    <CButton
                      size="sm" color="info" variant="ghost"
                      title="View full side-by-side comparison"
                      onClick={() => { setSelectedFlag(flag); setAdminNote(flag.adminNote || '') }}
                    >
                      <CIcon icon={cilInfo} />
                    </CButton>
                  </div>
                </CTableDataCell>
              )}
              {!showActions && (
                <CTableDataCell className="small text-muted">
                  {flag.resolvedAt ? new Date(flag.resolvedAt).toLocaleDateString('en-IN') : '—'}
                </CTableDataCell>
              )}
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>
    </div>
  )

  const pendingCount = queue.filter(f => f.status === 'PENDING').length
  const acceptedCount = queue.filter(f => f.status === 'ACCEPTED').length
  const rejectedCount = queue.filter(f => f.status === 'REJECTED').length
  const totalCount = queue.length

  return (
    <>
      {/* ── Comparison Modal ─────────────────────────────────── */}
      <CModal
        visible={!!selectedFlag}
        size="xl"
        alignment="center"
        onClose={() => { setSelectedFlag(null); setAdminNote('') }}
      >
        {selectedFlag && (
          <>
            <CModalHeader style={{
              background: selectedFlag.severity === 'HIGH' ? '#fff0f0' : selectedFlag.severity === 'MEDIUM' ? '#fff8e8' : '#f0f9ff',
              borderBottom: `3px solid ${selectedFlag.severity === 'HIGH' ? '#dc3545' : selectedFlag.severity === 'MEDIUM' ? '#f59e0b' : '#0ea5e9'}`,
            }}>
              <CModalTitle className="d-flex align-items-center gap-2">
                <CIcon icon={cilWarning} className={`text-${SEVERITY_COLORS[selectedFlag.severity]}`} />
                Duplicate Review — {TYPE_LABELS[selectedFlag.type]}
                <CBadge color={SEVERITY_COLORS[selectedFlag.severity]} className="ms-2">{selectedFlag.severity} RISK</CBadge>
              </CModalTitle>
            </CModalHeader>

            <CModalBody>
              {/* Summary Banner */}
              <CAlert color={SEVERITY_COLORS[selectedFlag.severity]} className="py-2 mb-4">
                <strong>{selectedFlag.reason}</strong>
                <div className="small mt-1 text-muted">
                  Matched on: {(selectedFlag.matchFields || []).join(', ')}
                </div>
              </CAlert>

              {/* Side-by-side comparison */}
              <div className="table-responsive">
                <table className="table table-bordered" style={{ fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ width: '30%' }}>Field</th>
                      <th style={{ width: '35%', color: '#be123c' }}>
                        📥 Incoming (new upload)
                        <div className="small fw-normal text-muted mt-1">This is the row being uploaded</div>
                      </th>
                      <th style={{ width: '35%', color: '#107e3e' }}>
                        🗄️ {selectedFlag.type === 'INTRA_BATCH' ? 'Duplicate (same file)' : 'Existing Record (database)'}
                        <div className="small fw-normal text-muted mt-1">
                          {selectedFlag.type === 'INTRA_BATCH' ? 'Another row in the same file' : 'Already saved in the system'}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCompareFields(selectedFlag).map(key => (
                      <CompareRow
                        key={key}
                        label={key}
                        incoming={renderValue(key, (selectedFlag.incomingRow || {})[key])}
                        existing={renderValue(key, (selectedFlag.conflictRow || {})[key])}
                        highlight={(selectedFlag.matchFields || []).includes(key)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Admin Note */}
              <div className="mt-3">
                <label className="fw-semibold small text-muted text-uppercase mb-1">📝 Admin Note (optional)</label>
                <CFormTextarea
                  rows={2}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Add a note explaining your decision (optional)..."
                  className="shadow-none"
                />
              </div>
            </CModalBody>

            <CModalFooter className="gap-2 justify-content-between">
              <CButton color="secondary" variant="outline" onClick={() => { setSelectedFlag(null); setAdminNote('') }}>
                Close (Decide Later)
              </CButton>
              <div className="d-flex gap-2">
                <CButton
                  color="danger"
                  className="fw-bold px-4"
                  onClick={() => resolveFlag(selectedFlag.id, 'REJECTED', adminNote)}
                  disabled={isProcessing}
                >
                  <CIcon icon={cilBan} className="me-2" />
                  🚫 Reject — Exclude from Upload
                </CButton>
                <CButton
                  color="success"
                  className="fw-bold px-4"
                  onClick={() => resolveFlag(selectedFlag.id, 'ACCEPTED', adminNote)}
                  disabled={isProcessing}
                >
                  <CIcon icon={cilCheckCircle} className="me-2" />
                  ✅ Accept — Include in Upload
                </CButton>
              </div>
            </CModalFooter>
          </>
        )}
      </CModal>

      {/* ── MAIN PAGE ─────────────────────────────────────────────── */}
      <CRow>
        <CCol xs={12}>

          {/* Page Header */}
          <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'linear-gradient(135deg, #be123c, #e11d48)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <CIcon icon={cilWarning} size="xl" style={{ color: 'white' }} />
            </div>
            <div>
              <h3 className="mb-0 fw-bold" style={{ color: '#1d2d3e' }}>
                Duplicate Entry Review Queue
                {pendingCount > 0 && (
                  <CBadge color="danger" className="ms-3 fs-6 px-3">{pendingCount} Pending</CBadge>
                )}
              </h3>
              <div className="text-muted small">
                Review and decide on duplicate entries detected during data uploads. System will not auto-reject — only Admin can approve or reject.
              </div>
            </div>
            <div className="ms-auto d-flex gap-2 flex-wrap">
              <CButton color="secondary" variant="outline" size="sm" onClick={loadQueue}>
                <CIcon icon={cilReload} className="me-1" /> Refresh
              </CButton>
              <CButton color="success" variant="outline" size="sm" onClick={exportToExcel} disabled={queue.length === 0}>
                <CIcon icon={cilCloudDownload} className="me-1" /> Export Excel
              </CButton>
              <CButton color="secondary" variant="ghost" size="sm" onClick={() => { clearResolvedFlags(); loadQueue() }}>
                <CIcon icon={cilTrash} className="me-1" /> Clear Resolved
              </CButton>
            </div>
          </div>

          {/* Alert */}
          {alertMsg && (
            <CAlert color={alertMsg.type} className="mb-3 py-2" dismissible onClose={() => setAlertMsg(null)}>
              {alertMsg.text}
            </CAlert>
          )}

          {/* KPI Cards */}
          <CRow className="g-3 mb-4">
            {[
              { label: 'Total Flagged', value: totalCount, color: '#64748b', bg: '#f8fafc' },
              { label: 'Pending Review', value: pendingCount, color: '#d97706', bg: '#fffbeb' },
              { label: 'Accepted', value: acceptedCount, color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Rejected', value: rejectedCount, color: '#dc2626', bg: '#fff1f2' },
            ].map(card => (
              <CCol key={card.label} xs={6} md={3}>
                <div className="p-3 rounded-3" style={{ background: card.bg, border: `1px solid ${card.color}33` }}>
                  <div className="small text-muted fw-semibold text-uppercase">{card.label}</div>
                  <div className="fw-bold mt-1" style={{ fontSize: '2rem', color: card.color, lineHeight: 1 }}>
                    {card.value}
                  </div>
                </div>
              </CCol>
            ))}
          </CRow>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mb-4">
              <div className="d-flex justify-content-between small text-muted mb-1">
                <span>Review Progress</span>
                <span>{Math.round(((acceptedCount + rejectedCount) / totalCount) * 100)}% resolved</span>
              </div>
              <CProgress className="mb-1" style={{ height: 8 }}>
                <div style={{ width: `${(acceptedCount / totalCount) * 100}%`, background: '#16a34a', height: '100%', borderRadius: 4 }} />
                <div style={{ width: `${(rejectedCount / totalCount) * 100}%`, background: '#dc2626', height: '100%', borderRadius: 4 }} />
              </CProgress>
              <div className="d-flex gap-4 small text-muted">
                <span><span style={{ color: '#16a34a' }}>■</span> Accepted</span>
                <span><span style={{ color: '#dc2626' }}>■</span> Rejected</span>
                <span><span style={{ color: '#e2e8f0' }}>■</span> Pending</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <CCard className="shadow-sm border-0 mb-4">
            <CCardBody className="py-3">
              <CRow className="g-2 align-items-center">
                <CCol md={3}>
                  <CInputGroup size="sm">
                    <CInputGroupText>🔍</CInputGroupText>
                    <CFormInput
                      placeholder="Search by name, vendor no, batch..."
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                    />
                  </CInputGroup>
                </CCol>
                <CCol md={3}>
                  <CFormSelect size="sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="ALL">All Upload Types</option>
                    <option value="shares">Shares / RD</option>
                    <option value="loans">Loan EMI</option>
                    <option value="master">Member Master</option>
                  </CFormSelect>
                </CCol>
                <CCol md={3}>
                  <CFormSelect size="sm" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
                    <option value="ALL">All Severities</option>
                    <option value="HIGH">High Risk</option>
                    <option value="MEDIUM">Medium Risk</option>
                    <option value="LOW">Low Risk</option>
                  </CFormSelect>
                </CCol>
                {bulkSelected.size > 0 && (
                  <CCol md="auto" className="ms-auto d-flex gap-2">
                    <span className="small text-muted align-self-center">{bulkSelected.size} selected</span>
                    <CButton size="sm" color="success" onClick={() => bulkResolve('ACCEPTED')}>
                      <CIcon icon={cilCheckCircle} className="me-1" /> Bulk Accept
                    </CButton>
                    <CButton size="sm" color="danger" onClick={() => bulkResolve('REJECTED')}>
                      <CIcon icon={cilBan} className="me-1" /> Bulk Reject
                    </CButton>
                  </CCol>
                )}
              </CRow>
            </CCardBody>
          </CCard>

          {/* Main Tabs */}
          <CCard className="shadow-sm border-0">
            <CCardBody className="p-0">
              <CNav variant="tabs" className="px-3 pt-3 bg-light border-bottom">
                <CNavItem>
                  <CNavLink active={activeTab === 1} onClick={() => setActiveTab(1)} style={{ cursor: 'pointer' }}>
                    ⏳ Pending Review
                    {pendingList.length > 0 && <CBadge color="danger" className="ms-2">{pendingList.length}</CBadge>}
                  </CNavLink>
                </CNavItem>
                <CNavItem>
                  <CNavLink active={activeTab === 2} onClick={() => setActiveTab(2)} style={{ cursor: 'pointer' }}>
                    ✅ Accepted
                    {acceptedList.length > 0 && <CBadge color="success" className="ms-2">{acceptedList.length}</CBadge>}
                  </CNavLink>
                </CNavItem>
                <CNavItem>
                  <CNavLink active={activeTab === 3} onClick={() => setActiveTab(3)} style={{ cursor: 'pointer' }}>
                    🚫 Rejected
                    {rejectedList.length > 0 && <CBadge color="secondary" className="ms-2">{rejectedList.length}</CBadge>}
                  </CNavLink>
                </CNavItem>
              </CNav>

              <CTabContent className="p-0">
                <CTabPane visible={activeTab === 1}>
                  {pendingList.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <div style={{ fontSize: '3rem' }}>✅</div>
                      <div className="fw-bold mt-2">No pending duplicates!</div>
                      <div className="small">All flagged entries have been reviewed.</div>
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2 border-bottom d-flex align-items-center justify-content-between bg-warning bg-opacity-10">
                        <span className="small fw-bold text-warning">
                          ⚠️ {pendingList.length} entries require your review before the upload is finalized.
                        </span>
                        <div className="d-flex gap-2">
                          <CButton size="sm" color="success" variant="outline" onClick={() => bulkResolve('ACCEPTED')}>
                            Accept All Visible
                          </CButton>
                          <CButton size="sm" color="danger" variant="outline" onClick={() => bulkResolve('REJECTED')}>
                            Reject All Visible
                          </CButton>
                        </div>
                      </div>
                      <FlagTable flags={pendingList} showActions={true} />
                    </>
                  )}
                </CTabPane>

                <CTabPane visible={activeTab === 2}>
                  <FlagTable flags={acceptedList} showActions={false} />
                </CTabPane>

                <CTabPane visible={activeTab === 3}>
                  <FlagTable flags={rejectedList} showActions={false} />
                </CTabPane>
              </CTabContent>
            </CCardBody>
          </CCard>

          {/* Helper info */}
          <CAlert color="info" className="mt-4 py-2 small">
            <strong>How it works:</strong> When you upload an Excel file or enter data manually, the system detects potential duplicates (same member + amount + date or same record already in database). 
            Instead of auto-rejecting, all flagged entries appear here for your review. 
            <strong> Accept</strong> = entry will be saved. <strong>Reject</strong> = entry will be discarded.
          </CAlert>

        </CCol>
      </CRow>
    </>
  )
}
