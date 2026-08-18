import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable, CTableHead,
  CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CSpinner, CAlert,
  CFormInput, CInputGroup, CInputGroupText, CFormCheck, CNav, CNavItem,
  CNavLink, CTabContent, CTabPane, CProgress, CProgressBar
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilCheckCircle, cilImage, cilShieldAlt, cilPeople, cilMoney,
  cilTrash, cilPencil, cilSearch, cilX, cilDescription
} from '@coreui/icons'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => {
  const n = Number(v || 0)
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const StatusBadge = ({ status }) => {
  const map = {
    PENDING:           ['warning', 'Pending'],
    PARTIALLY_CLEARED: ['info',    'Partial'],
    COMPLETED:         ['success', 'Completed'],
    CANCELLED:         ['danger',  'Cancelled'],
    CLEARED:           ['success', '✔ Cleared'],
    EXCLUDED:          ['secondary','Excluded'],
  }
  const [color, label] = map[status] || ['secondary', status]
  return <CBadge color={color}>{label}</CBadge>
}

// ─── Edit Member Amount Modal ─────────────────────────────────────────────────
const EditMemberModal = ({ member, batchId, onClose, onSaved, apiBase, token }) => {
  const [rdAmount,         setRd]  = useState(member.rdAmount)
  const [loanPrincipalDue, setPri] = useState(member.loanPrincipalDue)
  const [loanInterestDue,  setInt] = useState(member.loanInterestDue)
  const [remarks,          setRem] = useState(member.remarks || '')
  const [saving, setSaving]        = useState(false)
  const [err, setErr]              = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      const resp = await fetch(`${apiBase}/api/demand/batches/${batchId}/members/${member.vendorNo}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({
          rdAmount:         Number(rdAmount),
          loanPrincipalDue: Number(loanPrincipalDue),
          loanInterestDue:  Number(loanInterestDue),
          remarks
        })
      })
      const data = await resp.json()
      if (resp.ok && data.success) { onSaved(); onClose() }
      else setErr(data.message || 'Failed to update.')
    } catch { setErr('Server error.') }
    finally { setSaving(false) }
  }

  return (
    <CModal visible onClose={onClose} size="md" alignment="center">
      <CModalHeader style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', color: '#fff' }}>
        <CModalTitle className="text-white fw-bold">
          <CIcon icon={cilPencil} className="me-2" />
          Edit: {member.memberName} ({member.vendorNo})
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-4">
        {err && <CAlert color="danger" className="py-2">{err}</CAlert>}
        <div className="mb-3">
          <label className="form-label fw-semibold">RD Monthly (₹)</label>
          <CFormInput type="number" value={rdAmount} min={0} onChange={e => setRd(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Loan Principal Due (₹)</label>
          <CFormInput type="number" value={loanPrincipalDue} min={0} onChange={e => setPri(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Loan Interest Due (₹)</label>
          <CFormInput type="number" value={loanInterestDue} min={0} onChange={e => setInt(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Remarks</label>
          <CFormInput value={remarks} onChange={e => setRem(e.target.value)} placeholder="Optional note..." />
        </div>
        <div className="p-3 rounded bg-light border">
          <strong>New Total: </strong>
          <span className="text-danger fw-bold fs-5">
            {fmt(Number(rdAmount || 0) + Number(loanPrincipalDue || 0) + Number(loanInterestDue || 0))}
          </span>
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="primary" onClick={handleSave} disabled={saving}>
          {saving ? <CSpinner size="sm" /> : '💾 Save Changes'}
        </CButton>
        <CButton color="secondary" variant="outline" onClick={onClose}>Cancel</CButton>
      </CModalFooter>
    </CModal>
  )
}

// ─── Batch Member Breakdown Modal ─────────────────────────────────────────────
const BatchBreakdownModal = ({ batch: initialBatch, onClose, apiBase, token, onBatchUpdated }) => {
  const [batch,        setBatch]    = useState(initialBatch)
  const [loading,      setLoading]  = useState(false)
  const [selected,     setSelected] = useState([])
  const [search,       setSearch]   = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [clearing,     setClearing] = useState(false)
  const [result,       setResult]   = useState(null)
  const [error,        setError]    = useState('')

  const refreshBatch = useCallback(async () => {
    const resp = await fetch(`${apiBase}/api/demand/batches/${batch.batchId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await resp.json()
    if (data.success) { setBatch(data.data); onBatchUpdated && onBatchUpdated(data.data) }
  }, [apiBase, batch.batchId, token, onBatchUpdated])

  const pendingMembers = useMemo(() =>
    batch.members.filter(m => m.status === 'PENDING'), [batch.members])
  const clearedMembers = useMemo(() =>
    batch.members.filter(m => m.status === 'CLEARED'), [batch.members])
  const excludedMembers = useMemo(() =>
    batch.members.filter(m => m.status === 'EXCLUDED'), [batch.members])

  const filteredPending = useMemo(() =>
    pendingMembers.filter(m =>
      !search ||
      m.memberName.toLowerCase().includes(search.toLowerCase()) ||
      m.vendorNo.toLowerCase().includes(search.toLowerCase())
    ), [pendingMembers, search])

  const selectedTotal = useMemo(() =>
    filteredPending
      .filter(m => selected.includes(m.vendorNo))
      .reduce((s, m) => s + m.totalDeduction, 0)
  , [filteredPending, selected])

  const toggleSelect = (vendorNo) => {
    setSelected(prev => prev.includes(vendorNo) ? prev.filter(v => v !== vendorNo) : [...prev, vendorNo])
  }

  const toggleSelectAll = () => {
    const pendingIds = filteredPending.map(m => m.vendorNo)
    const allSelected = pendingIds.every(id => selected.includes(id))
    setSelected(allSelected ? selected.filter(id => !pendingIds.includes(id)) : [...new Set([...selected, ...pendingIds])])
  }

  const handleExclude = async (vendorNo) => {
    if (!window.confirm(`Exclude ${vendorNo} from this batch?`)) return
    const resp = await fetch(`${apiBase}/api/demand/batches/${batch.batchId}/members/${vendorNo}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await resp.json()
    if (data.success) { await refreshBatch(); setSelected(sel => sel.filter(v => v !== vendorNo)) }
    else alert(data.message || 'Failed to exclude.')
  }

  const handleClearSelected = async () => {
    if (selected.length === 0) { alert('No members selected.'); return }
    if (!window.confirm(
      `Clear ${selected.length} member(s) for ₹${selectedTotal.toFixed(2)}?\n\nThis will post individual credit entries to the Master Journal Ledger (Folios 152, 153, 154).`
    )) return

    setClearing(true); setError(''); setResult(null)
    try {
      const resp = await fetch(`${apiBase}/api/demand/batches/${batch.batchId}/clear`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ vendorNos: selected })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setResult(data)
        setSelected([])
        await refreshBatch()
        onBatchUpdated && onBatchUpdated()
      } else {
        setError(data.message || 'Clearance failed.')
      }
    } catch { setError('Server error during clearance.') }
    finally { setClearing(false) }
  }

  const pendingCount  = pendingMembers.length
  const clearedCount  = clearedMembers.length
  const totalMembers  = batch.members.filter(m => m.status !== 'EXCLUDED').length
  const progress      = totalMembers > 0 ? Math.round((clearedCount / totalMembers) * 100) : 0

  return (
    <CModal visible onClose={onClose} size="xl" alignment="center" scrollable>
      <CModalHeader
        className="py-3"
        style={{ background: 'linear-gradient(135deg,#1e1e2f,#2d2b55)', color: '#fff' }}
      >
        <CModalTitle className="text-white fw-bold d-flex align-items-center gap-2 flex-wrap">
          <CIcon icon={cilPeople} />
          {batch.batchId}
          <span className="fw-normal opacity-75 small ms-2">
            {batch.purpose} — {batch.month} {batch.year}
          </span>
          <StatusBadge status={batch.status} />
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-0">

        {/* ── Batch Summary Header ── */}
        <div className="px-4 pt-3 pb-2 border-bottom" style={{ background: '#f8f9ff' }}>
          <div className="d-flex flex-wrap gap-3 mb-3">
            {[
              { label: 'Total Members', value: totalMembers, color: '#4361ee' },
              { label: 'Total RD',      value: fmt(batch.totalRDAmount), color: '#3a86ff' },
              { label: 'Total Loan (P+I)', value: fmt(batch.totalLoanAmount), color: '#0096c7' },
              { label: 'Grand Total',   value: fmt(batch.grandTotalAmount), color: '#f72585', big: true },
              { label: '✔ Cleared',    value: fmt(batch.clearedTotalAmount), color: '#06d6a0' },
              { label: '⏳ Uncleared', value: fmt(batch.unclearedTotalAmount), color: '#e76f51' },
            ].map(({ label, value, color, big }) => (
              <div key={label} className="border rounded px-3 py-2 text-center" style={{ minWidth: 120 }}>
                <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: big ? 18 : 15 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="d-flex justify-content-between mb-1">
              <small className="text-muted">Clearance Progress</small>
              <small className="fw-semibold">{clearedCount}/{totalMembers} cleared ({progress}%)</small>
            </div>
            <CProgress style={{ height: 10, borderRadius: 8 }}>
              <CProgressBar
                value={progress}
                style={{
                  background: 'linear-gradient(90deg,#06d6a0,#4361ee)',
                  transition: 'width 0.5s ease'
                }}
              />
            </CProgress>
          </div>
        </div>

        {/* ── Result / Error ── */}
        {result && (
          <div className="px-4 pt-3">
            <CAlert color="success" dismissible onClose={() => setResult(null)}>
              <strong>✔ Cleared!</strong> {result.message}
              <div className="mt-2 small">
                Batch status: <StatusBadge status={result.data?.batchStatus} />
                {' '}| Cleared: <strong>{result.data?.clearedCount}</strong>
                {' '}| Uncleared: <strong>{result.data?.unclearedCount}</strong>
                {result.data?.memoTransactionId && (
                  <span> | BRS Memo: <code>{result.data.memoTransactionId}</code></span>
                )}
              </div>
            </CAlert>
          </div>
        )}
        {error && (
          <div className="px-4 pt-3">
            <CAlert color="danger" dismissible onClose={() => setError('')}>{error}</CAlert>
          </div>
        )}

        {/* ── Pending Members Table ── */}
        <div className="p-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h6 className="fw-bold mb-0">
              ⏳ Pending Members
              <CBadge color="warning" className="ms-2">{pendingMembers.length}</CBadge>
            </h6>
            <CInputGroup size="sm" style={{ maxWidth: 280 }}>
              <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
              <CFormInput
                placeholder="Search vendor no. or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <CButton color="secondary" variant="outline" onClick={() => setSearch('')}>
                  <CIcon icon={cilX} />
                </CButton>
              )}
            </CInputGroup>
          </div>

          {filteredPending.length > 0 ? (
            <div className="table-responsive rounded border">
              <CTable hover align="middle" className="mb-0">
                <CTableHead style={{ background: '#f0f4ff' }}>
                  <CTableRow>
                    <CTableHeaderCell style={{ width: 48 }}>
                      <CFormCheck
                        checked={filteredPending.length > 0 && filteredPending.every(m => selected.includes(m.vendorNo))}
                        onChange={toggleSelectAll}
                        id="selectAll"
                      />
                    </CTableHeaderCell>
                    <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                    <CTableHeaderCell>Member Name</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">RD (₹)</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Principal (₹)</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Interest (₹)</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Total (₹)</CTableHeaderCell>
                    <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {filteredPending.map(m => (
                    <CTableRow
                      key={m.vendorNo}
                      style={{
                        background: selected.includes(m.vendorNo)
                          ? 'rgba(67,97,238,0.07)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                    >
                      <CTableDataCell>
                        <CFormCheck
                          checked={selected.includes(m.vendorNo)}
                          onChange={() => toggleSelect(m.vendorNo)}
                          id={`chk-${m.vendorNo}`}
                        />
                      </CTableDataCell>
                      <CTableDataCell className="fw-bold text-primary">{m.vendorNo}</CTableDataCell>
                      <CTableDataCell>{m.memberName}</CTableDataCell>
                      <CTableDataCell className="text-end text-muted">{fmt(m.rdAmount)}</CTableDataCell>
                      <CTableDataCell className="text-end text-info">{fmt(m.loanPrincipalDue)}</CTableDataCell>
                      <CTableDataCell className="text-end text-warning">{fmt(m.loanInterestDue)}</CTableDataCell>
                      <CTableDataCell className="text-end fw-bold text-danger">{fmt(m.totalDeduction)}</CTableDataCell>
                      <CTableDataCell className="text-center">
                        <div className="d-flex gap-1 justify-content-center">
                          <CButton
                            color="success" size="sm" className="text-white px-2"
                            title="Quick Clear"
                            onClick={() => { setSelected([m.vendorNo]); handleClearSelected() }}
                            disabled={clearing}
                          >
                            <CIcon icon={cilCheckCircle} />
                          </CButton>
                          <CButton
                            color="info" size="sm" className="text-white px-2"
                            title="Edit Amounts"
                            onClick={() => setEditingMember(m)}
                          >
                            <CIcon icon={cilPencil} />
                          </CButton>
                          <CButton
                            color="danger" size="sm" className="text-white px-2"
                            title="Exclude from Batch"
                            onClick={() => handleExclude(m.vendorNo)}
                          >
                            <CIcon icon={cilTrash} />
                          </CButton>
                        </div>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
          ) : (
            <div className="text-center py-5 text-muted">
              {search ? 'No members match your search.' : '✔ All pending members have been cleared or excluded.'}
            </div>
          )}

          {/* ── Cleared Members (Collapsed view) ── */}
          {clearedMembers.length > 0 && (
            <div className="mt-4">
              <h6 className="fw-bold mb-3">
                <CIcon icon={cilCheckCircle} className="me-2 text-success" />
                Cleared Members
                <CBadge color="success" className="ms-2">{clearedMembers.length}</CBadge>
              </h6>
              <div className="table-responsive rounded border">
                <CTable small align="middle" className="mb-0">
                  <CTableHead style={{ background: '#f0fff8' }}>
                    <CTableRow>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Member Name</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">RD (₹)</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Loan (₹)</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Total (₹)</CTableHeaderCell>
                      <CTableHeaderCell>Cleared At</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {clearedMembers.map(m => (
                      <CTableRow key={m.vendorNo} style={{ background: 'rgba(6,214,160,0.05)' }}>
                        <CTableDataCell className="fw-bold text-success">{m.vendorNo}</CTableDataCell>
                        <CTableDataCell>{m.memberName}</CTableDataCell>
                        <CTableDataCell className="text-end text-muted">{fmt(m.rdAmount)}</CTableDataCell>
                        <CTableDataCell className="text-end">{fmt(m.loanTotalDue)}</CTableDataCell>
                        <CTableDataCell className="text-end fw-bold">{fmt(m.totalDeduction)}</CTableDataCell>
                        <CTableDataCell className="small text-muted">
                          {m.clearedAt ? new Date(m.clearedAt).toLocaleString('en-IN') : '—'}
                        </CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </div>
            </div>
          )}
        </div>
      </CModalBody>

      {/* ── Sticky Footer Action Bar ── */}
      <CModalFooter
        className="border-top py-3 px-4"
        style={{ background: selected.length > 0 ? 'linear-gradient(135deg,#f0f4ff,#faf0ff)' : '#fff' }}
      >
        <div className="d-flex align-items-center gap-3 flex-wrap w-100">
          <div className="me-auto">
            {selected.length > 0 ? (
              <div className="fw-semibold">
                <span className="text-primary">{selected.length} member(s) selected</span>
                <span className="mx-2 text-muted">|</span>
                <span className="text-danger fw-bold">{fmt(selectedTotal)} to clear</span>
              </div>
            ) : (
              <span className="text-muted small">
                Select members to clear → Post individual entries to Master Journal Ledger
              </span>
            )}
          </div>
          <CButton
            className="text-white fw-bold px-4"
            style={{
              background: selected.length > 0
                ? 'linear-gradient(135deg,#06d6a0,#0096c7)'
                : 'linear-gradient(135deg,#aaa,#888)',
              border: 'none',
              opacity: selected.length > 0 ? 1 : 0.6
            }}
            disabled={clearing || selected.length === 0}
            onClick={handleClearSelected}
          >
            {clearing
              ? <><CSpinner size="sm" className="me-2" />Posting to Ledger...</>
              : <><CIcon icon={cilCheckCircle} className="me-2" />Clear Selected & Post to Journal</>
            }
          </CButton>
          <CButton color="secondary" variant="outline" onClick={onClose}>Close</CButton>
        </div>
      </CModalFooter>

      {/* ── Edit Member Modal (nested) ── */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          batchId={batch.batchId}
          apiBase={apiBase}
          token={token}
          onClose={() => setEditingMember(null)}
          onSaved={refreshBatch}
        />
      )}
    </CModal>
  )
}

// ─── Main Financial Clearance Dashboard ──────────────────────────────────────
const AdminClearanceDashboard = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'
  const token   = localStorage.getItem('adminToken') || localStorage.getItem('token')

  const [activeTab,        setActiveTab]        = useState('payroll')
  const [pendingTxns,      setPendingTxns]      = useState([])
  const [demandBatches,    setDemandBatches]    = useState([])
  const [loadingTxns,      setLoadingTxns]      = useState(true)
  const [loadingBatches,   setLoadingBatches]   = useState(true)
  const [isProcessing,     setIsProcessing]     = useState(false)
  const [docModalVisible,  setDocModalVisible]  = useState(false)
  const [activeDocUrl,     setActiveDocUrl]     = useState('')
  const [activeBatch,      setActiveBatch]      = useState(null) // batch breakdown modal

  // ── Fetch pending individual transactions ──
  const fetchPendingClearances = async () => {
    setLoadingTxns(true)
    try {
      const resp = await fetch(`${apiBase}/api/loans/pending-transactions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (resp.ok) {
        const data = await resp.json()
        // Filter out BRS memo entries from individual clearance list
        const filtered = (data.data || []).filter(tx => !tx.isMemoEntry)
        setPendingTxns(filtered)
      }
    } catch (e) { console.error('fetchPendingClearances:', e) }
    finally { setLoadingTxns(false) }
  }

  // ── Fetch demand batches ──
  const fetchDemandBatches = async () => {
    setLoadingBatches(true)
    try {
      const resp = await fetch(`${apiBase}/api/demand/batches`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (resp.ok) {
        const data = await resp.json()
        setDemandBatches(data.data || [])
      }
    } catch (e) { console.error('fetchDemandBatches:', e) }
    finally { setLoadingBatches(false) }
  }

  useEffect(() => {
    fetchPendingClearances()
    fetchDemandBatches()
  }, [])

  // ── Open batch breakdown ──
  const openBatch = async (batchId) => {
    const resp = await fetch(`${apiBase}/api/demand/batches/${batchId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await resp.json()
    if (data.success) setActiveBatch(data.data)
    else alert(data.message || 'Failed to load batch.')
  }

  // ── Approve individual transaction ──
  const approveTransaction = async (transactionId) => {
    if (!window.confirm('Confirm this payment has cleared the bank? This will officially lock the entry in the ledger.')) return
    setIsProcessing(true)
    try {
      const resp = await fetch(`${apiBase}/api/loans/approve-transaction/${transactionId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (resp.ok) {
        const data = await resp.json()
        alert(`Cleared! ${data.loanClosed ? '(Loan fully closed)' : ''}`)
        setPendingTxns(prev => prev.filter(tx => tx.transactionId !== transactionId))
      } else alert('Failed to approve.')
    } catch (e) { alert('Server error.') }
    finally { setIsProcessing(false) }
  }

  // ── Reject individual transaction ──
  const rejectTransaction = async (transactionId) => {
    const reason = window.prompt('Reason for rejection:')
    if (reason === null) return
    setIsProcessing(true)
    try {
      const resp = await fetch(`${apiBase}/api/loans/reject-transaction/${transactionId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ reason })
      })
      if (resp.ok) {
        alert('Rejected.')
        setPendingTxns(prev => prev.filter(tx => tx.transactionId !== transactionId))
      } else alert('Failed to reject.')
    } catch { alert('Server error.') }
    finally { setIsProcessing(false) }
  }

  const totalUnclearedBatchAmount = useMemo(() =>
    demandBatches.filter(b => b.status !== 'COMPLETED').reduce((s, b) => s + (b.unclearedTotalAmount || 0), 0)
  , [demandBatches])

  return (
    <>
      <CRow>
        <CCol xs={12}>
          <CCard className="shadow border-top-3" style={{ borderTopColor: '#f72585' }}>
            <CCardHeader className="py-3 d-flex justify-content-between align-items-center bg-white flex-wrap gap-2">
              <h4 className="mb-0 d-flex align-items-center gap-2 fw-bold text-dark">
                <CIcon icon={cilShieldAlt} style={{ color: '#f72585' }} size="lg" />
                Maker-Checker: Financial Clearances
              </h4>
              <div className="d-flex gap-2 align-items-center">
                {activeTab === 'payroll' ? (
                  <CBadge color="warning" shape="rounded-pill" className="fs-6">
                    {demandBatches.filter(b => b.status !== 'COMPLETED').length} Active Batch(es)
                  </CBadge>
                ) : (
                  <CBadge color="danger" shape="rounded-pill" className="fs-6">
                    {pendingTxns.length} Pending
                  </CBadge>
                )}
              </div>
            </CCardHeader>

            {/* ── Tabs ── */}
            <div className="px-4 pt-3 border-bottom">
              <CNav variant="tabs">
                <CNavItem>
                  <CNavLink
                    active={activeTab === 'payroll'}
                    onClick={() => setActiveTab('payroll')}
                    className="fw-semibold"
                    style={{ cursor: 'pointer', color: activeTab === 'payroll' ? '#4361ee' : undefined }}
                  >
                    💼 Payroll Demand Batches
                    {demandBatches.filter(b => b.status !== 'COMPLETED').length > 0 && (
                      <CBadge color="warning" className="ms-2">
                        {demandBatches.filter(b => b.status !== 'COMPLETED').length}
                      </CBadge>
                    )}
                  </CNavLink>
                </CNavItem>
                <CNavItem>
                  <CNavLink
                    active={activeTab === 'individual'}
                    onClick={() => setActiveTab('individual')}
                    className="fw-semibold"
                    style={{ cursor: 'pointer', color: activeTab === 'individual' ? '#4361ee' : undefined }}
                  >
                    🧾 Individual Clearances
                    {pendingTxns.length > 0 && (
                      <CBadge color="danger" className="ms-2">{pendingTxns.length}</CBadge>
                    )}
                  </CNavLink>
                </CNavItem>
              </CNav>
            </div>

            <CCardBody className="p-4">
              {/* ════════════════ TAB 1: PAYROLL DEMAND BATCHES ════════════════ */}
              {activeTab === 'payroll' && (
                <>
                  {totalUnclearedBatchAmount > 0 && (
                    <CAlert color="warning" className="py-2 mb-3">
                      <strong>⚠ Uncleared Payroll Amount: </strong>{fmt(totalUnclearedBatchAmount)}
                      &nbsp;— These entries remain in BRS as unmatched until fully cleared by admin.
                    </CAlert>
                  )}

                  {loadingBatches ? (
                    <div className="text-center py-5"><CSpinner color="primary" /></div>
                  ) : demandBatches.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <div style={{ fontSize: 48 }}>📋</div>
                      <h5 className="mt-3">No demand batches found.</h5>
                      <p>Generate a demand sheet from the Demand Sheet (Payroll) page and click "Transfer to Clearance".</p>
                      <a href="#/accounting/demand-sheet" className="btn btn-outline-primary btn-sm">
                        Open Demand Sheet →
                      </a>
                    </div>
                  ) : (
                    <div className="table-responsive rounded border shadow-sm">
                      <CTable hover align="middle" className="mb-0">
                        <CTableHead style={{ background: 'linear-gradient(135deg,#1e1e2f,#2d2b55)', color: '#fff' }}>
                          <CTableRow>
                            <CTableHeaderCell className="text-white py-3">Batch ID / Number</CTableHeaderCell>
                            <CTableHeaderCell className="text-white">Purpose & Month</CTableHeaderCell>
                            <CTableHeaderCell className="text-white">Created On</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-center">Employees</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-end">Total RD</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-end">Total Loan (P+I)</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-end">Grand Total</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-center">Progress</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-end">Uncleared</CTableHeaderCell>
                            <CTableHeaderCell className="text-white text-center">Action</CTableHeaderCell>
                          </CTableRow>
                        </CTableHead>
                        <CTableBody>
                          {demandBatches.map(b => (
                            <CTableRow key={b.batchId}>
                              <CTableDataCell>
                                <button
                                  className="btn btn-link p-0 fw-bold text-primary text-decoration-none"
                                  onClick={() => openBatch(b.batchId)}
                                  style={{ fontSize: 13 }}
                                >
                                  <code>{b.batchId}</code>
                                </button>
                              </CTableDataCell>
                              <CTableDataCell>
                                <div className="fw-semibold">{b.purpose}</div>
                                <div className="text-muted small">{b.month} {b.year} | FY {b.financialYear}</div>
                              </CTableDataCell>
                              <CTableDataCell className="small text-muted">
                                {new Date(b.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                              </CTableDataCell>
                              <CTableDataCell className="text-center fw-bold">{b.totalMembers}</CTableDataCell>
                              <CTableDataCell className="text-end text-primary fw-semibold">
                                {fmt(b.totalRDAmount)}
                              </CTableDataCell>
                              <CTableDataCell className="text-end text-info fw-semibold">
                                {fmt(b.totalLoanAmount)}
                              </CTableDataCell>
                              <CTableDataCell className="text-end fw-bold text-danger" style={{ fontSize: 15 }}>
                                {fmt(b.grandTotalAmount)}
                              </CTableDataCell>
                              <CTableDataCell className="text-center" style={{ minWidth: 140 }}>
                                <div className="mb-1">
                                  <StatusBadge status={b.status} />
                                </div>
                                <div className="small text-muted">
                                  {b.clearedCount}/{b.totalMembers} cleared
                                </div>
                                <CProgress style={{ height: 6, borderRadius: 4 }}>
                                  <CProgressBar
                                    value={b.totalMembers > 0 ? Math.round((b.clearedCount / b.totalMembers) * 100) : 0}
                                    style={{ background: 'linear-gradient(90deg,#06d6a0,#4361ee)' }}
                                  />
                                </CProgress>
                              </CTableDataCell>
                              <CTableDataCell className="text-end fw-bold" style={{ color: b.unclearedTotalAmount > 0 ? '#e76f51' : '#06d6a0' }}>
                                {fmt(b.unclearedTotalAmount)}
                              </CTableDataCell>
                              <CTableDataCell className="text-center">
                                <CButton
                                  size="sm"
                                  className="text-white fw-bold"
                                  style={{
                                    background: b.status === 'COMPLETED'
                                      ? 'linear-gradient(135deg,#06d6a0,#0096c7)'
                                      : 'linear-gradient(135deg,#4361ee,#7209b7)',
                                    border: 'none'
                                  }}
                                  onClick={() => openBatch(b.batchId)}
                                >
                                  {b.status === 'COMPLETED' ? '📋 View' : '⚡ View & Clear'}
                                </CButton>
                              </CTableDataCell>
                            </CTableRow>
                          ))}
                        </CTableBody>
                      </CTable>
                    </div>
                  )}
                </>
              )}

              {/* ════════════════ TAB 2: INDIVIDUAL CLEARANCES ════════════════ */}
              {activeTab === 'individual' && (
                loadingTxns ? (
                  <div className="text-center py-5"><CSpinner color="primary" /></div>
                ) : pendingTxns.length === 0 ? (
                  <div className="text-center py-5 text-medium-emphasis">
                    <h5>No pending individual transactions awaiting clearance.</h5>
                    <p>All member payments have been processed and reconciled.</p>
                  </div>
                ) : (
                  <CTable hover responsive align="middle" className="border rounded">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Date Submitted</CTableHeaderCell>
                        <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                        <CTableHeaderCell>Member Name</CTableHeaderCell>
                        <CTableHeaderCell>Payment Mode</CTableHeaderCell>
                        <CTableHeaderCell>Ref / Cheque No.</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Amount</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Verification</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {pendingTxns.map(tx => (
                        <CTableRow key={tx.transactionId}>
                          <CTableDataCell>{new Date(tx.transactionDate).toLocaleDateString('en-IN')}</CTableDataCell>
                          <CTableDataCell><strong>{tx.vendorNo || tx.memberId?.vendorNo}</strong></CTableDataCell>
                          <CTableDataCell>{tx.memberId?.name || 'Member'}</CTableDataCell>
                          <CTableDataCell><CBadge color="secondary">{tx.paymentMode}</CBadge></CTableDataCell>
                          <CTableDataCell><code>{tx.referenceNumber}</code></CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-primary">
                            ₹{tx.amount?.toLocaleString('en-IN')}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            {tx.documentProofUrl ? (
                              <CButton color="info" variant="ghost" size="sm"
                                onClick={() => { setActiveDocUrl(tx.documentProofUrl); setDocModalVisible(true) }}>
                                <CIcon icon={cilImage} className="me-1" /> View Doc
                              </CButton>
                            ) : <span className="text-muted small">No File</span>}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            <div className="d-flex justify-content-center gap-2">
                              <CButton color="success" size="sm" className="text-white fw-bold"
                                onClick={() => approveTransaction(tx.transactionId)} disabled={isProcessing}>
                                <CIcon icon={cilCheckCircle} className="me-1" /> Clear
                              </CButton>
                              <CButton color="danger" size="sm" className="text-white fw-bold"
                                onClick={() => rejectTransaction(tx.transactionId)} disabled={isProcessing}>
                                Reject
                              </CButton>
                            </div>
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                )
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* ── Document Viewer Modal ── */}
      <CModal visible={docModalVisible} onClose={() => setDocModalVisible(false)} size="lg" alignment="center">
        <CModalHeader><CModalTitle>Payment Proof Document</CModalTitle></CModalHeader>
        <CModalBody className="text-center bg-light">
          {activeDocUrl && (
            <img src={activeDocUrl} alt="Document Proof" className="img-fluid border shadow-sm rounded" style={{ maxHeight: 600 }} />
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setDocModalVisible(false)}>Close</CButton>
        </CModalFooter>
      </CModal>

      {/* ── Batch Member Breakdown Modal ── */}
      {activeBatch && (
        <BatchBreakdownModal
          batch={activeBatch}
          apiBase={apiBase}
          token={token}
          onClose={() => { setActiveBatch(null); fetchDemandBatches() }}
          onBatchUpdated={fetchDemandBatches}
        />
      )}
    </>
  )
}

export default AdminClearanceDashboard
