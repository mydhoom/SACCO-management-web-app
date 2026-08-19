/**
 * UserProfile.jsx
 *
 * Comprehensive Member Profile with:
 *  - Personal Info, KYC Identity, HPSEBL Employment, Shares & Membership,
 *    Nominee Details, Banking Details
 *  - Admin: verification badges, edit all fields
 *  - Member: view all, self-edit personal/banking/nominee
 *  - HPSEBL Departmental & National ID Card OCR Scanner with auto-fill
 */
import React, { useState, useRef, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CTabContent, CTabPane, CRow, CCol, CFormInput, CFormLabel,
  CFormSelect, CButton, CAlert, CSpinner, CBadge, CModal,
  CModalHeader, CModalTitle, CModalBody, CModalFooter, CProgress,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilUser, cilBank, cilBriefcase, cilShieldAlt, cilPeople,
  cilStar, cilCamera, cilImage, cilCheckCircle, cilWarning,
  cilCloudUpload, cilQrCode, cilBan,
} from '@coreui/icons'
import { hpseblOrgStructure } from '../../utils/hpseblStructure'
import { scanIDCard } from '../../utils/idCardScanner'
import avatar8 from '../../assets/images/avatars/8.jpg'
import API_BASE_URL from '../../apiConfig'

const CARD_TYPE_LABELS = {
  AADHAAR: '🪪 Aadhaar Card',
  PAN: '🧾 PAN Card',
  VOTER_ID: '🗳️ Voter ID',
  DRIVING_LICENCE: '🚗 Driving Licence',
  HPSEBL_DEPT: '🏢 HPSEBL Departmental ID',
  IDENTITY_DOC: '📄 Identity Document',
  OTHER: '📄 Identity Document',
  UNKNOWN: '📄 Identity Document',
}

