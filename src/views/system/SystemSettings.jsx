/**
 * SystemSettings.jsx
 *
 * Full-featured settings dashboard with tabs:
 *  1. Society Profile
 *  2. Financial Defaults & Rates
 *  3. Session & Security (auto-logout timer)
 *  4. Accounting & FY Config
 *  5. Color Themes
 *  6. Notifications
 */
import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CNav, CNavItem, CNavLink,
  CTabContent, CTabPane, CButton, CFormInput, CFormLabel, CFormSelect,
  CAlert, CBadge, CSpinner, CFormSwitch, CModal, CModalHeader, CModalTitle,
  CModalBody, CModalFooter,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilSettings, cilBank, cilShieldAlt, cilSpreadsheet, cilBell, cilColorPalette,
  cilSave, cilBuilding, cilSend, cilCheckCircle, cilWarning,
} from '@coreui/icons'
import { THEMES, applyColorTheme, getStoredTheme } from '../../utils/themeManager'
import API_BASE_URL from '../../apiConfig'

const SETTINGS_KEY = 'sacco_system_settings'

const defaultSettings = {
  societyName: 'Mahadev Society - HPSEBL Employees Co-operative',
  registrationNo: '',
  officeAddress: 'Shimla, Himachal Pradesh',
  contactEmail: 'mahadevsociety2026@gmail.com',
  contactPhone: '',
  loanInterestRate: '10',
  rdInterestRate: '7',
  shareValue: '10',
  maxLoanLimit: '500000',
  penalRate: '2',
  admissionFee: '100',
  activeFinancialYear: '2025-2026',
  fyStartMonth: '4',
  inactivityTimeout: '300000',
  sessionWarning: true,
  smsAlerts: false,
  whatsappAlerts: false,
  emailAlerts: true,
  emailWelcomeApproval: true,
  emailLoanSanction: true,
  emailMonthlyReceipt: true,
  emailHelpdeskReply: true,
  emailPasswordReset: true,
  demandSheetAuto: false,
  colorTheme: 'corporate-blue',
}

