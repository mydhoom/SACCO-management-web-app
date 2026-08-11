import React, { useState, useMemo, useCallback, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton,
  CFormCheck, CFormSelect, CFormInput, CModal, CModalHeader,
  CModalTitle, CModalBody, CModalFooter, CAlert, CSpinner, CBadge
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWarning, cilTrash, cilCheckCircle } from '@coreui/icons'

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

// ============================================================
const DatabasePurge = () => {
  // Selection State
  const [collections, setCollections] = useState({
    TRANSACTIONS: false,
    LOANS:        false,
    USERS:        false,
  })

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

  // ---- Derived values ----
  const selectedKeys = useMemo(
    () => Object.keys(collections).filter((k) => collections[k]),
    [collections],
  )
  const hasSelection  = selectedKeys.length > 0
  const allSelected   = selectedKeys.length === Object.keys(collections).length

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
    const newValue = !allSelected
    setCollections({ TRANSACTIONS: newValue, LOANS: newValue, USERS: newValue })
  }, [allSelected])

  const handleCloseModal = useCallback(() => {
    setShowConfirmModal(false)
    setAdminPassword('')
    setErrorMsg(null)
  }, [])

  const triggerConfirmation = useCallback(() => {
    setErrorMsg(null)
    setResultMsg(null)

    if (!hasSelection) {
      setErrorMsg('Please select at least one data category to delete.')
      return
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
  }, [hasSelection, dateCondition, startDateTime, endDateTime])

  const executePurge = useCallback(async () => {
    setErrorMsg(null)
    if (!adminPassword) {
      setErrorMsg('Admin password is required to proceed.')
      return
    }

    setIsDeleting(true)
    const payload = { collections: selectedKeys, dateCondition, startDateTime, endDateTime, adminPassword }

    try {
      // FIX: Correct endpoint is /api/auth/purge (registered in authRoutes.js)
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
        setResultMsg('Purge completed successfully.')
        handleCloseModal()
        // Reset selections
        setCollections({ TRANSACTIONS: false, LOANS: false, USERS: false })
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
  }, [adminPassword, selectedKeys, dateCondition, startDateTime, endDateTime, handleCloseModal])

  // Allow Enter key in password field to trigger purge
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
      <CCol xs={12} md={8} className="mx-auto">
        <CCard className="shadow-sm border-top-danger border-top-3">
          <CCardHeader className="py-3 bg-white d-flex align-items-center gap-2 text-danger fw-bold">
            <CIcon icon={cilWarning} size="lg" />
            System Data Purge Utility
          </CCardHeader>

          <CCardBody className="p-4">

            {/* Success Result */}
            {resultMsg && resultDetails && (
              <CAlert color="success" dismissible onClose={() => { setResultMsg(null); setResultDetails(null) }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <CIcon icon={cilCheckCircle} size="lg" />
                  <strong>Purge Completed Successfully!</strong>
                </div>
                <ul className="mb-0 mt-1 small">
                  <li>Transactions deleted: <strong>{resultDetails.transactionsDeleted ?? 0}</strong></li>
                  <li>Loans deleted: <strong>{resultDetails.loansDeleted ?? 0}</strong></li>
                  <li>Members deleted: <strong>{resultDetails.usersDeleted ?? 0}</strong></li>
                </ul>
              </CAlert>
            )}

            {/* Errors (fixed: now uses "danger" not "warning") */}
            {errorMsg && (
              <CAlert color="danger" dismissible onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </CAlert>
            )}

            {/* Persistent warning banner */}
            <CAlert color="danger" className="d-flex align-items-start gap-2" role="alert">
              <CIcon icon={cilWarning} width={24} height={24} className="flex-shrink-0 mt-1" />
              <div>
                <strong>IRREVERSIBLE ACTION:</strong> This tool permanently deletes financial and user data
                from the live database. This action <strong>cannot be undone</strong>. Only proceed if you
                are absolutely certain.
              </div>
            </CAlert>

            {/* Step 1 — Select Collections */}
            <div className="d-flex justify-content-between align-items-center mb-2 mt-4 border-bottom pb-2">
              <h5 className="mb-0">1. Select Data to Purge</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleSelectAll}
              >
                {allSelected ? 'Clear All' : 'Select All'}
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

            {/* Live summary of what will be deleted */}
            {hasSelection && (
              <div className="mb-4 p-3 border rounded bg-danger bg-opacity-10">
                <p className="mb-1 text-danger fw-bold small">SELECTED FOR DELETION:</p>
                <div className="d-flex flex-wrap gap-2">
                  {selectedKeys.map((k) => (
                    <CBadge color="danger" key={k}>{COLLECTION_LABELS[k]}</CBadge>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2 — Date Parameters */}
            <h5 className="mb-3 border-bottom pb-2">2. Set Date & Time Parameters</h5>
            <CRow className="mb-4 align-items-end">
              <CCol md={dateCondition === 'BETWEEN' ? 12 : 6} className="mb-3">
                <label className="form-label small fw-bold">Timeframe Condition</label>
                <CFormSelect
                  value={dateCondition}
                  onChange={(e) => { setDateCondition(e.target.value); setStartDateTime(''); setEndDateTime('') }}
                >
                  <option value="ALL">Wipe ALL Selected Data (No Limit)</option>
                  <option value="BEFORE">Delete Data Created BEFORE Date/Time</option>
                  <option value="AFTER">Delete Data Created AFTER Date/Time</option>
                  <option value="BETWEEN">Delete Data BETWEEN Specific Date/Times</option>
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

            {/* Action Button */}
            <div className="d-grid mt-4">
              <CButton
                color="danger"
                size="lg"
                className="text-white fw-bold shadow"
                onClick={triggerConfirmation}
                disabled={!hasSelection}
              >
                <CIcon icon={cilTrash} className="me-2" />
                Review & Initiate Purge
              </CButton>
            </div>
          </CCardBody>
        </CCard>
      </CCol>

      {/* ---- PASSWORD-PROTECTED CONFIRMATION MODAL ---- */}
      <CModal
        visible={showConfirmModal}
        onClose={handleCloseModal}
        backdrop="static"
        alignment="center"
      >
        <CModalHeader className="bg-danger text-white">
          <CModalTitle className="fw-bold">
            <CIcon icon={cilWarning} className="me-2" />
            Confirm Critical Action
          </CModalTitle>
        </CModalHeader>

        <CModalBody className="p-4">
          <h6 className="text-center text-muted mb-3">You are about to permanently delete:</h6>

          <div className="border border-danger rounded p-3 bg-danger bg-opacity-10 mb-4 text-center">
            <div className="d-flex flex-wrap gap-2 justify-content-center mb-3">
              {selectedKeys.map((key) => (
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
              'CONFIRM DELETION'
            )}
          </CButton>
        </CModalFooter>
      </CModal>
    </CRow>
  )
}

DatabasePurge.propTypes = {
  // No props needed — all config is internal
}

export default DatabasePurge