// ── RETIREMENT DATE CALCULATOR (Last day of birth month with 1st of month rule) ──
export const calculateRetirementDate = (dobString, retirementAge = 58) => {
  if (!dobString) return ''
  const dob = new Date(dobString)
  if (isNaN(dob.getTime())) return ''

  const birthDay = dob.getDate()
  const birthMonth = dob.getMonth() // 0-indexed
  const birthYear = dob.getFullYear()
  const age = Number(retirementAge) === 60 ? 60 : 58
  const retYear = birthYear + age

  // Special Rule: If born on the 1st, employee retires on last day of previous month
  // Otherwise, employee retires on the last day of the birth month
  const retDate = birthDay === 1
    ? new Date(retYear, birthMonth, 0)
    : new Date(retYear, birthMonth + 1, 0)

  const yyyy = retDate.getFullYear()
  const mm = String(retDate.getMonth() + 1).padStart(2, '0')
  const dd = String(retDate.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const getRemainingServiceText = (retirementDateString) => {
  if (!retirementDateString) return ''
  const retDate = new Date(retirementDateString)
  const now = new Date()
  if (isNaN(retDate.getTime())) return ''
  if (retDate <= now) return '⚠️ Service Completed (Retired)'

  const totalMonths = (retDate.getFullYear() - now.getFullYear()) * 12 + (retDate.getMonth() - now.getMonth())
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  return `⏳ ${years} Yrs ${months} Mos remaining (${totalMonths} months tenure limit)`
}

export default function UserProfile() {
  const userRole = localStorage.getItem('userRole') || 'member'
  const isAdmin = userRole === 'admin' || userRole === 'executive'

  // ── TABS ──
  const [activeTab, setActiveTab] = useState(1)

  // ── FORM DATA ──
  const [formData, setFormData] = useState({
    // Personal
    name: '', fatherName: '', dob: '', gender: '', bloodGroup: '',
    phone: '', alternatePhone: '', email: '', address: '', permanentAddress: '',
    // KYC
    aadhaarNo: '', panNo: '', voterIdNo: '', kycVerified: false,
    // Employment (HPSEBL)
    employeeNo: '', designation: '', circle: '', division: '', subDivision: '',
    officeLocation: '', joiningDate: '', retirementAge: 58, retirementDate: '',
    // Membership & Shares
    membershipId: '', admissionDate: '', sharesCount: '', shareValue: '',
    // Nominee
    nomineeName: '', nomineeRelation: '', nomineeContact: '', nomineeAadhaar: '',
    // Banking
    bankName: '', branchName: '', accountNumber: '', confirmAccountNumber: '', ifscCode: '', upiId: '',
  })

  const [previewPhoto, setPreviewPhoto] = useState(avatar8)
  const [photoFile, setPhotoFile] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingProfile, setIsFetchingProfile] = useState(true)

  // ── ID SCANNER ──
  const [scanModalVisible, setScanModalVisible] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanPreview, setScanPreview] = useState(null)

  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const idScanInputRef = useRef(null)
  const idCameraInputRef = useRef(null)

  // ── ORG STRUCTURE ──
  const circles = Object.keys(hpseblOrgStructure)
  const divisions = formData.circle ? Object.keys(hpseblOrgStructure[formData.circle] || {}) : []
  const subDivisions = formData.division && formData.circle
    ? (hpseblOrgStructure[formData.circle]?.[formData.division] || [])
    : []

  // ── LOAD PROFILE ──
  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken')
      if (!token) { setIsFetchingProfile(false); return }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const u = data.user || data
          const userDob = u.dob ? new Date(u.dob).toISOString().split('T')[0]
            : (u.dateOfBirth ? new Date(u.dateOfBirth).toISOString().split('T')[0] : '')
          const userRetAge = u.retirementAge ? Number(u.retirementAge) : 58
          let userRetDate = u.retirementDate ? new Date(u.retirementDate).toISOString().split('T')[0]
            : (u.dateOfRetirement ? new Date(u.dateOfRetirement).toISOString().split('T')[0] : '')

          // Auto-calculate if retirement date was not saved but DOB is present
          if (!userRetDate && userDob) {
            userRetDate = calculateRetirementDate(userDob, userRetAge)
          }

          const existingAcc = u.accountNumber || u.bankAccountNumber || ''

          setFormData((prev) => ({
            ...prev,
            name: u.name || '',
            fatherName: u.fatherName || '',
            dob: userDob,
            gender: u.gender || '',
            bloodGroup: u.bloodGroup || '',
            phone: u.phone || u.phoneNumber || '',
            alternatePhone: u.alternatePhone || '',
            email: u.email || u.emailId || '',
            address: u.address || '',
            permanentAddress: u.permanentAddress || '',
            // KYC — mask Aadhaar if full 12 digits are stored
            aadhaarNo: u.aadhaarNo
              ? (u.aadhaarNo.replace(/\D/g, '').length === 12
                  ? '****-****-' + u.aadhaarNo.slice(-4)
                  : u.aadhaarNo)
              : (u.aadharNumber
                  ? (u.aadharNumber.replace(/\D/g, '').length === 12
                      ? '****-****-' + u.aadharNumber.slice(-4)
                      : u.aadharNumber)
                  : ''),
            panNo: u.panNo || u.panNumber || '',
            voterIdNo: u.voterIdNo || '',
            kycVerified: u.kycVerified || false,
            // Employment
            employeeNo: u.vendorNo || '',
            designation: u.designation || '',
            circle: u.circle || '',
            division: u.division || '',
            subDivision: u.subDivision || '',
            officeLocation: u.officeLocation || '',
            joiningDate: u.joiningDate ? new Date(u.joiningDate).toISOString().split('T')[0]
              : (u.dateOfJoining ? new Date(u.dateOfJoining).toISOString().split('T')[0] : ''),
            retirementAge: userRetAge,
            retirementDate: userRetDate,
            // Membership
            membershipId: u.membershipId || '',
            admissionDate: u.admissionDate ? new Date(u.admissionDate).toISOString().split('T')[0] : '',
            sharesCount: u.sharesCount || '',
            shareValue: u.shareValue || '',
            // Nominee
            nomineeName: u.nomineeName || '',
            nomineeRelation: u.nomineeRelation || u.nomineeRelationship || '',
            nomineeContact: u.nomineeContact || u.nomineePhone || '',
            nomineeAadhaar: u.nomineeAadhaar || '',
            // Banking
            bankName: u.bankName || '',
            branchName: u.branchName || '',
            accountNumber: existingAcc,
            confirmAccountNumber: existingAcc,
            ifscCode: u.ifscCode || '',
            upiId: u.upiId || '',
          }))
          if (u.profilePictureUrl) setPreviewPhoto(u.profilePictureUrl)
        }
      } catch (e) { console.error('Profile fetch error:', e) }
      finally { setIsFetchingProfile(false) }
    }
    fetchProfile()
  }, [])

  const handleChange = (key, value) => {
    setFormData((p) => {
      const updated = { ...p, [key]: value }

      // When DOB or Retirement Age changes, dynamically re-calculate Retirement Date
      if (key === 'dob' || key === 'retirementAge') {
        const targetDob = key === 'dob' ? value : p.dob
        const targetAge = key === 'retirementAge' ? Number(value) : (p.retirementAge || 58)
        if (targetDob) {
          updated.retirementDate = calculateRetirementDate(targetDob, targetAge)
        }
      }
      return updated
    })
  }

  // ── IFSC AUTO-FILL & VALIDATION ──
  const handleIfscChange = async (e) => {
    const code = e.target.value.toUpperCase().trim()
    handleChange('ifscCode', code)
    if (code.length === 11 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${code}`)
        if (res.ok) {
          const d = await res.json()
          setFormData((p) => ({ ...p, bankName: d.BANK || '', branchName: d.BRANCH || '' }))
          setMessage({ type: 'success', text: `✅ Verified IFSC: ${d.BANK} (${d.BRANCH})` })
        } else {
          setMessage({ type: 'warning', text: '⚠️ IFSC code not found in National Clearing Database.' })
        }
      } catch (err) { console.error(err) }
    }
  }

  // Helper for quick UPI handle appending
  const handleAppendUpiSuffix = (suffix) => {
    let current = (formData.upiId || '').trim()
    if (current.includes('@')) {
      current = current.split('@')[0]
    }
    if (!current) {
      current = (formData.phone || formData.name?.split(' ')[0]?.toLowerCase() || 'user')
    }
    handleChange('upiId', `${current}${suffix}`)
  }

  // ── PHOTO SELECTION ──
  const handlePhotoSelection = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPreviewPhoto(URL.createObjectURL(file))
  }

  // ── ID CARD SCAN ──
  const handleIDScan = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsScanning(true)
    setScanProgress(0)
    setScanResult(null)
    setScanPreview(URL.createObjectURL(file))
    setScanModalVisible(true)
    try {
      const result = await scanIDCard(file, (pct) => setScanProgress(pct))
      setScanResult(result)
    } catch (err) {
      console.error('OCR Error:', err)
      setMessage({ type: 'danger', text: 'OCR scan failed. Please try a clearer image.' })
      setScanModalVisible(false)
    } finally { setIsScanning(false) }
  }

  // ── AUTO-FILL FROM SCAN ──
  const handleAutoFill = () => {
    if (!scanResult) return
    setFormData((prev) => ({
      ...prev,
      name: scanResult.name || prev.name,
      fatherName: scanResult.fatherName || prev.fatherName,
      dob: scanResult.dob || prev.dob,
      gender: scanResult.gender || prev.gender,
      bloodGroup: scanResult.bloodGroup || prev.bloodGroup,
      address: scanResult.address || prev.address,
      aadhaarNo: scanResult.aadhaarNo || prev.aadhaarNo,
      panNo: scanResult.panNo || prev.panNo,
      voterIdNo: scanResult.voterIdNo || prev.voterIdNo,
      employeeNo: scanResult.employeeNo || prev.employeeNo,
      designation: scanResult.designation || prev.designation,
      circle: scanResult.circle || prev.circle,
      division: scanResult.division || prev.division,
    }))
    setScanModalVisible(false)
    setMessage({ type: 'success', text: `✅ ${CARD_TYPE_LABELS[scanResult.cardType] || 'ID'} data auto-filled! Please review and correct before saving.` })
    setActiveTab(1) // Navigate to Personal tab
  }

  // ── SUBMIT ──
  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage({ type: '', text: '' })
    try {
      let finalImageUrl = previewPhoto
      if (photoFile) {
        const fd = new FormData()
        fd.append('file', photoFile)
        fd.append('upload_preset', 'ml_default')
        fd.append('cloud_name', 'wh9h0wvu')
        const cr = await fetch('https://api.cloudinary.com/v1_1/wh9h0wvu/image/upload', { method: 'POST', body: fd })
        const cd = await cr.json()
        if (cd.secure_url) finalImageUrl = cd.secure_url
      }
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token')
      const payload = { ...formData, profilePictureUrl: finalImageUrl }
      const res = await fetch(`${API_BASE_URL}/api/auth/profile/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Profile updated successfully!' })
        localStorage.setItem('userName', data.user?.name || formData.name)
        if (data.user?.profilePictureUrl) localStorage.setItem('userAvatar', data.user.profilePictureUrl)
        window.dispatchEvent(new Event('profileUpdated'))
      } else {
        setMessage({ type: 'danger', text: data.message || 'Error updating profile.' })
      }
    } catch (err) {
      console.error(err)
      setMessage({ type: 'danger', text: 'Server error. Please try again.' })
    } finally { setIsLoading(false) }
  }

  // ── TAB CONFIG ──
  const tabs = [
    { id: 1, icon: cilUser, label: 'Personal' },
    { id: 2, icon: cilShieldAlt, label: 'KYC / Identity' },
    { id: 3, icon: cilBriefcase, label: 'Employment' },
    { id: 4, icon: cilStar, label: 'Membership & Shares' },
    { id: 5, icon: cilPeople, label: 'Nominee' },
    { id: 6, icon: cilBank, label: 'Banking' },
  ]

  if (isFetchingProfile) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <CSpinner color="primary" />
        <span className="ms-3 text-muted">Loading profile...</span>
      </div>
    )
  }

  return (
    <>
      {/* ── ID SCAN MODAL ── */}
      <CModal size="lg" visible={scanModalVisible} onClose={() => !isScanning && setScanModalVisible(false)} alignment="center">
        <CModalHeader>
          <CModalTitle>🔍 ID Card OCR Scanner</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {scanPreview && (
            <div className="text-center mb-3">
              <img src={scanPreview} alt="ID Preview" style={{ maxHeight: 240, maxWidth: '100%', borderRadius: 8, border: '2px solid #e2e8f0' }} />
            </div>
          )}
          {isScanning && (
            <div className="mb-3">
              <div className="d-flex justify-content-between small text-muted mb-1">
                <span>Scanning & extracting fields…</span>
                <span>{scanProgress}%</span>
              </div>
              <CProgress value={scanProgress} color="primary" animated />
              <div className="text-muted small mt-2 text-center">
                {scanProgress < 15 ? 'Preprocessing image…' : scanProgress < 90 ? 'Running OCR on document…' : 'Parsing fields…'}
              </div>
            </div>
          )}
          {scanResult && !isScanning && (
            <>
              <CAlert color="success" className="py-2 mb-3">
                Detected: <strong>{CARD_TYPE_LABELS[scanResult.cardType]}</strong>. Review fields below then click "Auto-Fill Profile".
              </CAlert>
              <div className="row g-2">
                {[
                  { label: 'Name', val: scanResult.name },
                  { label: "Father's Name", val: scanResult.fatherName },
                  { label: 'Date of Birth', val: scanResult.dob },
                  { label: 'Gender', val: scanResult.gender },
                  { label: 'Blood Group', val: scanResult.bloodGroup },
                  { label: 'Aadhaar No', val: scanResult.aadhaarNo },
                  { label: 'PAN No', val: scanResult.panNo },
                  { label: 'Voter ID', val: scanResult.voterIdNo },
                  { label: 'Employee No', val: scanResult.employeeNo },
                  { label: 'Designation', val: scanResult.designation },
                  { label: 'Circle', val: scanResult.circle },
                  { label: 'Division', val: scanResult.division },
                  { label: 'Address', val: scanResult.address },
                ].filter((f) => f.val).map((field) => (
                  <div key={field.label} className="col-md-6">
                    <div className="p-2 rounded" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <div className="text-muted" style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>{field.label}</div>
                      <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{field.val}</div>
                    </div>
                  </div>
                ))}
              </div>
              {Object.values(scanResult).filter(Boolean).length <= 3 && (
                <CAlert color="warning" className="mt-3 py-2 small">
                  Few fields detected. Please try a clearer, well-lit photo of your ID card.
                </CAlert>
              )}
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={() => setScanModalVisible(false)} disabled={isScanning}>
            <CIcon icon={cilBan} className="me-1" /> Cancel
          </CButton>
          {scanResult && !isScanning && (
            <CButton color="primary" onClick={handleAutoFill}>
              <CIcon icon={cilCheckCircle} className="me-2" />
              ✅ Auto-Fill Profile
            </CButton>
          )}
        </CModalFooter>
      </CModal>

      {/* ── HIDDEN FILE INPUTS ── */}
      <input type="file" accept="image/*" ref={galleryInputRef} className="d-none" onChange={handlePhotoSelection} />
      <input type="file" accept="image/*" capture="user" ref={cameraInputRef} className="d-none" onChange={handlePhotoSelection} />
      <input type="file" accept="image/*" ref={idScanInputRef} className="d-none" onChange={handleIDScan} />
      <input type="file" accept="image/*" capture="environment" ref={idCameraInputRef} className="d-none" onChange={handleIDScan} />

      <CRow>
        <CCol xs={12} xl={11} className="mx-auto">

          {/* ── HEADER CARD ── */}
          <CCard className="shadow-sm border-0 mb-4">
            <CCardBody className="p-4">
              <div className="d-flex align-items-center gap-4 flex-wrap">
                {/* Avatar */}
                <div className="position-relative" style={{ flexShrink: 0 }}>
                  <img
                    src={previewPhoto}
                    alt="Profile"
                    className="rounded-circle"
                    style={{ width: 110, height: 110, objectFit: 'cover', border: '4px solid var(--app-primary, #0a6ed1)' }}
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current.click()}
                    style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--app-primary, #0a6ed1)', border: '2px solid white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Change Photo"
                  >
                    <CIcon icon={cilCamera} size="sm" style={{ color: 'white' }} />
                  </button>
                </div>

                {/* Info */}
                <div className="flex-grow-1">
                  <h4 className="fw-bold mb-1">{formData.name || 'Member Name'}</h4>
                  <div className="text-muted mb-2">
                    {formData.designation || 'HPSEBL Employee'} {formData.circle && `• ${formData.circle}`}
                  </div>
                  <div className="d-flex flex-wrap gap-3 text-muted small">
                    {formData.employeeNo && <span>🏢 Vendor: <strong>{formData.employeeNo}</strong></span>}
                    {formData.designation && <span>💼 {formData.designation}</span>}
                    {formData.division && <span>📍 {formData.division}</span>}
                    {formData.retirementDate && (
                      <span className="text-primary fw-semibold">
                        🏁 Retires: {new Date(formData.retirementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* ID SCAN BUTTONS */}
                <div className="d-flex gap-2">
                  <input
                    type="file"
                    ref={idScanInputRef}
                    onChange={handleIDScan}
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file"
                    ref={idCameraInputRef}
                    onChange={handleIDScan}
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                  />
                  <CButton
                    color="primary"
                    variant="outline"
                    size="sm"
                    onClick={() => idScanInputRef.current.click()}
                    className="fw-semibold"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <CIcon icon={cilQrCode} className="me-2" />
                    📇 Scan ID Card
                  </CButton>
                  <CButton
                    color="secondary"
                    variant="outline"
                    size="sm"
                    onClick={() => idCameraInputRef.current.click()}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <CIcon icon={cilCamera} className="me-2" />
                    Capture with Camera
                  </CButton>
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* ── ALERT ── */}
      {message.text && (
        <CAlert color={message.type} className="mb-4" dismissible onClose={() => setMessage({ type: '', text: '' })}>
          {message.text}
        </CAlert>
      )}

      {/* ── MAIN TABBED FORM ── */}
      <CCard className="shadow-sm border-0">
        <CCardBody className="p-0">
          <CNav variant="tabs" className="px-3 pt-3 bg-light border-bottom">
            {tabs.map((t) => (
              <CNavItem key={t.id}>
                <CNavLink
                  active={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{ cursor: 'pointer', fontWeight: activeTab === t.id ? 700 : 500, fontSize: '0.85rem' }}
                >
                  <CIcon icon={t.icon} className="me-2" size="sm" />{t.label}
                </CNavLink>
              </CNavItem>
            ))}
          </CNav>

          <form onSubmit={handleSubmit}>
            <CTabContent className="p-4">

              {/* ── TAB 1: PERSONAL ── */}
              <CTabPane visible={activeTab === 1}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">👤 Personal Information & Date of Birth</h5>
                <CRow className="g-3">
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Full Name</CFormLabel>
                    <CFormInput
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="As per official records"
                      className="shadow-none"
                    />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Father's / Husband's Name</CFormLabel>
                    <CFormInput
                      value={formData.fatherName}
                      onChange={(e) => handleChange('fatherName', e.target.value)}
                      placeholder="Father or husband name"
                      className="shadow-none"
                    />
                  </CCol>

                  {/* DATE OF BIRTH & RETIREMENT SERVICE PERIOD */}
                  <CCol md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-0">Date of Birth</CFormLabel>
                      {formData.dob && (
                        <span className="badge bg-light text-dark border">
                          {getAgeDisplay(formData.dob)}
                        </span>
                      )}
                    </div>
                    <CFormInput
                      type="date"
                      value={formData.dob}
                      onChange={(e) => handleChange('dob', e.target.value)}
                      className="shadow-none"
                    />
                  </CCol>

                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">
                      Service Period (Retirement Age)
                    </CFormLabel>
                    <CFormSelect
                      value={formData.retirementAge || 58}
                      onChange={(e) => handleChange('retirementAge', Number(e.target.value))}
                      className="shadow-none"
                    >
                      <option value={58}>58 Years (Standard HPSEBL Service)</option>
                      <option value={60}>60 Years (Extended Service Age)</option>
                    </CFormSelect>
                  </CCol>

                  {/* AUTO-CALCULATED RETIREMENT BANNER IN PERSONAL TAB */}
                  {formData.dob && formData.retirementDate && (
                    <CCol xs={12}>
                      <div
                        className="p-3 rounded d-flex align-items-center justify-content-between flex-wrap gap-2"
                        style={{ background: '#f0fdf4', border: '1px solid #86efac' }}
                      >
                        <div>
                          <strong className="text-success">🏁 Auto-Calculated Date of Retirement: </strong>
                          <span className="fw-bold fs-6 text-dark ms-1">
                            {new Date(formData.retirementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </span>
                          <div className="text-muted small mt-1">
                            ℹ️ Retires on the last day of the birth month upon completing {formData.retirementAge || 58} years of service.
                          </div>
                        </div>
                        <span className="badge bg-success bg-opacity-10 text-success border border-success px-3 py-2">
                          {getRemainingServiceText(formData.retirementDate)}
                        </span>
                      </div>
                    </CCol>
                  )}

                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Gender</CFormLabel>
                    <CFormSelect value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} className="shadow-none">
                      <option value="">Select Gender...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </CFormSelect>
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Blood Group</CFormLabel>
                    <CFormSelect value={formData.bloodGroup} onChange={(e) => handleChange('bloodGroup', e.target.value)} className="shadow-none">
                      <option value="">Select Blood Group...</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </CFormSelect>
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Mobile Number</CFormLabel>
                    <CFormInput
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile"
                      maxLength={10}
                      className="shadow-none"
                    />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Alternate Phone</CFormLabel>
                    <CFormInput
                      type="tel"
                      value={formData.alternatePhone}
                      onChange={(e) => handleChange('alternatePhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Optional"
                      maxLength={10}
                      className="shadow-none"
                    />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Email Address</CFormLabel>
                    <CFormInput
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="official or personal email"
                      className="shadow-none"
                    />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Residential Address</CFormLabel>
                    <CFormInput
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Full current address"
                      className="shadow-none"
                    />
                  </CCol>
                  <CCol xs={12}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Permanent Address</CFormLabel>
                    <CFormInput
                      value={formData.permanentAddress}
                      onChange={(e) => handleChange('permanentAddress', e.target.value)}
                      placeholder="If different from residential address"
                      className="shadow-none"
                    />
                  </CCol>
                </CRow>
              </CTabPane>

              {/* ── TAB 2: KYC / IDENTITY ── */}
              <CTabPane visible={activeTab === 2}>
                <div className="d-flex align-items-center justify-content-between mb-4 border-bottom pb-2">
                  <h5 className="fw-bold mb-0">🪪 KYC & Identity Documents</h5>
                  {isAdmin && (
                    <div className="d-flex align-items-center gap-2">
                      <span className="small text-muted">KYC Status:</span>
                      <CButton
                        size="sm"
                        color={formData.kycVerified ? 'success' : 'warning'}
                        onClick={() => handleChange('kycVerified', !formData.kycVerified)}
                        className="fw-bold px-3"
                      >
                        {formData.kycVerified ? '✅ Mark Unverified' : '⚠️ Mark as Verified'}
                      </CButton>
                    </div>
                  )}
                </div>
                <CAlert color="info" className="py-2 small mb-4">
                  <CIcon icon={cilShieldAlt} className="me-2" />
                  Identity numbers are encrypted and masked for security. Only last 4 digits of Aadhaar are displayed.
                </CAlert>
                <CRow className="g-3">
                  {[
                    { label: 'Aadhaar Number (last 4 visible)', key: 'aadhaarNo', placeholder: 'XXXX-XXXX-XXXX' },
                    { label: 'PAN Number', key: 'panNo', placeholder: 'AAAAA9999A' },
                    { label: 'Voter ID Number', key: 'voterIdNo', placeholder: 'e.g. ABC1234567' },
                  ].map(({ label, key, placeholder }) => (
                    <CCol md={6} key={key}>
                      <CFormLabel className="fw-semibold small text-muted text-uppercase">{label}</CFormLabel>
                      <CFormInput
                        value={formData[key]}
                        onChange={(e) => handleChange(key, e.target.value.toUpperCase())}
                        placeholder={placeholder}
                        className="shadow-none text-uppercase"
                        readOnly={!isAdmin && key === 'aadhaarNo'}
                      />
                    </CCol>
                  ))}
                </CRow>
                <div className="mt-4 p-3 rounded" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div className="fw-bold mb-1">📇 Scan ID Card for Quick Fill</div>
                  <div className="text-muted small mb-2">
                    Supported: <strong>HPSEBL Departmental ID, Aadhaar, PAN Card, Voter ID</strong>. The system will extract all available fields automatically.
                  </div>
                  <div className="d-flex gap-2">
                    <CButton size="sm" color="success" variant="outline" onClick={() => idScanInputRef.current.click()}>
                      <CIcon icon={cilCloudUpload} className="me-1" /> Upload ID Card
                    </CButton>
                    <CButton size="sm" color="primary" variant="outline" onClick={() => idCameraInputRef.current.click()}>
                      <CIcon icon={cilCamera} className="me-1" /> Capture with Camera
                    </CButton>
                  </div>
                </div>
              </CTabPane>

              {/* ── TAB 3: EMPLOYMENT ── */}
              <CTabPane visible={activeTab === 3}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">🏢 HPSEBL Employment & Service Timeline</h5>
                <CRow className="g-3">
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Employee / Vendor No</CFormLabel>
                    <CFormInput value={formData.employeeNo} onChange={(e) => handleChange('employeeNo', e.target.value)} readOnly={!isAdmin} className="shadow-none" />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Designation</CFormLabel>
                    <CFormInput value={formData.designation} onChange={(e) => handleChange('designation', e.target.value)} readOnly={!isAdmin} className="shadow-none" placeholder="e.g. Junior Engineer" />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Operation Circle</CFormLabel>
                    <CFormSelect value={formData.circle} onChange={(e) => handleChange('circle', e.target.value)} disabled={!isAdmin} className="shadow-none">
                      <option value="">Select Circle...</option>
                      {circles.map((c) => <option key={c} value={c}>{c}</option>)}
                    </CFormSelect>
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Division</CFormLabel>
                    <CFormSelect value={formData.division} onChange={(e) => handleChange('division', e.target.value)} disabled={!isAdmin || !formData.circle} className="shadow-none">
                      <option value="">Select Division...</option>
                      {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
                    </CFormSelect>
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Sub-Division</CFormLabel>
                    <CFormSelect value={formData.subDivision} onChange={(e) => handleChange('subDivision', e.target.value)} disabled={!isAdmin || !formData.division} className="shadow-none">
                      <option value="">Select Sub-Division...</option>
                      {subDivisions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </CFormSelect>
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Office Location</CFormLabel>
                    <CFormInput value={formData.officeLocation} onChange={(e) => handleChange('officeLocation', e.target.value)} className="shadow-none" placeholder="e.g. Shimla City Division" />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Date of Joining</CFormLabel>
                    <CFormInput type="date" value={formData.joiningDate} onChange={(e) => handleChange('joiningDate', e.target.value)} readOnly={!isAdmin} className="shadow-none" />
                  </CCol>
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">
                      Date of Retirement (Auto-Calculated)
                    </CFormLabel>
                    <CFormInput
                      type="date"
                      value={formData.retirementDate}
                      onChange={(e) => handleChange('retirementDate', e.target.value)}
                      readOnly={!isAdmin}
                      className="shadow-none bg-light"
                    />
                    {formData.retirementDate && (
                      <div className="small text-primary fw-semibold mt-1">
                        {getRemainingServiceText(formData.retirementDate)}
                      </div>
                    )}
                  </CCol>
                </CRow>
              </CTabPane>

              {/* ── TAB 4: MEMBERSHIP & SHARES ── */}
              <CTabPane visible={activeTab === 4}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">⭐ Society Membership & Share Capital</h5>
                <CRow className="g-3">
                  {[
                    { label: 'Membership / Society ID', key: 'membershipId', editable: isAdmin },
                    { label: 'Date of Admission', key: 'admissionDate', type: 'date', editable: isAdmin },
                    { label: 'Number of Shares Held', key: 'sharesCount', type: 'number', placeholder: 'e.g. 500', editable: isAdmin },
                    { label: 'Share Face Value (₹ per share)', key: 'shareValue', type: 'number', placeholder: 'e.g. 10', editable: isAdmin },
                  ].map(({ label, key, type = 'text', placeholder = '', editable = true }) => (
                    <CCol md={6} key={key}>
                      <CFormLabel className="fw-semibold small text-muted text-uppercase">{label}</CFormLabel>
                      <CFormInput
                        type={type}
                        value={formData[key]}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={placeholder}
                        readOnly={!editable}
                        className="shadow-none"
                      />
                    </CCol>
                  ))}
                  {formData.sharesCount && formData.shareValue && (
                    <CCol xs={12}>
                      <div className="p-3 rounded mt-2" style={{ background: 'var(--app-primary-light, #e8f2fc)', border: '1px solid var(--app-primary, #0a6ed1)' }}>
                        <strong>Total Share Capital: </strong>
                        <span className="fs-5 fw-bold" style={{ color: 'var(--app-primary, #0a6ed1)' }}>
                          ₹ {(parseInt(formData.sharesCount || 0) * parseFloat(formData.shareValue || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </CCol>
                  )}
                </CRow>
              </CTabPane>

              {/* ── TAB 5: NOMINEE ── */}
              <CTabPane visible={activeTab === 5}>
                <h5 className="fw-bold mb-4 border-bottom pb-2">👨‍👩‍👧 Nominee Details</h5>
                <CRow className="g-3">
                  {[
                    { label: 'Nominee Full Name', key: 'nomineeName', placeholder: 'Full legal name' },
                    { label: 'Relationship', key: 'nomineeRelation', type: 'select', options: ['', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'] },
                    { label: 'Nominee Contact', key: 'nomineeContact', type: 'tel', placeholder: '10-digit mobile' },
                    { label: 'Nominee Aadhaar No', key: 'nomineeAadhaar', placeholder: 'XXXX-XXXX-XXXX' },
                  ].map(({ label, key, type = 'text', placeholder = '', options }) => (
                    <CCol md={6} key={key}>
                      <CFormLabel className="fw-semibold small text-muted text-uppercase">{label}</CFormLabel>
                      {type === 'select' ? (
                        <CFormSelect value={formData[key]} onChange={(e) => handleChange(key, e.target.value)} className="shadow-none">
                          {options.map((o) => <option key={o} value={o}>{o || `Select ${label}`}</option>)}
                        </CFormSelect>
                      ) : (
                        <CFormInput
                          type={type}
                          value={formData[key]}
                          onChange={(e) => handleChange(key, e.target.value)}
                          placeholder={placeholder}
                          className="shadow-none"
                        />
                      )}
                    </CCol>
                  ))}
                </CRow>
              </CTabPane>

              {/* ── TAB 6: BANKING ── */}
              <CTabPane visible={activeTab === 6}>
                <div className="d-flex align-items-center justify-content-between mb-4 border-bottom pb-2">
                  <h5 className="fw-bold mb-0">🏦 Banking Coordinates & UPI Validation</h5>
                  <span className="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-1">
                    🔒 Verified Payout Channel
                  </span>
                </div>

                <CRow className="g-3">
                  {/* IFSC CODE */}
                  <CCol md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-0">
                        IFSC Code
                      </CFormLabel>
                      {formData.ifscCode && (
                        <span className={`badge ${/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode) ? 'bg-success' : 'bg-warning text-dark'}`}>
                          {/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode) ? '✓ 11-char Format Valid' : '11 chars required'}
                        </span>
                      )}
                    </div>
                    <CFormInput
                      value={formData.ifscCode}
                      onChange={handleIfscChange}
                      placeholder="e.g. SBIN0000718"
                      maxLength={11}
                      className="shadow-none text-uppercase fw-bold"
                    />
                    <div className="text-muted small mt-1">Auto-fetches Bank Name & Branch from RBI clearing directory.</div>
                  </CCol>

                  {/* BANK NAME */}
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Bank Name</CFormLabel>
                    <CFormInput value={formData.bankName} readOnly className="shadow-none bg-light fw-semibold" placeholder="Auto-filled from IFSC" />
                  </CCol>

                  {/* BRANCH NAME */}
                  <CCol md={6}>
                    <CFormLabel className="fw-semibold small text-muted text-uppercase">Branch Name</CFormLabel>
                    <CFormInput value={formData.branchName} readOnly className="shadow-none bg-light" placeholder="Auto-filled from IFSC" />
                  </CCol>

                  {/* ACCOUNT NUMBER */}
                  <CCol md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-0">
                        Bank Account Number
                      </CFormLabel>
                      {formData.accountNumber && (
                        <span className={`badge ${/^\d{9,18}$/.test(formData.accountNumber) ? 'bg-success' : 'bg-danger'}`}>
                          {/^\d{9,18}$/.test(formData.accountNumber)
                            ? `✓ ${formData.accountNumber.length} Digits (Valid)`
                            : `${formData.accountNumber.length}/18 (Min 9 digits)`}
                        </span>
                      )}
                    </div>
                    <CFormInput
                      value={formData.accountNumber}
                      onChange={(e) => handleChange('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="Enter 9 to 18 digit account number"
                      className="shadow-none fw-bold"
                      maxLength={18}
                    />
                    <div className="text-muted small mt-1">Must be 9 to 18 digits as per Indian banking standards.</div>
                  </CCol>

                  {/* CONFIRM ACCOUNT NUMBER */}
                  <CCol md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-0">
                        Confirm Account Number
                      </CFormLabel>
                      {formData.confirmAccountNumber && (
                        <span className={`badge ${formData.accountNumber === formData.confirmAccountNumber ? 'bg-success' : 'bg-danger'}`}>
                          {formData.accountNumber === formData.confirmAccountNumber ? '✅ Numbers Match' : '❌ Numbers Do Not Match'}
                        </span>
                      )}
                    </div>
                    <CFormInput
                      value={formData.confirmAccountNumber}
                      onChange={(e) => handleChange('confirmAccountNumber', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="Re-enter bank account number"
                      className="shadow-none"
                      maxLength={18}
                    />
                  </CCol>

                  {/* UPI ID */}
                  <CCol md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <CFormLabel className="fw-semibold small text-muted text-uppercase mb-0">
                        UPI ID (VPA)
                      </CFormLabel>
                      {formData.upiId && (
                        <span className={`badge ${/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(formData.upiId) ? 'bg-success' : 'bg-warning text-dark'}`}>
                          {/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(formData.upiId) ? '✓ Valid UPI Handle' : 'Invalid format'}
                        </span>
                      )}
                    </div>
                    <CFormInput
                      value={formData.upiId}
                      onChange={(e) => handleChange('upiId', e.target.value.trim().toLowerCase())}
                      placeholder="e.g. 9876543210@paytm or name@sbi"
                      className="shadow-none"
                    />

                    {/* Quick Handle Chips */}
                    <div className="d-flex flex-wrap gap-1 align-items-center mt-2">
                      <span className="small text-muted me-1">Quick Handles:</span>
                      {['@sbi', '@okhdfcbank', '@okaxis', '@paytm', '@ybl', '@icici', '@upi'].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => handleAppendUpiSuffix(h)}
                          className="btn btn-sm btn-light border py-0 px-2 small text-primary fw-semibold"
                          style={{ fontSize: '0.75rem', borderRadius: '12px' }}
                        >
                          +{h}
                        </button>
                      ))}
                    </div>
                  </CCol>
                </CRow>
              </CTabPane>

            </CTabContent>

            {/* ── SAVE BUTTON ── */}
            <div className="d-flex justify-content-end align-items-center px-4 pb-4 border-top pt-4">
              <CButton type="submit" color="primary" className="fw-bold px-5" disabled={isLoading}>
                {isLoading ? <CSpinner size="sm" className="me-2" /> : null}
                {isLoading ? 'Saving...' : '💾 Save Profile'}
              </CButton>
            </div>
          </form>
        </CCardBody>
      </CCard>
    </>
  )
}
