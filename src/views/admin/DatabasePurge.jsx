import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton,
  CFormCheck, CFormSelect, CFormInput, CModal, CModalHeader,
  CModalTitle, CModalBody, CModalFooter, CAlert, CSpinner, CBadge,
  CNav, CNavItem, CNavLink, CInputGroup, CInputGroupText,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilWarning, cilTrash, cilCheckCircle, cilUser,
  cilSearch, cilCreditCard, cilSpreadsheet, cilShieldAlt,
  cilPeople, cilBan,
} from '@coreui/icons'

const apiBase =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:5000'

// Safety countdown before Confirm button becomes active (seconds)
const CONFIRM_COUNTDOWN = 3

const COLLECTION_LABELS = {
  TRANSACTIONS: 'Master Journal & Transaction Logs',
  LOANS:        'Loan Applications & Active Accounts',
  USERS:        'Test Members & Directory',
}

const MEMBER_PURGE_OPTIONS = [
  {
    id: 'TRANSACTIONS',
    title: 'Wipe Transactions & Journal Logs Only',
    desc: 'Deletes all share deposits, RD installments, and EMI transaction logs for this member. Preserves member account and loan records.',
    icon: cilSpreadsheet,
    badgeColor: 'warning',
  },
  {
    id: 'LOANS',
    title: 'Wipe Loan Records & Applications Only',
    desc: 'Deletes all active loans, pending applications, and loan ledger history for this member. Preserves user profile and share records.',
    icon: cilCreditCard,
    badgeColor: 'warning',
  },
  {
    id: 'PROFILE',
    title: 'Complete Profile & All Associated Data (Hard Delete)',
    desc: 'Permanently deletes the member account, all transaction history, loan records, passbook entries, and KYC data.',
    icon: cilTrash,
    badgeColor: 'danger',
    isDestructive: true,
  },
]