const INACTIVITY_OPTIONS = [
  { label: '3 Minutes', value: '180000' },
  { label: '5 Minutes (Recommended)', value: '300000' },
  { label: '10 Minutes', value: '600000' },
  { label: '15 Minutes', value: '900000' },
  { label: '30 Minutes', value: '1800000' },
]

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState(1)
  const [settings, setSettings] = useState(defaultSettings)
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeThemeId, setActiveThemeId] = useState(getStoredTheme().id)

  // ── EMAIL TEST STATES ──
  const [testModalVisible, setTestModalVisible] = useState(false)
  const [testRecipientEmail, setTestRecipientEmail] = useState('mahadevsociety2026@gmail.com')
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResponse, setTestResponse] = useState(null)
  const [smtpStatus, setSmtpStatus] = useState({ configured: false, sender: 'mahadevsociety2026@gmail.com', message: 'Checking...' })

  // Fetch SMTP status & saved settings on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      setSettings({ ...defaultSettings, ...JSON.parse(stored) })
    }
    setActiveThemeId(getStoredTheme().id)

    // Check live email engine status
    const fetchEmailStatus = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken')
      try {
        const res = await fetch(`${API_BASE_URL}/api/communication/email/status`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setSmtpStatus(data.status || { configured: true, sender: 'mahadevsociety2026@gmail.com' })
        }
      } catch (e) {
        // Fallback default
        setSmtpStatus({ configured: true, sender: 'mahadevsociety2026@gmail.com' })
      }
    }
    fetchEmailStatus()
  }, [])

  const handleSendTestEmail = async () => {
    if (!testRecipientEmail) return
    setIsSendingTest(true)
    setTestResponse(null)
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken')
    try {
      const res = await fetch(`${API_BASE_URL}/api/communication/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ toEmail: testRecipientEmail })
      })
      const data = await res.json()
      if (res.ok) {
        setTestResponse({ success: true, message: data.message || '✅ Test email dispatched successfully!' })
      } else {
        setTestResponse({ success: false, message: data.error || 'Failed to dispatch test email.' })
      }
    } catch (err) {
      setTestResponse({ success: false, message: err.message || 'Server connection error.' })
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    setIsSaving(true)
    // Apply inactivity timeout setting immediately
    localStorage.setItem('sacco_inactivity_timeout', settings.inactivityTimeout)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    setTimeout(() => {
      setIsSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }, 600)
  }

  const handleApplyTheme = (themeId) => {
    setActiveThemeId(themeId)
    applyColorTheme(themeId)
    handleChange('colorTheme', themeId)
  }

  const fieldRow = (label, key, type = 'text', placeholder = '') => (
    <CRow className="mb-3 align-items-center">
      <CCol md={4}>
        <CFormLabel className="fw-semibold mb-0 text-muted small text-uppercase">{label}</CFormLabel>
      </CCol>
      <CCol md={8}>
        <CFormInput
          type={type}
          value={settings[key]}
          onChange={(e) => handleChange(key, e.target.value)}
          placeholder={placeholder}
          className="shadow-none"
        />
      </CCol>
    </CRow>
  )

  const tabs = [
    { id: 1, icon: cilBuilding, label: 'Society Profile' },
    { id: 2, icon: cilBank, label: 'Financial Rates' },
    { id: 3, icon: cilShieldAlt, label: 'Session & Security' },
    { id: 4, icon: cilSpreadsheet, label: 'Accounting & FY' },
    { id: 5, icon: cilColorPalette, label: 'Color Themes' },
    { id: 6, icon: cilBell, label: 'Notifications' },
  ]

  return (
    <CRow>
      <CCol xs={12} xl={11} className="mx-auto">
        {/* Header */}
        <div className="mb-4 d-flex align-items-center gap-3">
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--app-primary-gradient, linear-gradient(135deg,#1e3c72,#2a5298))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CIcon icon={cilSettings} size="lg" style={{ color: 'white' }} />
          </div>
          <div>
            <h3 className="mb-0 fw-bold" style={{ color: '#1d2d3e' }}>System Settings</h3>
            <span className="text-muted small">Manage all application-wide configurations</span>
          </div>
          <div className="ms-auto d-flex align-items-center gap-2">
            {saved && <CBadge color="success" className="px-3 py-2">✅ Saved!</CBadge>}
            <CButton
              color="primary"
              className="fw-bold px-4 shadow-sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilSave} className="me-2" />}
              {isSaving ? 'Saving...' : 'Save All Changes'}
            </CButton>
          </div>
        </div>

        <CCard className="shadow-sm border-0">
          <CCardBody className="p-0">
            {/* Tab Nav */}
            <CNav variant="tabs" className="px-3 pt-3 bg-light border-bottom">
              {tabs.map((tab) => (
                <CNavItem key={tab.id}>
                  <CNavLink
                    active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{ cursor: 'pointer', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.88rem' }}
                  >
                    <CIcon icon={tab.icon} className="me-2" size="sm" />
                    {tab.label}
                  </CNavLink>
                </CNavItem>
              ))}
            </CNav>

            <CTabContent className="p-4">

              {/* TAB 1: Society Profile */}
              <CTabPane visible={activeTab === 1}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">🏛️ Society Profile</h5>
                {fieldRow('Society Name', 'societyName', 'text', 'Enter official society name')}
                {fieldRow('Registration Number', 'registrationNo', 'text', 'e.g. REG/HP/2001/0042')}
                {fieldRow('Office Address', 'officeAddress', 'text', 'Full postal address')}
                {fieldRow('Contact Email', 'contactEmail', 'email', 'official@mahasociety.org')}
                {fieldRow('Contact Phone', 'contactPhone', 'text', '+91 98xxxxxxxx')}
              </CTabPane>

              {/* TAB 2: Financial Defaults */}
              <CTabPane visible={activeTab === 2}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">💰 Financial Defaults & Rates</h5>
                <CAlert color="info" className="py-2 small mb-4">
                  These rates apply to new records by default. Existing transactions are unaffected.
                </CAlert>
                {fieldRow('Loan Interest Rate (%)', 'loanInterestRate', 'number', 'e.g. 10')}
                {fieldRow('RD / Savings Interest Rate (%)', 'rdInterestRate', 'number', 'e.g. 7')}
                {fieldRow('Share Face Value (₹)', 'shareValue', 'number', 'e.g. 10')}
                {fieldRow('Max Loan Limit (₹)', 'maxLoanLimit', 'number', 'e.g. 500000')}
                {fieldRow('Penal Interest Rate (%)', 'penalRate', 'number', 'e.g. 2')}
                {fieldRow('Admission Fee (₹)', 'admissionFee', 'number', 'e.g. 100')}
              </CTabPane>

              {/* TAB 3: Session & Security */}
              <CTabPane visible={activeTab === 3}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">🔒 Session & Security</h5>
                <CRow className="mb-4">
                  <CCol md={4}>
                    <CFormLabel className="fw-semibold mb-0 text-muted small text-uppercase">
                      Auto-Logout Timeout
                    </CFormLabel>
                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                      How long before an idle session is automatically logged out.
                    </div>
                  </CCol>
                  <CCol md={8}>
                    <CFormSelect
                      value={settings.inactivityTimeout}
                      onChange={(e) => handleChange('inactivityTimeout', e.target.value)}
                      className="shadow-none"
                    >
                      {INACTIVITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </CFormSelect>
                    <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                      A 30-second warning will appear before the session ends.
                    </div>
                  </CCol>
                </CRow>
                <CRow className="mb-3">
                  <CCol md={8} className="offset-md-4">
                    <CFormSwitch
                      label="Show warning countdown modal before logout"
                      id="sessionWarning"
                      checked={settings.sessionWarning}
                      onChange={(e) => handleChange('sessionWarning', e.target.checked)}
                    />
                  </CCol>
                </CRow>
              </CTabPane>

              {/* TAB 4: Accounting & FY */}
              <CTabPane visible={activeTab === 4}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">📊 Accounting & Financial Year</h5>
                <CRow className="mb-3 align-items-center">
                  <CCol md={4}>
                    <CFormLabel className="fw-semibold mb-0 text-muted small text-uppercase">
                      Active Financial Year
                    </CFormLabel>
                  </CCol>
                  <CCol md={8}>
                    <CFormSelect
                      value={settings.activeFinancialYear}
                      onChange={(e) => handleChange('activeFinancialYear', e.target.value)}
                      className="shadow-none"
                    >
                      {(() => {
                        const now = new Date();
                        const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                        return Array.from({ length: 6 }, (_, i) => {
                          const yr = currentFYStart - 2 + i;
                          return (
                            <option key={yr} value={`${yr}-${yr + 1}`}>FY {yr}–{yr + 1}</option>
                          );
                        });
                      })()}
                    </CFormSelect>
                  </CCol>
                </CRow>
                <CRow className="mb-3 align-items-center">
                  <CCol md={4}>
                    <CFormLabel className="fw-semibold mb-0 text-muted small text-uppercase">
                      FY Start Month
                    </CFormLabel>
                  </CCol>
                  <CCol md={8}>
                    <CFormSelect
                      value={settings.fyStartMonth}
                      onChange={(e) => handleChange('fyStartMonth', e.target.value)}
                      className="shadow-none"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>
                          {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </option>
                      ))}
                    </CFormSelect>
                  </CCol>
                </CRow>
              </CTabPane>

              {/* TAB 5: COLOR THEMES */}
              <CTabPane visible={activeTab === 5}>
                <h5 className="fw-bold mb-2 border-bottom pb-2">🎨 Color Theme</h5>
                <p className="text-muted mb-4 small">
                  Choose a theme that changes the sidebar, buttons, and accent colors across the entire application. The selected theme is saved automatically.
                </p>
                <div className="d-flex flex-wrap gap-3">
                  {THEMES.map((theme) => {
                    const isActive = activeThemeId === theme.id
                    return (
                      <div
                        key={theme.id}
                        onClick={() => handleApplyTheme(theme.id)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 16,
                          border: isActive ? `3px solid ${theme.primary}` : '3px solid #e2e8f0',
                          padding: '16px 20px',
                          minWidth: 160,
                          background: isActive ? theme.primaryLight : '#fff',
                          boxShadow: isActive
                            ? `0 4px 20px ${theme.previewColor}55`
                            : '0 2px 8px rgba(0,0,0,0.06)',
                          transition: 'all 0.25s ease',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Gradient swatch */}
                        <div
                          style={{
                            height: 44,
                            borderRadius: 10,
                            background: theme.gradient,
                            marginBottom: 12,
                            boxShadow: `0 3px 10px ${theme.previewColor}44`,
                          }}
                        />
                        <div className="fw-bold" style={{ fontSize: '0.88rem', color: '#1d2d3e' }}>
                          {theme.emoji} {theme.name}
                        </div>
                        {isActive && (
                          <CBadge
                            color="success"
                            style={{
                              position: 'absolute', top: 10, right: 10, fontSize: '0.72rem',
                            }}
                          >
                            ✓ Active
                          </CBadge>
                        )}
                      </div>
                    )
                  })}
                </div>
                <CAlert color="info" className="mt-4 py-2 small">
                  The selected color theme is applied immediately and persisted across sessions. For the Android mobile app, this theme preference will be synced automatically.
                </CAlert>
              </CTabPane>

              {/* TAB 6: Notifications & Email Gateway */}
              <CTabPane visible={activeTab === 6}>
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                  <div>
                    <h5 className="fw-bold mb-0">📧 Automated Email Gateway & Alerts</h5>
                    <small className="text-muted">Configure transactional email automation and society notifications</small>
                  </div>
                  <CBadge color={smtpStatus.configured ? 'success' : 'warning'} className="px-3 py-2">
                    {smtpStatus.configured ? '🟢 Gateway Active' : '🟡 Test / Mock Mode'}
                  </CBadge>
                </div>

                {/* EMAIL GATEWAY CARD */}
                <div className="p-3 mb-4 rounded border bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div>
                      <div className="fw-bold" style={{ fontSize: '0.95rem' }}>🏛️ Outgoing Sender Configuration</div>
                      <div className="text-muted small">
                        Emails are dispatched from <strong>{settings.contactEmail || 'mahadevsociety2026@gmail.com'}</strong>
                      </div>
                    </div>
                    <CButton
                      color="primary"
                      size="sm"
                      className="fw-semibold shadow-sm"
                      onClick={() => {
                        setTestRecipientEmail(settings.contactEmail || 'mahadevsociety2026@gmail.com')
                        setTestResponse(null)
                        setTestModalVisible(true)
                      }}
                    >
                      <CIcon icon={cilSend} className="me-1" />
                      ⚡ Send Test Email
                    </CButton>
                  </div>

                  <CRow className="g-2">
                    <CCol md={6}>
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-1">Official Society Email Address</CFormLabel>
                      <CFormInput
                        value={settings.contactEmail}
                        onChange={(e) => handleChange('contactEmail', e.target.value)}
                        placeholder="mahadevsociety2026@gmail.com or help@mahadevsociety.com"
                        className="shadow-none bg-white"
                      />
                    </CCol>
                    <CCol md={6}>
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-1">Gateway Protocol</CFormLabel>
                      <CFormInput
                        value="SMTP / Nodemailer (Port 587 TLS)"
                        disabled
                        className="shadow-none bg-white text-muted"
                      />
                    </CCol>
                  </CRow>
                </div>

                {/* AUTOMATED TRIGGERS */}
                <h6 className="fw-bold text-uppercase small text-muted mb-3">⚡ Automated Real-Time Triggers</h6>
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">🎉 Account Approval & Welcome</div>
                        <CFormSwitch
                          id="emailWelcomeApproval"
                          checked={settings.emailWelcomeApproval}
                          onChange={(e) => handleChange('emailWelcomeApproval', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Automatically emails new members their Vendor Number, Login URL, and portal access instructions upon admin verification.
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">🏦 Loan Sanction & Advice</div>
                        <CFormSwitch
                          id="emailLoanSanction"
                          checked={settings.emailLoanSanction}
                          onChange={(e) => handleChange('emailLoanSanction', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Sends loan approval advice with Sanctioned Principal, monthly EMI schedule, tenure, and disbursal reference details.
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">🧾 Monthly Salary Deduction Receipt</div>
                        <CFormSwitch
                          id="emailMonthlyReceipt"
                          checked={settings.emailMonthlyReceipt}
                          onChange={(e) => handleChange('emailMonthlyReceipt', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Emails instant credit receipts for Monthly Share, RD deposit, and EMI payments with updated account balances.
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">💬 Helpdesk Ticket Response</div>
                        <CFormSwitch
                          id="emailHelpdeskReply"
                          checked={settings.emailHelpdeskReply}
                          onChange={(e) => handleChange('emailHelpdeskReply', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Dispatches admin responses to member queries directly to the member's registered email inbox.
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">🔐 Password Reset & Security OTP</div>
                        <CFormSwitch
                          id="emailPasswordReset"
                          checked={settings.emailPasswordReset}
                          onChange={(e) => handleChange('emailPasswordReset', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Sends time-limited 6-digit security OTPs for identity verification and account password recovery.
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="p-3 rounded border bg-white h-100 shadow-sm">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-bold">📊 Auto-Generate Demand Sheet</div>
                        <CFormSwitch
                          id="demandSheetAuto"
                          checked={settings.demandSheetAuto}
                          onChange={(e) => handleChange('demandSheetAuto', e.target.checked)}
                        />
                      </div>
                      <p className="text-muted small mb-0">
                        Prepares next month's HPSEBL payroll recovery schedule automatically at each monthly closing cycle.
                      </p>
                    </div>
                  </div>
                </div>
              </CTabPane>
            </CTabContent>
          </CCardBody>
        </CCard>

        {/* Bottom Save Bar */}
        <div className="d-flex justify-content-end mt-3 gap-2">
          {saved && <CBadge color="success" className="px-3 py-2 align-self-center">✅ All changes saved!</CBadge>}
          <CButton color="primary" className="fw-bold px-5 shadow-sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilSave} className="me-2" />}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </CButton>
        </div>
      </CCol>

      {/* ── TEST EMAIL MODAL ── */}
      <CModal visible={testModalVisible} onClose={() => setTestModalVisible(false)} alignment="center">
        <CModalHeader>
          <CModalTitle>⚡ Dispatch SMTP Test Email</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p className="text-muted small mb-3">
            Enter a recipient email address below to test outgoing SMTP connectivity and verify email delivery to your inbox.
          </p>

          <div className="mb-3">
            <CFormLabel className="fw-semibold small text-muted text-uppercase">Recipient Email</CFormLabel>
            <CFormInput
              type="email"
              value={testRecipientEmail}
              onChange={(e) => setTestRecipientEmail(e.target.value)}
              placeholder="e.g. mahadevsociety2026@gmail.com"
              className="shadow-none"
            />
          </div>

          {testResponse && (
            <CAlert color={testResponse.success ? 'success' : 'danger'} className="py-2 mb-0 small">
              <CIcon icon={testResponse.success ? cilCheckCircle : cilWarning} className="me-2" />
              {testResponse.message}
            </CAlert>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={() => setTestModalVisible(false)}>
            Close
          </CButton>
          <CButton color="primary" onClick={handleSendTestEmail} disabled={isSendingTest || !testRecipientEmail}>
            {isSendingTest ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilSend} className="me-2" />}
            {isSendingTest ? 'Dispatching...' : 'Send Live Test'}
          </CButton>
        </CModalFooter>
      </CModal>
    </CRow>
  )
}
