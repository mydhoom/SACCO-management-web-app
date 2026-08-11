import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CTable, CTableBody,
  CTableDataCell, CTableHead, CTableHeaderCell, CTableRow, CButton,
  CSpinner, CAlert, CBadge, CModal, CModalHeader, CModalTitle,
  CModalBody, CModalFooter, CForm, CFormLabel, CFormInput, CFormSelect,
  CInputGroup, CInputGroupText, CNav, CNavItem, CNavLink, CTabContent,
  CTabPane, CFormTextarea
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilSearch, cilLoop, cilPencil, cilSpreadsheet, cilFile,
  cilWarning, cilCheckCircle, cilHistory, cilFilter
} from '@coreui/icons'

const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'

const CATEGORY_OPTIONS = [
  'ALL','SHARE_CAPITAL','MONTHLY_THRIFT','LOAN_DISBURSEMENT','LOAN_EMI',
  'LOAN_REPAYMENT','RECURRING_DEPOSIT','DIVIDEND_PAYOUT','PENALTY',
  'WELFARE_FUND','HONORARIUM','ADMISSION_FEE','STATIONARY_MISC',
  'AUDIT_FEE','RESERVE_FUND','EDUCATION_FUND','BANK_RECEIPT','INTEREST_INCOME'
]

const EDITABLE_FIELDS = [
  { key: 'description',          label: 'Description / Particulars' },
  { key: 'paymentMode',          label: 'Payment Mode' },
  { key: 'transactionReference', label: 'Reference No.' },
  { key: 'transactionDate',      label: 'Transaction Date' },
  { key: 'ledgerFolio',          label: 'Ledger Folio' },
  { key: 'batchId',              label: 'Batch ID' },
  { key: 'memberName',           label: 'Member Name' }
]

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const adminToken = () => localStorage.getItem('adminToken')