// ============================================================
const DatabasePurge = () => {
  // Purge Scope: 'GLOBAL' | 'MEMBER'
  const [purgeScope, setPurgeScope] = useState('GLOBAL')

  // Global Purge State
  const [collections, setCollections] = useState({
    TRANSACTIONS: false,
    LOANS:        false,
    USERS:        false,
  })

  // Member Purge State
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [allMembersList, setAllMembersList]       = useState([])
  const [filteredMembers, setFilteredMembers]     = useState([])
  const [selectedMember, setSelectedMember]       = useState(null)
  const [memberStats, setMemberStats]             = useState(null)
  const [isLoadingMemberStats, setIsLoadingMemberStats] = useState(false)
  const [memberPurgeChoice, setMemberPurgeChoice] = useState('TRANSACTIONS') // 'TRANSACTIONS' | 'LOANS' | 'PROFILE'

  // Date filter State
  const [dateCondition, setDateCondition] = useState('ALL')
  const [startDateTime, setStartDateTime]  = useState('')
  const [endDateTime, setEndDateTime]      = useState('')

  // Modal & Security State
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [adminPassword, setAdminPassword]       = useState('')
  const [isDeleting, setIsDeleting]             = useState(false)
  const [resultMsg, setResultMsg]               = useState(null)
  const [resultDetails, setResultDetails]       = useState(null)
  const [errorMsg, setErrorMsg]                 = useState(null)

  // Safety countdown
  const [countdown, setCountdown] = useState(CONFIRM_COUNTDOWN)
  const [countdownActive, setCountdownActive] = useState(false)

  // Load all members for member search autocomplete
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('adminToken')
        const res = await fetch(`${apiBase}/api/members`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setAllMembersList(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.warn('Could not pre-load members list:', err)
      }
    }
    fetchMembers()
  }, [])

  // Filter members when search query changes
  useEffect(() => {
    if (!memberSearchQuery.trim()) {
      setFilteredMembers([])
      return
    }
    const q = memberSearchQuery.toLowerCase()
    const matches = allMembersList.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.vendorNo || '').toLowerCase().includes(q) ||
        (m.societyAccountNo || '').toLowerCase().includes(q) ||
        (m.phoneNumber || '').includes(q)
    )
    setFilteredMembers(matches.slice(0, 8))
  }, [memberSearchQuery, allMembersList])

  // Fetch live stats when a member is selected
  const selectMember = useCallback(async (member) => {
    setSelectedMember(member)
    setMemberSearchQuery(`${member.name} (${member.vendorNo})`)
    setFilteredMembers([])
    setIsLoadingMemberStats(true)
    setErrorMsg(null)

    try {
      const token = localStorage.getItem('adminToken')
      const res = await fetch(`${apiBase}/api/auth/member-purge-stats/${member._id || member.vendorNo}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMemberStats(data)
      } else {
        setMemberStats({
          member,
          transactionsCount: 0,
          loansCount: 0,
        })
      }
    } catch (err) {
      console.warn('Failed to load member purge stats:', err)
      setMemberStats({ member, transactionsCount: 0, loansCount: 0 })
    } finally {
      setIsLoadingMemberStats(false)
    }
  }, [])

  // ---- Derived values ----
  const selectedGlobalKeys = useMemo(
    () => Object.keys(collections).filter((k) => collections[k]),
    [collections],
  )
  const hasGlobalSelection = selectedGlobalKeys.length > 0
  const allGlobalSelected  = selectedGlobalKeys.length === Object.keys(collections).length

  // ---- Countdown timer (starts when modal opens) ----
  useEffect(() => {
    if (!showConfirmModal) return
    setCountdown(CONFIRM_COUNTDOWN)
    setCountdownActive(true)
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); setCountdownActive(false); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [showConfirmModal])

  // ---- Handlers ----
  const handleCheckboxChange = useCallback((e) => {
    setCollections((prev) => ({ ...prev, [e.target.name]: e.target.checked }))
  }, [])

  const handleSelectAll = useCallback(() => {
    const newValue = !allGlobalSelected
    setCollections({ TRANSACTIONS: newValue, LOANS: newValue, USERS: newValue })
  }, [allGlobalSelected])

  const handleCloseModal = useCallback(() => {
    setShowConfirmModal(false)
    setAdminPassword('')
    setErrorMsg(null)
  }, [])

  const triggerConfirmation = useCallback(() => {
    setErrorMsg(null)
    setResultMsg(null)

    if (purgeScope === 'GLOBAL') {
      if (!hasGlobalSelection) {
        setErrorMsg('Please select at least one data category to delete.')
        return
      }
    } else {
      if (!selectedMember) {
        setErrorMsg('Please select a member user to purge data for.')
        return
      }
      if (selectedMember.role === 'admin') {
        setErrorMsg('Admin accounts are strictly protected and cannot be deleted or purged.')
        return
      }
    }

    if (dateCondition === 'BEFORE' || dateCondition === 'AFTER') {
      if (!startDateTime) {
        setErrorMsg('Please select a target Date & Time.')
        return
      }
    } else if (dateCondition === 'BETWEEN') {
      if (!startDateTime || !endDateTime) {
        setErrorMsg('Please select both Start and End Date & Times.')
        return
      }
      if (new Date(startDateTime) >= new Date(endDateTime)) {
        setErrorMsg('The Start Time must be before the End Time.')
        return
      }
    }

    setShowConfirmModal(true)
  }, [purgeScope, hasGlobalSelection, selectedMember, dateCondition, startDateTime, endDateTime])

  const executePurge = useCallback(async () => {
    setErrorMsg(null)
    if (!adminPassword) {
      setErrorMsg('Admin password is required to proceed.')
      return
    }

    setIsDeleting(true)

    let payload = {
      purgeScope,
      dateCondition,
      startDateTime,
      endDateTime,
      adminPassword,
    }

    if (purgeScope === 'GLOBAL') {
      payload.collections = selectedGlobalKeys
    } else {
      payload.targetMemberId = selectedMember._id || selectedMember.vendorNo
      payload.targetVendorNo = selectedMember.vendorNo
      payload.collections = [memberPurgeChoice]
    }

    try {
      const response = await fetch(`${apiBase}/api/auth/purge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || `Server responded with ${response.status}`)
      }

      if (data.success) {
        setResultDetails(data.details || {})
        setResultMsg(data.message || 'Purge completed successfully.')
        handleCloseModal()

        // Reset state
        if (purgeScope === 'GLOBAL') {
          setCollections({ TRANSACTIONS: false, LOANS: false, USERS: false })
        } else {
          setSelectedMember(null)
          setMemberStats(null)
          setMemberSearchQuery('')
        }
        setDateCondition('ALL')
        setStartDateTime('')
        setEndDateTime('')
      } else {
        setErrorMsg(data.message || 'Authentication failed or purge was aborted.')
      }
    } catch (err) {
      console.error('Purge error:', err)
      setErrorMsg(err.message || 'Could not reach the server. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }, [adminPassword, purgeScope, selectedGlobalKeys, selectedMember, memberPurgeChoice, dateCondition, startDateTime, endDateTime, handleCloseModal])

  const handlePasswordKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && adminPassword && !isDeleting && !countdownActive) {
      executePurge()
    }
  }, [executePurge, adminPassword, isDeleting, countdownActive])

  const getConfirmationTimeText = () => {
    if (dateCondition === 'ALL')     return 'ALL RECORDS (NO DATE LIMIT)'
    if (dateCondition === 'BEFORE')  return `BEFORE ${new Date(startDateTime).toLocaleString('en-IN')}`
    if (dateCondition === 'AFTER')   return `AFTER ${new Date(startDateTime).toLocaleString('en-IN')}`
    if (dateCondition === 'BETWEEN') return `BETWEEN ${new Date(startDateTime).toLocaleString('en-IN')} AND ${new Date(endDateTime).toLocaleString('en-IN')}`
    return ''
  }

  // ============================================================
  return (
    <CRow>
      <CCol xs={12} lg={10} xl={8} className="mx-auto">
        <CCard className="shadow-sm border-top-danger border-top-3">
          <CCardHeader className="py-3 bg-white d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2 text-danger fw-bold fs-5">
              <CIcon icon={cilWarning} size="lg" />
              System Data Purge Utility
            </div>
            <CBadge color="danger" className="px-3 py-2 text-uppercase">
              Admin Protected Tool
            </CBadge>
          </CCardHeader>

          <CCardBody className="p-4">

            {/* Success Result Alert */}
            {resultMsg && resultDetails && (
              <CAlert color="success" dismissible onClose={() => { setResultMsg(null); setResultDetails(null) }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <CIcon icon={cilCheckCircle} size="lg" />
                  <strong>Purge Completed Successfully!</strong>
                </div>
                {resultDetails.targetMember && (
                  <div className="mb-2 small">
                    Target Member: <strong>{resultDetails.targetMember.name}</strong> (Vendor #{resultDetails.targetMember.vendorNo})
                  </div>
                )}
                <ul className="mb-0 mt-1 small">
                  <li>Transactions deleted: <strong>{resultDetails.transactionsDeleted ?? 0}</strong></li>
                  <li>Loans deleted: <strong>{resultDetails.loansDeleted ?? 0}</strong></li>
                  <li>Member profiles deleted: <strong>{resultDetails.usersDeleted ?? 0}</strong></li>
                </ul>
              </CAlert>
            )}

            {/* Error Alert */}
            {errorMsg && (
              <CAlert color="danger" dismissible onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </CAlert>
            )}

            {/* Warning Banner */}
            <CAlert color="danger" className="d-flex align-items-start gap-2 mb-4" role="alert">
              <CIcon icon={cilWarning} width={24} height={24} className="flex-shrink-0 mt-1" />
              <div>
                <strong>IRREVERSIBLE ACTION:</strong> This tool permanently deletes records from the live database.
                This action <strong>cannot be undone</strong>. Admin accounts are permanently protected against deletion.
              </div>
            </CAlert>

            {/* Scope Navigation Tabs */}
            <div className="mb-4">
              <label className="form-label small fw-bold text-muted text-uppercase mb-2">Select Purge Scope</label>
              <CNav variant="pills" className="bg-light p-1 rounded border">
                <CNavItem style={{ flex: 1 }}>
                  <CNavLink
                    active={purgeScope === 'GLOBAL'}
                    onClick={() => { setPurgeScope('GLOBAL'); setErrorMsg(null) }}
                    className="text-center fw-bold py-2"
                    style={{ cursor: 'pointer' }}
                  >
                    🌐 Global Database Purge
                  </CNavLink>
                </CNavItem>
                <CNavItem style={{ flex: 1 }}>
                  <CNavLink
                    active={purgeScope === 'MEMBER'}
                    onClick={() => { setPurgeScope('MEMBER'); setErrorMsg(null) }}
                    className="text-center fw-bold py-2"
                    style={{ cursor: 'pointer' }}
                  >
                    👤 Single Member Data Purge
                  </CNavLink>
                </CNavItem>
              </CNav>
            </div>

            {/* ══════════════════════════════════════════════════════════
                MODE 1: GLOBAL PURGE
            ══════════════════════════════════════════════════════════ */}
            {purgeScope === 'GLOBAL' && (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2 mt-3 border-bottom pb-2">
                  <h5 className="mb-0">1. Select Data Collections to Purge</h5>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={handleSelectAll}
                  >
                    {allGlobalSelected ? 'Clear All' : 'Select All'}
                  </button>
                </div>

                <div className="mb-4 bg-light p-3 rounded border">
                  {Object.entries(COLLECTION_LABELS).map(([key, label]) => (
                    <CFormCheck
                      key={key}
                      id={`purge-${key.toLowerCase()}`}
                      name={key}
                      label={label}
                      checked={collections[key]}
                      onChange={handleCheckboxChange}
                      className={`mb-2 fw-semibold ${key === 'USERS' ? 'text-danger' : ''}`}
                    />
                  ))}
                  {collections.USERS && (
                    <p className="text-muted small mb-0 ms-4">
                      ⚠️ Admin accounts are strictly protected and will never be deleted.
                    </p>
                  )}
                </div>

                {hasGlobalSelection && (
                  <div className="mb-4 p-3 border rounded bg-danger bg-opacity-10">
                    <p className="mb-1 text-danger fw-bold small">SELECTED FOR DELETION:</p>
                    <div className="d-flex flex-wrap gap-2">
                      {selectedGlobalKeys.map((k) => (
                        <CBadge color="danger" key={k}>{COLLECTION_LABELS[k]}</CBadge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════
                MODE 2: SINGLE MEMBER PURGE
            ══════════════════════════════════════════════════════════ */}
            {purgeScope === 'MEMBER' && (
              <>
                <div className="mb-4">
                  <h5 className="mb-2 border-bottom pb-2">1. Find & Select Member User ID</h5>
                  <label className="form-label small fw-bold text-muted">
                    Search Member by Name, Vendor No, Phone, or Society Account No:
                  </label>

                  <div className="position-relative">
                    <CInputGroup>
                      <CInputGroupText className="bg-white">
                        <CIcon icon={cilSearch} />
                      </CInputGroupText>
                      <CFormInput
                        type="text"
                        placeholder="Type name, vendor ID (e.g. 1045) or account number..."
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        className="shadow-none"
                      />
                      {selectedMember && (
                        <CButton
                          color="secondary"
                          variant="outline"
                          onClick={() => {
                            setSelectedMember(null)
                            setMemberStats(null)
                            setMemberSearchQuery('')
                          }}
                        >
                          Clear
                        </CButton>
                      )}
                    </CInputGroup>

                    {/* Autocomplete suggestions dropdown */}
                    {filteredMembers.length > 0 && !selectedMember && (
                      <div
                        className="position-absolute w-100 bg-white border rounded shadow-lg mt-1"
                        style={{ zIndex: 1000, maxHeight: '250px', overflowY: 'auto' }}
                      >
                        {filteredMembers.map((m) => (
                          <div
                            key={m._id}
                            onClick={() => selectMember(m)}
                            className="p-3 border-bottom d-flex justify-content-between align-items-center hover-bg-light"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                          >
                            <div>
                              <div className="fw-bold text-dark">{m.name}</div>
                              <div className="small text-muted">
                                Vendor #{m.vendorNo} &bull; {m.designation || 'Member'} &bull; {m.circle || 'HPSEBL'}
                              </div>
                            </div>
                            <div>
                              {m.role === 'admin' ? (
                                <CBadge color="danger">Admin (Protected)</CBadge>
                              ) : (
                                <CBadge color="info">ID: {m.vendorNo}</CBadge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Member Summary Card */}
                {isLoadingMemberStats && (
                  <div className="text-center py-4">
                    <CSpinner color="danger" />
                    <div className="small text-muted mt-2">Loading member financial records...</div>
                  </div>
                )}

                {selectedMember && !isLoadingMemberStats && (
                  <div className="mb-4">
                    <CCard className={`border ${selectedMember.role === 'admin' ? 'border-danger bg-danger bg-opacity-10' : 'border-info bg-light'}`}>
                      <CCardBody className="p-3">
                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 border-bottom pb-2">
                          <div className="d-flex align-items-center gap-2">
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0a6ed1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                              {selectedMember.name?.charAt(0) || 'M'}
                            </div>
                            <div>
                              <h6 className="mb-0 fw-bold">{selectedMember.name}</h6>
                              <span className="small text-muted">Vendor No: <strong>{selectedMember.vendorNo}</strong> | {selectedMember.designation || 'Member'}</span>
                            </div>
                          </div>
                          <div>
                            {selectedMember.role === 'admin' ? (
                              <CBadge color="danger" className="px-3 py-2 fs-6">
                                <CIcon icon={cilShieldAlt} className="me-1" /> Admin Account (Protected)
                              </CBadge>
                            ) : (
                              <CBadge color="success" className="px-3 py-2">
                                <CIcon icon={cilUser} className="me-1" /> Active Member
                              </CBadge>
                            )}
                          </div>
                        </div>

                        {selectedMember.role === 'admin' ? (
                          <CAlert color="danger" className="mb-0 py-2">
                            <CIcon icon={cilBan} className="me-2" />
                            <strong>Protected Account:</strong> This user has Administrative privileges and cannot be deleted or purged through this utility.
                          </CAlert>
                        ) : (
                          <CRow className="g-2 text-center small">
                            <CCol xs={6} md={3}>
                              <div className="p-2 bg-white rounded border">
                                <div className="text-muted">Total Share Balance</div>
                                <div className="fw-bold text-success">₹{(selectedMember.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</div>
                              </div>
                            </CCol>
                            <CCol xs={6} md={3}>
                              <div className="p-2 bg-white rounded border">
                                <div className="text-muted">RD Balance</div>
                                <div className="fw-bold text-info">₹{(selectedMember.rdBalance || 0).toLocaleString('en-IN')}</div>
                              </div>
                            </CCol>
                            <CCol xs={6} md={3}>
                              <div className="p-2 bg-white rounded border">
                                <div className="text-muted">Active Loans</div>
                                <div className="fw-bold text-warning">{memberStats?.loansCount ?? (selectedMember.activeLoanAmount ? 1 : 0)} Accounts</div>
                              </div>
                            </CCol>
                            <CCol xs={6} md={3}>
                              <div className="p-2 bg-white rounded border">
                                <div className="text-muted">Journal Logs</div>
                                <div className="fw-bold text-primary">{memberStats?.transactionsCount ?? '—'} Entries</div>
                              </div>
                            </CCol>
                          </CRow>
                        )}
                      </CCardBody>
                    </CCard>
                  </div>
                )}

                {/* Member Purge Action Options */}
                {selectedMember && selectedMember.role !== 'admin' && (
                  <div className="mb-4">
                    <h5 className="mb-3 border-bottom pb-2">2. Select What to Purge for This Member</h5>
                    <div className="d-flex flex-column gap-2">
                      {MEMBER_PURGE_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => setMemberPurgeChoice(opt.id)}
                          className={`p-3 rounded border d-flex align-items-start gap-3 transition-all ${
                            memberPurgeChoice === opt.id
                              ? opt.isDestructive
                                ? 'border-danger bg-danger bg-opacity-10 shadow-sm'
                                : 'border-warning bg-warning bg-opacity-10 shadow-sm'
                              : 'bg-white hover-bg-light'
                          }`}
                          style={{ cursor: 'pointer' }}
                        >
                          <input
                            type="radio"
                            name="memberPurgeChoice"
                            checked={memberPurgeChoice === opt.id}
                            onChange={() => setMemberPurgeChoice(opt.id)}
                            className="form-check-input mt-1"
                          />
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2">
                              <CIcon icon={opt.icon} className={opt.isDestructive ? 'text-danger' : 'text-warning'} />
                              <strong className={opt.isDestructive ? 'text-danger' : 'text-dark'}>{opt.title}</strong>
                              <CBadge color={opt.badgeColor} className="ms-auto small">
                                {opt.isDestructive ? 'PERMANENT WIPE' : 'SELECTIVE'}
                              </CBadge>
                            </div>
                            <div className="small text-muted mt-1">{opt.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP: DATE & TIME PARAMETERS (Optional)
            ══════════════════════════════════════════════════════════ */}
            {(purgeScope === 'GLOBAL' || (selectedMember && selectedMember.role !== 'admin' && memberPurgeChoice !== 'PROFILE')) && (
              <>
                <h5 className="mb-3 border-bottom pb-2">
                  {purgeScope === 'GLOBAL' ? '2. Set Date & Time Parameters' : '3. Optional Date Range Filter'}
                </h5>
                <CRow className="mb-4 align-items-end">
                  <CCol md={dateCondition === 'BETWEEN' ? 12 : 6} className="mb-3">
                    <label className="form-label small fw-bold">Timeframe Condition</label>
                    <CFormSelect
                      value={dateCondition}
                      onChange={(e) => {
                        setDateCondition(e.target.value)
                        setStartDateTime('')
                        setEndDateTime('')
                      }}
                    >
                      <option value="ALL">Wipe ALL Selected Data (No Date Limit)</option>
                      <option value="BEFORE">Delete Records Created BEFORE Date/Time</option>
                      <option value="AFTER">Delete Records Created AFTER Date/Time</option>
                      <option value="BETWEEN">Delete Records BETWEEN Specific Dates</option>
                    </CFormSelect>
                  </CCol>

                  {(dateCondition === 'BEFORE' || dateCondition === 'AFTER') && (
                    <CCol md={6} className="mb-3">
                      <label className="form-label small fw-bold text-danger">Target Date & Time</label>
                      <CFormInput
                        type="datetime-local"
                        value={startDateTime}
                        onChange={(e) => setStartDateTime(e.target.value)}
                        max={dateCondition === 'BEFORE' ? new Date().toISOString().slice(0, 16) : undefined}
                      />
                    </CCol>
                  )}

                  {dateCondition === 'BETWEEN' && (
                    <>
                      <CCol md={6} className="mb-3">
                        <label className="form-label small fw-bold text-danger">Start Date & Time</label>
                        <CFormInput
                          type="datetime-local"
                          value={startDateTime}
                          onChange={(e) => setStartDateTime(e.target.value)}
                          max={endDateTime || undefined}
                        />
                      </CCol>
                      <CCol md={6} className="mb-3">
                        <label className="form-label small fw-bold text-danger">End Date & Time</label>
                        <CFormInput
                          type="datetime-local"
                          value={endDateTime}
                          onChange={(e) => setEndDateTime(e.target.value)}
                          min={startDateTime || undefined}
                          max={new Date().toISOString().slice(0, 16)}
                        />
                      </CCol>
                    </>
                  )}
                </CRow>
              </>
            )}

            {/* Action Trigger Button */}
            <div className="d-grid mt-4">
              <CButton
                color="danger"
                size="lg"
                className="text-white fw-bold shadow"
                onClick={triggerConfirmation}
                disabled={
                  purgeScope === 'GLOBAL'
                    ? !hasGlobalSelection
                    : !selectedMember || selectedMember.role === 'admin'
                }
              >
                <CIcon icon={cilTrash} className="me-2" />
                {purgeScope === 'GLOBAL'
                  ? 'Review & Initiate Global Purge'
                  : `Review & Purge Data for ${selectedMember ? selectedMember.name : 'Selected Member'}`}
              </CButton>
            </div>
          </CCardBody>
        </CCard>
      </CCol>

      {/* ══════════════════════════════════════════════════════════
          CONFIRMATION MODAL WITH ADMIN PASSWORD & COUNTDOWN
      ══════════════════════════════════════════════════════════ */}
      <CModal
        visible={showConfirmModal}
        onClose={handleCloseModal}
        backdrop="static"
        alignment="center"
        size="lg"
      >
        <CModalHeader className="bg-danger text-white">
          <CModalTitle className="fw-bold d-flex align-items-center gap-2">
            <CIcon icon={cilWarning} />
            Confirm Critical Data Purge
          </CModalTitle>
        </CModalHeader>

        <CModalBody className="p-4">
          <h6 className="text-center text-muted mb-3">You are about to permanently delete:</h6>

          {purgeScope === 'GLOBAL' ? (
            <div className="border border-danger rounded p-3 bg-danger bg-opacity-10 mb-4 text-center">
              <div className="d-flex flex-wrap gap-2 justify-content-center mb-3">
                {selectedGlobalKeys.map((key) => (
                  <CBadge color="danger" className="fs-6 px-3 py-2" key={key}>
                    {COLLECTION_LABELS[key]}
                  </CBadge>
                ))}
              </div>
              <div className="fw-bold text-dark small text-uppercase">
                Timeframe:<br />
                <span className="text-danger fs-6">{getConfirmationTimeText()}</span>
              </div>
            </div>
          ) : (
            <div className="border border-danger rounded p-3 bg-danger bg-opacity-10 mb-4">
              <div className="d-flex align-items-center gap-3 mb-3 border-bottom border-danger pb-2">
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dc3545', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {selectedMember?.name?.charAt(0) || 'M'}
                </div>
                <div>
                  <h6 className="mb-0 fw-bold text-danger">{selectedMember?.name}</h6>
                  <span className="small text-muted">Vendor #{selectedMember?.vendorNo} &bull; {selectedMember?.designation || 'Member'}</span>
                </div>
              </div>

              <div className="mb-2">
                <span className="small fw-bold text-uppercase text-muted">Action: </span>
                <CBadge color="danger" className="fs-6 px-3 py-1">
                  {MEMBER_PURGE_OPTIONS.find((o) => o.id === memberPurgeChoice)?.title}
                </CBadge>
              </div>
              <div className="small text-danger fw-bold">
                {MEMBER_PURGE_OPTIONS.find((o) => o.id === memberPurgeChoice)?.desc}
              </div>
              {memberPurgeChoice !== 'PROFILE' && (
                <div className="mt-2 small text-muted">
                  Timeframe: <span className="fw-bold">{getConfirmationTimeText()}</span>
                </div>
              )}
            </div>
          )}

          {/* Modal-level error */}
          {errorMsg && (
            <CAlert color="danger" dismissible onClose={() => setErrorMsg(null)} className="py-2">
              {errorMsg}
            </CAlert>
          )}

          <label className="form-label fw-bold text-danger">
            Enter Your Admin Password to Confirm
          </label>
          <CFormInput
            type="password"
            placeholder="Your current login password..."
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={handlePasswordKeyDown}
            autoFocus
          />
          {countdownActive && (
            <p className="text-muted small mt-2 text-center">
              ⏳ Please review the details above. Confirm button activates in <strong>{countdown}s</strong>…
            </p>
          )}
        </CModalBody>

        <CModalFooter className="bg-light">
          <CButton
            color="dark"
            variant="ghost"
            onClick={handleCloseModal}
            disabled={isDeleting}
          >
            Cancel
          </CButton>
          <CButton
            color="danger"
            onClick={executePurge}
            disabled={isDeleting || !adminPassword || countdownActive}
            className="px-4 fw-bold text-white"
            id="purge-confirm-btn"
          >
            {isDeleting ? (
              <><CSpinner size="sm" className="me-2" />Deleting…</>
            ) : countdownActive ? (
              `Wait (${countdown}s)…`
            ) : (
              'CONFIRM PERMANENT DELETION'
            )}
          </CButton>
        </CModalFooter>
      </CModal>
    </CRow>
  )
}

export default DatabasePurge