const statusBadge = (trx) => {
  if (trx.status === 'REVERSED')   return <CBadge color="warning"  className="px-2">REVERSED</CBadge>
  if (trx.category === 'REVERSAL') return <CBadge color="secondary" className="px-2">REVERSAL</CBadge>
  if (trx.status === 'COMPLETED')  return <CBadge color="success"  className="px-2">COMPLETED</CBadge>
  if (trx.status === 'PENDING')    return <CBadge color="info"     className="px-2">PENDING</CBadge>
  return <CBadge color="danger" className="px-2">{trx.status}</CBadge>
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CorrectionManager() {
  const [activeTab, setActiveTab] = useState(1)

  // ── Tab 1 state ──
  const [searchFilters, setSearchFilters] = useState({ vendorNo: '', transactionId: '', category: 'ALL', startDate: '', endDate: '' })
  const [results, setResults]       = useState([])
  const [searching, setSearching]   = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [selectedTrx, setSelectedTrx] = useState(null)

  // ── Bulk selection state ──
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Bulk reversal modal
  const [bulkModal, setBulkModal]         = useState(false)
  const [bulkReason, setBulkReason]       = useState('')
  const [bulkPwd, setBulkPwd]             = useState('')
  const [bulking, setBulking]             = useState(false)
  const [bulkResults, setBulkResults]     = useState(null)

  // Reversal modal
  const [reversalModal, setReversalModal]   = useState(false)
  const [reversalReason, setReversalReason] = useState('')
  const [reversalPwd, setReversalPwd]       = useState('')
  const [reversing, setReversing]           = useState(false)
  const [reversalResult, setReversalResult] = useState(null)

  // Edit modal
  const [editModal, setEditModal]     = useState(false)
  const [editChanges, setEditChanges] = useState({})
  const [editReason, setEditReason]   = useState('')
  const [editPwd, setEditPwd]         = useState('')
  const [editing, setEditing]         = useState(false)
  const [editResult, setEditResult]   = useState(null)

  // ── Tab 2 state ──
  const [eventLog, setEventLog]           = useState([])
  const [eventLoading, setEventLoading]   = useState(false)
  const [eventFilters, setEventFilters]   = useState({ eventType: 'ALL', vendorNo: '', adminName: '', startDate: '', endDate: '' })
  const [eventPagination, setEventPagination] = useState({ page: 1, total: 0, totalPages: 1 })

  // ── Fetch Event Log ──────────────────────────────────────────────────────
  const fetchEventLog = useCallback(async (page = 1) => {
    setEventLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 50, ...eventFilters })
      const res = await fetch(`${apiBase}/api/corrections/event-log?${params}`, {
        headers: { Authorization: `Bearer ${adminToken()}` }
      })
      const data = await res.json()
      if (data.success) {
        setEventLog(data.data)
        setEventPagination(data.pagination)
      }
    } catch (e) {
      console.error('EventLog fetch error', e)
    } finally {
      setEventLoading(false)
    }
  }, [eventFilters])

  useEffect(() => { if (activeTab === 2) fetchEventLog(1) }, [activeTab, fetchEventLog])

  // ── Search Transactions ──────────────────────────────────────────────────
  const handleSearch = async () => {
    setSearching(true)
    setSearchError(null)
    setSelectedTrx(null)
    setSelectedIds(new Set()) // Clear selection on new search
    try {
      const params = new URLSearchParams(searchFilters)
      const res = await fetch(`${apiBase}/api/corrections/search?${params}`, {
        headers: { Authorization: `Bearer ${adminToken()}` }
      })
      const data = await res.json()
      if (data.success) setResults(data.data)
      else setSearchError(data.message)
    } catch (e) {
      setSearchError('Could not reach server. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  // ── Bulk selection helpers ──────────────────────────────────────────────
  const actionableResults = results.filter(trx => trx.status !== 'REVERSED' && trx.category !== 'REVERSAL')
  const allSelected = actionableResults.length > 0 && actionableResults.every(trx => selectedIds.has(trx.transactionId))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(actionableResults.map(t => t.transactionId)))
    }
  }

  const toggleSelect = (txId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(txId) ? next.delete(txId) : next.add(txId)
      return next
    })
  }

  // ── Open Bulk modal ─────────────────────────────────────────────────────
  const openBulkModal = () => {
    setBulkReason('')
    setBulkPwd('')
    setBulkResults(null)
    setBulkModal(true)
  }

  // ── Submit Bulk Reversal ────────────────────────────────────────────────
  const submitBulkReversal = async () => {
    if (!bulkReason.trim() || bulkReason.trim().length < 5) return alert('Please provide a reason (min 5 characters).')
    if (!bulkPwd) return alert('Admin password is required.')
    setBulking(true)
    try {
      const res = await fetch(`${apiBase}/api/corrections/bulk-reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
        body: JSON.stringify({ transactionIds: [...selectedIds], reason: bulkReason, adminPassword: bulkPwd })
      })
      const data = await res.json()
      if (data.success) {
        setBulkResults(data)
        setSelectedIds(new Set())
        handleSearch()
      } else {
        alert(data.message || 'Bulk reversal failed.')
      }
    } catch (e) {
      alert('Server error. Please try again.')
    } finally {
      setBulking(false)
    }
  }

  // ── Open Reversal modal ─────────────────────────────────────────────────
  const openReversal = (trx) => {
    setSelectedTrx(trx)
    setReversalReason('')
    setReversalPwd('')
    setReversalResult(null)
    setReversalModal(true)
  }

  // ── Submit Reversal ─────────────────────────────────────────────────────
  const submitReversal = async () => {
    if (!reversalReason.trim() || reversalReason.trim().length < 5) return alert('Please provide a reason (min 5 characters).')
    if (!reversalPwd) return alert('Admin password is required.')
    setReversing(true)
    try {
      const res = await fetch(`${apiBase}/api/corrections/${selectedTrx.transactionId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
        body: JSON.stringify({ reason: reversalReason, adminPassword: reversalPwd })
      })
      const data = await res.json()
      if (data.success) {
        setReversalResult({ success: true, ...data.data, message: data.message })
        handleSearch() // Refresh results
      } else {
        setReversalResult({ success: false, message: data.message })
      }
    } catch (e) {
      setReversalResult({ success: false, message: 'Server error. Please try again.' })
    } finally {
      setReversing(false)
    }
  }

  // ── Open Edit modal ─────────────────────────────────────────────────────
  const openEdit = (trx) => {
    setSelectedTrx(trx)
    setEditChanges({
      description:          trx.description || '',
      paymentMode:          trx.paymentMode || 'CASH',
      transactionReference: trx.transactionReference || '',
      transactionDate:      trx.transactionDate ? trx.transactionDate.split('T')[0] : '',
      ledgerFolio:          trx.ledgerFolio || '',
      batchId:              trx.batchId || '',
      memberName:           trx.memberName || ''
    })
    setEditReason('')
    setEditPwd('')
    setEditResult(null)
    setEditModal(true)
  }

  // ── Submit Edit ─────────────────────────────────────────────────────────
  const submitEdit = async () => {
    if (!editReason.trim() || editReason.trim().length < 5) return alert('Please provide a reason (min 5 characters).')
    if (!editPwd) return alert('Admin password is required.')
    setEditing(true)
    try {
      const res = await fetch(`${apiBase}/api/corrections/${selectedTrx.transactionId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
        body: JSON.stringify({ changes: editChanges, reason: editReason, adminPassword: editPwd })
      })
      const data = await res.json()
      if (data.success) {
        setEditResult({ success: true, message: data.message, fieldChanges: data.data.fieldChanges })
        handleSearch()
      } else {
        setEditResult({ success: false, message: data.message })
      }
    } catch (e) {
      setEditResult({ success: false, message: 'Server error. Please try again.' })
    } finally {
      setEditing(false)
    }
  }

  // ── Export Event Log ────────────────────────────────────────────────────
  const exportLogExcel = () => {
    const rows = eventLog.map(ev => ({
      'Timestamp':      new Date(ev.createdAt).toLocaleString('en-IN'),
      'Event':          ev.eventType,
      'Admin':          ev.performedBy?.adminName,
      'Admin Vendor':   ev.performedBy?.adminVendorNo,
      'IP Address':     ev.ipAddress,
      'Affected Member':ev.affectedMemberName,
      'Vendor No':      ev.affectedVendorNo,
      'Transaction ID': ev.targetTransactionId,
      'Reason':         ev.reason,
      'Balance Before': ev.memberBalanceBefore ?? '—',
      'Balance After':  ev.memberBalanceAfter  ?? '—',
      'Fields Changed': ev.fieldChanges?.map(f => `${f.field}: "${f.oldValue}" → "${f.newValue}"`).join('; ') || '—'
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Event Log')
    XLSX.writeFile(wb, `CorrectionManager_EventLog_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportLogPDF = () => {
    const doc = new jsPDF('landscape')
    doc.setFontSize(14)
    doc.text('Correction Manager — Event Log (Audit Trail)', 14, 15)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 22)
    doc.autoTable({
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [220, 53, 69] },
      head: [['Timestamp', 'Event', 'Admin', 'Vendor No', 'Member', 'Transaction ID', 'Reason', 'Balance Δ']],
      body: eventLog.map(ev => [
        new Date(ev.createdAt).toLocaleString('en-IN'),
        ev.eventType,
        ev.performedBy?.adminName,
        ev.affectedVendorNo,
        ev.affectedMemberName,
        ev.targetTransactionId,
        ev.reason,
        ev.memberBalanceBefore != null
          ? `${fmt(ev.memberBalanceBefore)} → ${fmt(ev.memberBalanceAfter)}`
          : ev.fieldChanges?.length ? `${ev.fieldChanges.length} field(s) changed` : '—'
      ])
    })
    doc.save(`CorrectionManager_EventLog_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="shadow-sm border-0">
          <CCardHeader className="bg-white py-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h4 className="mb-0 fw-bold">Correction Manager</h4>
                <p className="mb-0 text-muted small">Reverse or edit transactions with a full immutable audit trail.</p>
              </div>
              <CBadge color="danger" shape="rounded-pill" className="px-3 py-2">Admin Only</CBadge>
            </div>
          </CCardHeader>

          <CCardBody>
            {/* ── TABS ── */}
            <CNav variant="tabs" className="mb-4">
              <CNavItem>
                <CNavLink active={activeTab === 1} onClick={() => setActiveTab(1)} style={{ cursor: 'pointer' }}>
                  <CIcon icon={cilSearch} className="me-2" />Find &amp; Correct
                </CNavLink>
              </CNavItem>
              <CNavItem>
                <CNavLink active={activeTab === 2} onClick={() => setActiveTab(2)} style={{ cursor: 'pointer' }}>
                  <CIcon icon={cilHistory} className="me-2" />Event Log
                </CNavLink>
              </CNavItem>
            </CNav>

            <CTabContent>
              {/* ═══ TAB 1 — FIND & CORRECT ════════════════════════════════════════ */}
              <CTabPane visible={activeTab === 1}>
                {/* Search Filters */}
                <CCard className="mb-4 border bg-light shadow-none">
                  <CCardBody>
                    <CRow className="g-3 align-items-end">
                      <CCol md={3}>
                        <CFormLabel className="fw-bold small text-muted">Vendor No.</CFormLabel>
                        <CFormInput
                          placeholder="e.g. 1045"
                          value={searchFilters.vendorNo}
                          onChange={e => setSearchFilters({ ...searchFilters, vendorNo: e.target.value })}
                        />
                      </CCol>
                      <CCol md={3}>
                        <CFormLabel className="fw-bold small text-muted">Transaction ID</CFormLabel>
                        <CFormInput
                          placeholder="e.g. SH-1045-20260801"
                          value={searchFilters.transactionId}
                          onChange={e => setSearchFilters({ ...searchFilters, transactionId: e.target.value })}
                        />
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">Category</CFormLabel>
                        <CFormSelect
                          value={searchFilters.category}
                          onChange={e => setSearchFilters({ ...searchFilters, category: e.target.value })}
                        >
                          {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </CFormSelect>
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">From Date</CFormLabel>
                        <CFormInput type="date" value={searchFilters.startDate} onChange={e => setSearchFilters({ ...searchFilters, startDate: e.target.value })} />
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">To Date</CFormLabel>
                        <CFormInput type="date" value={searchFilters.endDate} onChange={e => setSearchFilters({ ...searchFilters, endDate: e.target.value })} />
                      </CCol>
                    </CRow>
                    <div className="mt-3 d-flex gap-2">
                      <CButton color="primary" onClick={handleSearch} disabled={searching}>
                        {searching ? <CSpinner size="sm" /> : <><CIcon icon={cilSearch} className="me-2" />Search Transactions</>}
                      </CButton>
                      <CButton color="secondary" variant="ghost" onClick={() => { setSearchFilters({ vendorNo:'', transactionId:'', category:'ALL', startDate:'', endDate:'' }); setResults([]); setSelectedTrx(null) }}>
                        Clear
                      </CButton>
                    </div>
                  </CCardBody>
                </CCard>

                {searchError && <CAlert color="danger">{searchError}</CAlert>}

                {/* Results Table */}
                {results.length > 0 && (
                  <CTable hover responsive align="middle" className="border mb-0">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell style={{ width: '44px' }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            title={allSelected ? 'Deselect all' : 'Select all reversible'}
                          />
                        </CTableHeaderCell>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell>Vendor No</CTableHeaderCell>
                        <CTableHeaderCell>Member</CTableHeaderCell>
                        <CTableHeaderCell>Category</CTableHeaderCell>
                        <CTableHeaderCell>Folio</CTableHeaderCell>
                        <CTableHeaderCell className="text-end text-danger">Debit</CTableHeaderCell>
                        <CTableHeaderCell className="text-end text-success">Credit</CTableHeaderCell>
                        <CTableHeaderCell>Status</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {results.map(trx => {
                          const isReversed  = trx.status === 'REVERSED'
                          const isReversal  = trx.category === 'REVERSAL'
                          const canAction   = !isReversed && !isReversal
                          const isChecked   = selectedIds.has(trx.transactionId)
                          return (
                            <CTableRow
                              key={trx._id}
                              className={isChecked ? 'table-primary' : isReversed ? 'table-secondary' : isReversal ? 'table-light' : ''}
                            >
                              <CTableDataCell>
                                {canAction && (
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={isChecked}
                                    onChange={() => toggleSelect(trx.transactionId)}
                                  />
                                )}
                              </CTableDataCell>
                            <CTableDataCell className="small text-muted">
                              {fmtDate(trx.transactionDate || trx.createdAt)}
                              <div style={{ fontSize: '0.7rem' }}>{trx.transactionId}</div>
                            </CTableDataCell>
                            <CTableDataCell className="fw-bold">{trx.vendorNo}</CTableDataCell>
                            <CTableDataCell>{trx.memberName || '—'}</CTableDataCell>
                            <CTableDataCell>
                              <CBadge color="secondary" shape="rounded-pill">{trx.category?.replace(/_/g,' ')}</CBadge>
                            </CTableDataCell>
                            <CTableDataCell>{trx.ledgerFolio || '—'}</CTableDataCell>
                            <CTableDataCell className="text-end fw-bold text-danger">
                              {trx.entryType === 'DEBIT' ? fmt(trx.amount) : '—'}
                            </CTableDataCell>
                            <CTableDataCell className="text-end fw-bold text-success">
                              {trx.entryType === 'CREDIT' ? fmt(trx.amount) : '—'}
                            </CTableDataCell>
                            <CTableDataCell>{statusBadge(trx)}</CTableDataCell>
                            <CTableDataCell className="text-center">
                              {canAction ? (
                                <div className="d-flex gap-1 justify-content-center">
                                  <CButton size="sm" color="danger" variant="outline" onClick={() => openReversal(trx)} title="Reverse this transaction">
                                    <CIcon icon={cilLoop} /> Reverse
                                  </CButton>
                                  <CButton size="sm" color="primary" variant="outline" onClick={() => openEdit(trx)} title="Edit safe fields">
                                    <CIcon icon={cilPencil} /> Edit
                                  </CButton>
                                </div>
                              ) : (
                                <span className="text-muted small">{isReversed ? 'Already Reversed' : 'Counter-entry'}</span>
                              )}
                            </CTableDataCell>
                          </CTableRow>
                        )
                      })}
                    </CTableBody>
                  </CTable>
                )}

                {/* Floating Action Bar for Bulk Select */}
                {selectedIds.size > 0 && (
                  <div className="position-fixed bottom-0 start-50 translate-middle-x mb-4 shadow bg-dark text-white rounded-pill px-4 py-2 d-flex align-items-center gap-3" style={{ zIndex: 1050 }}>
                    <span className="fw-bold">{selectedIds.size} transaction(s) selected</span>
                    <div className="vr bg-light"></div>
                    <CButton size="sm" color="danger" onClick={openBulkModal}>
                      <CIcon icon={cilLoop} className="me-2" /> Reverse All Selected
                    </CButton>
                  </div>
                )}

                {results.length === 0 && !searching && !searchError && (
                  <div className="text-center py-5 text-muted">
                    <CIcon icon={cilSearch} size="xl" className="mb-3 d-block mx-auto" />
                    Use the filters above to find a transaction to correct.
                  </div>
                )}
              </CTabPane>

              {/* ═══ TAB 2 — EVENT LOG ═════════════════════════════════════════════ */}
              <CTabPane visible={activeTab === 2}>
                {/* Event Log Filters */}
                <CCard className="mb-4 border bg-light shadow-none">
                  <CCardBody>
                    <CRow className="g-3 align-items-end">
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">Event Type</CFormLabel>
                        <CFormSelect value={eventFilters.eventType} onChange={e => setEventFilters({ ...eventFilters, eventType: e.target.value })}>
                          <option value="ALL">All Events</option>
                          <option value="REVERSAL">Reversals</option>
                          <option value="EDIT">Edits</option>
                          <option value="BULK_UPLOAD">Bulk Uploads</option>
                          <option value="SYSTEM_INIT">System Init</option>
                        </CFormSelect>
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">Vendor No.</CFormLabel>
                        <CFormInput placeholder="Filter by vendor" value={eventFilters.vendorNo} onChange={e => setEventFilters({ ...eventFilters, vendorNo: e.target.value })} />
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">Admin Name</CFormLabel>
                        <CFormInput placeholder="Filter by admin" value={eventFilters.adminName} onChange={e => setEventFilters({ ...eventFilters, adminName: e.target.value })} />
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">From</CFormLabel>
                        <CFormInput type="date" value={eventFilters.startDate} onChange={e => setEventFilters({ ...eventFilters, startDate: e.target.value })} />
                      </CCol>
                      <CCol md={2}>
                        <CFormLabel className="fw-bold small text-muted">To</CFormLabel>
                        <CFormInput type="date" value={eventFilters.endDate} onChange={e => setEventFilters({ ...eventFilters, endDate: e.target.value })} />
                      </CCol>
                      <CCol md={2}>
                        <CButton color="primary" className="w-100" onClick={() => fetchEventLog(1)}>
                          <CIcon icon={cilFilter} className="me-1" /> Apply
                        </CButton>
                      </CCol>
                    </CRow>
                    <div className="mt-3 d-flex gap-2">
                      <CButton size="sm" color="success" className="text-white" onClick={exportLogExcel}>
                        <CIcon icon={cilSpreadsheet} className="me-1" /> Export Excel
                      </CButton>
                      <CButton size="sm" color="danger" className="text-white" onClick={exportLogPDF}>
                        <CIcon icon={cilFile} className="me-1" /> Export PDF
                      </CButton>
                      <CBadge color="dark" className="ms-auto align-self-center px-3 py-2">
                        {eventPagination.total} total events
                      </CBadge>
                    </div>
                  </CCardBody>
                </CCard>

                {eventLoading ? (
                  <div className="text-center py-5"><CSpinner color="danger" /></div>
                ) : (
                  <CTable hover responsive align="middle" className="border mb-0">
                    <CTableHead color="dark">
                      <CTableRow>
                        <CTableHeaderCell>Timestamp</CTableHeaderCell>
                        <CTableHeaderCell>Event</CTableHeaderCell>
                        <CTableHeaderCell>Admin</CTableHeaderCell>
                        <CTableHeaderCell>IP Address</CTableHeaderCell>
                        <CTableHeaderCell>Affected Member</CTableHeaderCell>
                        <CTableHeaderCell>Transaction ID</CTableHeaderCell>
                        <CTableHeaderCell>Details</CTableHeaderCell>
                        <CTableHeaderCell>Reason</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {eventLog.length > 0 ? eventLog.map(ev => (
                        <CTableRow key={ev._id} style={{ borderLeft: `4px solid ${ev.eventType === 'REVERSAL' ? '#dc3545' : ev.eventType === 'EDIT' ? '#0d6efd' : '#6c757d'}` }}>
                          <CTableDataCell className="small text-muted" style={{ whiteSpace: 'nowrap' }}>
                            {new Date(ev.createdAt).toLocaleString('en-IN')}
                          </CTableDataCell>
                          <CTableDataCell>
                            <CBadge
                              color={ev.eventType === 'REVERSAL' ? 'danger' : ev.eventType === 'EDIT' ? 'primary' : 'secondary'}
                              shape="rounded-pill"
                            >
                              {ev.eventType}
                            </CBadge>
                          </CTableDataCell>
                          <CTableDataCell>
                            <div className="fw-bold small">{ev.performedBy?.adminName}</div>
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>{ev.performedBy?.adminVendorNo}</div>
                          </CTableDataCell>
                          <CTableDataCell className="small text-muted">{ev.ipAddress}</CTableDataCell>
                          <CTableDataCell>
                            <div className="fw-semibold">{ev.affectedMemberName || '—'}</div>
                            <div className="text-muted small">{ev.affectedVendorNo}</div>
                          </CTableDataCell>
                          <CTableDataCell>
                            <span className="font-monospace small">{ev.targetTransactionId}</span>
                            {ev.counterEntryTransactionId && (
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                Counter: {ev.counterEntryTransactionId}
                              </div>
                            )}
                          </CTableDataCell>
                          <CTableDataCell style={{ maxWidth: '200px' }}>
                            {ev.eventType === 'REVERSAL' && ev.memberBalanceBefore != null && (
                              <div className="small">
                                Balance: <span className="text-danger">{fmt(ev.memberBalanceBefore)}</span>
                                {' → '}
                                <span className="text-success">{fmt(ev.memberBalanceAfter)}</span>
                              </div>
                            )}
                            {ev.eventType === 'EDIT' && ev.fieldChanges?.length > 0 && (
                              <div className="small">
                                {ev.fieldChanges.map((fc, i) => (
                                  <div key={i} className="text-muted">
                                    <span className="fw-bold">{fc.field}:</span>{' '}
                                    <span className="text-danger text-decoration-line-through">{String(fc.oldValue).substring(0,20)}</span>
                                    {' → '}
                                    <span className="text-success">{String(fc.newValue).substring(0,20)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CTableDataCell>
                          <CTableDataCell className="small" style={{ maxWidth: '180px' }}>
                            <span className="text-muted fst-italic">"{ev.reason}"</span>
                          </CTableDataCell>
                        </CTableRow>
                      )) : (
                        <CTableRow>
                          <CTableDataCell colSpan="8" className="text-center py-5 text-muted">
                            No events recorded yet.
                          </CTableDataCell>
                        </CTableRow>
                      )}
                    </CTableBody>
                  </CTable>
                )}

                {/* Pagination */}
                {eventPagination.totalPages > 1 && (
                  <div className="d-flex justify-content-center gap-2 mt-3">
                    <CButton size="sm" disabled={eventPagination.page <= 1} onClick={() => fetchEventLog(eventPagination.page - 1)}>← Prev</CButton>
                    <span className="align-self-center text-muted small">Page {eventPagination.page} of {eventPagination.totalPages}</span>
                    <CButton size="sm" disabled={eventPagination.page >= eventPagination.totalPages} onClick={() => fetchEventLog(eventPagination.page + 1)}>Next →</CButton>
                  </div>
                )}
              </CTabPane>
            </CTabContent>
          </CCardBody>
        </CCard>
      </CCol>

      {/* ═══ REVERSAL CONFIRMATION MODAL ═════════════════════════════════════ */}
      <CModal visible={reversalModal} onClose={() => { setReversalModal(false); setReversalResult(null) }} alignment="center" size="lg">
        <CModalHeader><CModalTitle className="text-danger"><CIcon icon={cilLoop} className="me-2" />Confirm Transaction Reversal</CModalTitle></CModalHeader>
        <CModalBody>
          {reversalResult ? (
            <CAlert color={reversalResult.success ? 'success' : 'danger'}>
              <strong>{reversalResult.success ? '✓ Reversal Complete' : '✗ Reversal Failed'}</strong>
              <div>{reversalResult.message}</div>
              {reversalResult.success && (
                <div className="mt-2 small">
                  <div>Original: <code>{reversalResult.originalTransactionId}</code></div>
                  <div>Counter-entry: <code>{reversalResult.counterEntryId}</code></div>
                  <div>Balance: {fmt(reversalResult.balanceBefore)} → {fmt(reversalResult.balanceAfter)}</div>
                </div>
              )}
            </CAlert>
          ) : selectedTrx && (
            <>
              <CAlert color="warning" className="mb-3">
                <CIcon icon={cilWarning} className="me-2" />
                <strong>This action cannot be undone.</strong> A counter-entry will be created and this transaction will be permanently marked as REVERSED.
              </CAlert>

              {/* Transaction Card */}
              <CCard className="mb-4 border bg-light shadow-none">
                <CCardBody>
                  <CRow>
                    <CCol md={6}>
                      <div className="small text-muted">Transaction ID</div>
                      <div className="fw-bold font-monospace">{selectedTrx.transactionId}</div>
                    </CCol>
                    <CCol md={6}>
                      <div className="small text-muted">Date</div>
                      <div className="fw-bold">{fmtDate(selectedTrx.transactionDate || selectedTrx.createdAt)}</div>
                    </CCol>
                    <CCol md={6} className="mt-2">
                      <div className="small text-muted">Member</div>
                      <div className="fw-bold">{selectedTrx.memberName} ({selectedTrx.vendorNo})</div>
                    </CCol>
                    <CCol md={6} className="mt-2">
                      <div className="small text-muted">Amount &amp; Type</div>
                      <div className={`fw-bold ${selectedTrx.entryType === 'CREDIT' ? 'text-success' : 'text-danger'}`}>
                        {fmt(selectedTrx.amount)} {selectedTrx.entryType}
                      </div>
                    </CCol>
                    <CCol md={12} className="mt-2">
                      <div className="small text-muted">Description</div>
                      <div>{selectedTrx.description}</div>
                    </CCol>
                  </CRow>
                </CCardBody>
              </CCard>

              <CFormLabel className="fw-bold">Reason for Reversal <span className="text-danger">*</span></CFormLabel>
              <CFormTextarea
                rows={3}
                placeholder="Explain why this transaction is being reversed (min 5 characters)..."
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                className="mb-3"
              />

              <CFormLabel className="fw-bold">Admin Password <span className="text-danger">*</span></CFormLabel>
              <CFormInput
                type="password"
                placeholder="Re-enter your password to confirm"
                value={reversalPwd}
                onChange={e => setReversalPwd(e.target.value)}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => { setReversalModal(false); setReversalResult(null) }}>
            {reversalResult?.success ? 'Close' : 'Cancel'}
          </CButton>
          {!reversalResult && (
            <CButton color="danger" onClick={submitReversal} disabled={reversing}>
              {reversing ? <CSpinner size="sm" /> : <><CIcon icon={cilLoop} className="me-2" />Confirm Reversal</>}
            </CButton>
          )}
        </CModalFooter>
      </CModal>

      {/* ═══ EDIT TRANSACTION MODAL ══════════════════════════════════════════ */}
      <CModal visible={editModal} onClose={() => { setEditModal(false); setEditResult(null) }} alignment="center" size="lg">
        <CModalHeader><CModalTitle className="text-primary"><CIcon icon={cilPencil} className="me-2" />Edit Transaction Details</CModalTitle></CModalHeader>
        <CModalBody>
          {editResult ? (
            <CAlert color={editResult.success ? 'success' : 'danger'}>
              <strong>{editResult.success ? '✓ Update Complete' : '✗ Update Failed'}</strong>
              <div>{editResult.message}</div>
              {editResult.success && editResult.fieldChanges?.map((fc, i) => (
                <div key={i} className="small mt-1">
                  <span className="fw-bold">{fc.field}:</span>{' '}
                  <span className="text-danger text-decoration-line-through">"{fc.oldValue}"</span>
                  {' → '}
                  <span className="text-success">"{fc.newValue}"</span>
                </div>
              ))}
            </CAlert>
          ) : selectedTrx && (
            <>
              <CAlert color="info" className="mb-3">
                Editing <code className="fw-bold">{selectedTrx.transactionId}</code>.
                Only safe metadata fields can be edited. Amount, Entry Type and Category require a <strong>Reversal</strong>.
              </CAlert>

              <CRow className="g-3 mb-3">
                {EDITABLE_FIELDS.map(({ key, label }) => (
                  <CCol key={key} md={key === 'description' ? 12 : 6}>
                    <CFormLabel className="fw-bold small">{label}</CFormLabel>
                    {key === 'paymentMode' ? (
                      <CFormSelect value={editChanges[key] || ''} onChange={e => setEditChanges({ ...editChanges, [key]: e.target.value })}>
                        {['CASH','CHEQUE','BANK_TRANSFER','UPI','INTERNAL_TRANSFER','LOAN_DEDUCTION'].map(m => <option key={m} value={m}>{m}</option>)}
                      </CFormSelect>
                    ) : key === 'transactionDate' ? (
                      <CFormInput type="date" value={editChanges[key] || ''} onChange={e => setEditChanges({ ...editChanges, [key]: e.target.value })} />
                    ) : (
                      <CFormInput
                        value={editChanges[key] || ''}
                        onChange={e => setEditChanges({ ...editChanges, [key]: e.target.value })}
                        placeholder={`Enter ${label}`}
                      />
                    )}
                  </CCol>
                ))}
              </CRow>

              <CAlert color="warning" className="small mb-3">
                <CIcon icon={cilWarning} className="me-1" />
                <strong>Cannot edit:</strong> Amount, Entry Type (CREDIT/DEBIT), Category, Vendor No — these affect account balance. Use <strong>Reversal</strong> for those corrections.
              </CAlert>

              <CFormLabel className="fw-bold">Reason for Edit <span className="text-danger">*</span></CFormLabel>
              <CFormTextarea
                rows={2}
                placeholder="Explain what was corrected and why (min 5 characters)..."
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                className="mb-3"
              />

              <CFormLabel className="fw-bold">Admin Password <span className="text-danger">*</span></CFormLabel>
              <CFormInput
                type="password"
                placeholder="Re-enter your password to confirm"
                value={editPwd}
                onChange={e => setEditPwd(e.target.value)}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => { setEditModal(false); setEditResult(null) }}>
            {editResult?.success ? 'Close' : 'Cancel'}
          </CButton>
          {!editResult && (
            <CButton color="primary" onClick={submitEdit} disabled={editing}>
              {editing ? <CSpinner size="sm" /> : <><CIcon icon={cilCheckCircle} className="me-2" />Save Changes</>}
            </CButton>
          )}
        </CModalFooter>
      </CModal>

      {/* ═══ BULK REVERSAL MODAL ════════════════════════════════════════════ */}
      <CModal visible={bulkModal} onClose={() => { setBulkModal(false); setBulkResults(null) }} alignment="center" size="lg">
        <CModalHeader><CModalTitle className="text-danger"><CIcon icon={cilLoop} className="me-2" />Bulk Transaction Reversal</CModalTitle></CModalHeader>
        <CModalBody>
          {bulkResults ? (
            <div>
              <CAlert color={bulkResults.summary.failed > 0 ? 'warning' : 'success'}>
                <strong>Bulk Operation Complete</strong>
                <div>
                  Processed {bulkResults.summary.total} transactions:<br/>
                  <CBadge color="success" className="me-2">{bulkResults.summary.reversed} Reversed</CBadge>
                  <CBadge color="secondary" className="me-2">{bulkResults.summary.skipped} Skipped</CBadge>
                  <CBadge color="danger">{bulkResults.summary.failed} Failed</CBadge>
                </div>
              </CAlert>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <CTable hover small responsive align="middle">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Tx ID</CTableHeaderCell>
                      <CTableHeaderCell>Status</CTableHeaderCell>
                      <CTableHeaderCell>Details / Reason</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {bulkResults.results.map((res, i) => (
                      <CTableRow key={i}>
                        <CTableDataCell className="font-monospace small">{res.transactionId}</CTableDataCell>
                        <CTableDataCell>
                          <CBadge color={res.status === 'REVERSED' ? 'success' : res.status === 'SKIPPED' ? 'secondary' : 'danger'}>
                            {res.status}
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell className="small">
                          {res.status === 'REVERSED' ? (
                            <>Counter: <code>{res.counterEntryId}</code></>
                          ) : (
                            <span className="text-muted">{res.reason}</span>
                          )}
                        </CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </div>
            </div>
          ) : (
            <>
              <CAlert color="warning" className="mb-3">
                <CIcon icon={cilWarning} className="me-2" />
                <strong>You are about to reverse {selectedIds.size} transactions simultaneously.</strong><br/>
                This action cannot be undone. Each reversal will generate a counter-entry and be logged in the immutable Event Log.
              </CAlert>

              <CFormLabel className="fw-bold">Reason for Bulk Reversal <span className="text-danger">*</span></CFormLabel>
              <CFormTextarea
                rows={3}
                placeholder="Explain why these transactions are being reversed (min 5 characters)..."
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className="mb-3"
              />

              <CFormLabel className="fw-bold">Admin Password <span className="text-danger">*</span></CFormLabel>
              <CFormInput
                type="password"
                placeholder="Re-enter your password to confirm"
                value={bulkPwd}
                onChange={e => setBulkPwd(e.target.value)}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => { setBulkModal(false); setBulkResults(null) }}>
            {bulkResults ? 'Close' : 'Cancel'}
          </CButton>
          {!bulkResults && (
            <CButton color="danger" onClick={submitBulkReversal} disabled={bulking}>
              {bulking ? <CSpinner size="sm" /> : <><CIcon icon={cilLoop} className="me-2" />Reverse {selectedIds.size} Transactions</>}
            </CButton>
          )}
        </CModalFooter>
      </CModal>
    </CRow>
  )
}
