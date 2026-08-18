import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CButton,
  CCard,
  CCardBody,
  CCardGroup,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
  CSpinner,
  CAlert,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilUser, cilShieldAlt } from '@coreui/icons'

import API_BASE_URL from '../../../apiConfig'

const Login = () => {
  const navigate = useNavigate()
  const [vendorNo, setVendorNo] = useState('')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState('member')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vendorNo: vendorNo.trim(), password: password, loginRole: loginRole }),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('adminToken', data.token)
        localStorage.setItem('token', data.token)

        if (data.user.name) {
          localStorage.setItem('userName', data.user.name)
        }
        if (data.user.profilePictureUrl) {
          localStorage.setItem('userAvatar', data.user.profilePictureUrl)
        }
        if (data.user.role) {
          localStorage.setItem('userRole', data.user.role)
        }

        if (data.user.requiresPasswordChange === true) {
          navigate('/setup-password')
        } else {
          navigate('/dashboard')
        }
      } else {
        setErrorMessage(data.error || data.message || 'Login failed. Please verify credentials.')
      }
    } catch (error) {
      setErrorMessage('Unable to connect to the server. Please check your network connection.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-vh-100 d-flex flex-row align-items-center position-relative"
      style={{
        background: 'linear-gradient(135deg, #0b192c 0%, #1e3a8a 35%, #312e81 70%, #1e1b4b 100%)',
        overflow: 'hidden',
      }}
    >
      {/* ── 1. COLORFUL TEXTURED MESH BACKDROP ── */}
      {/* Subtle Geometric Dot Grid Pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(rgba(255, 255, 255, 0.12) 1.2px, transparent 1.2px),
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px, 56px 56px, 56px 56px',
          opacity: 0.85,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Colorful Floating Glow Orbs (Texture & Depth) */}
      {/* Orb 1: Electric Cyan (Top-Left) */}
      <div
        style={{
          position: 'absolute',
          top: '-8%',
          left: '-5%',
          width: '460px',
          height: '460px',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.45) 0%, rgba(59, 130, 246, 0.25) 50%, transparent 70%)',
          filter: 'blur(70px)',
          borderRadius: '50%',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Orb 2: Radiant Golden Amber (Top-Right) */}
      <div
        style={{
          position: 'absolute',
          top: '5%',
          right: '-8%',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.38) 0%, rgba(234, 88, 12, 0.2) 50%, transparent 70%)',
          filter: 'blur(80px)',
          borderRadius: '50%',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Orb 3: Vivid Violet / Magenta (Bottom-Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-12%',
          left: '15%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.35) 0%, rgba(99, 102, 241, 0.2) 55%, transparent 75%)',
          filter: 'blur(90px)',
          borderRadius: '50%',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Orb 4: Emerald Glow (Bottom-Right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '5%',
          width: '380px',
          height: '380px',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.32) 0%, rgba(6, 182, 212, 0.15) 50%, transparent 70%)',
          filter: 'blur(75px)',
          borderRadius: '50%',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* ── 2. LOGIN MODAL WINDOW ── */}
      <CContainer style={{ position: 'relative', zIndex: 10 }}>
        <CRow className="justify-content-center">
          <CCol md={10} lg={9} xl={8}>
            <CCardGroup
              className="shadow-lg"
              style={{
                borderRadius: '1.25rem',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 40px rgba(59, 130, 246, 0.25)',
              }}
            >
              {/* ── LEFT SIDE: LOGIN FORM ── */}
              <CCard
                className="p-4 p-md-5 border-0"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <CCardBody>
                  {/* Mobile Logo & Society Heading */}
                  <div className="text-center mb-4 d-md-none">
                    <div
                      style={{
                        display: 'inline-block',
                        background: '#ffffff',
                        padding: '8px',
                        borderRadius: '50%',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <img src="/logo.png" alt="Logo" style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                    </div>
                    <h4 className="fw-bold mb-1" style={{ color: '#0f172a', letterSpacing: '0.5px' }}>
                      MAHADEV CO-OPERATIVE SOCIETY
                    </h4>
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fcd34d',
                        borderRadius: '12px',
                        padding: '3px 10px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'inline-block',
                      }}
                    >
                      ⚡ HPSEBL Employees Co-op Society
                    </span>
                  </div>

                  <CForm onSubmit={handleLogin}>
                    <div className="mb-4">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span style={{ fontSize: '1.4rem' }}>🔐</span>
                        <h2 className="fw-bold mb-0" style={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
                          Welcome Back
                        </h2>
                      </div>
                      <p className="text-muted small mb-0">Enter your credentials to access your society account</p>
                    </div>

                    {errorMessage && (
                      <CAlert color="danger" className="py-2 px-3 mb-3 small d-flex align-items-center gap-2 shadow-sm">
                        <span>⚠️</span>
                        <div>{errorMessage}</div>
                      </CAlert>
                    )}

                    {/* Vendor No Input */}
                    <div className="mb-3">
                      <label className="form-label text-muted small fw-semibold mb-1">Vendor / Employee Number</label>
                      <CInputGroup className="shadow-sm" style={{ borderRadius: '0.6rem', overflow: 'hidden' }}>
                        <CInputGroupText className="bg-light border-end-0 text-primary px-3">
                          <CIcon icon={cilUser} />
                        </CInputGroupText>
                        <CFormInput
                          className="border-start-0 ps-1"
                          placeholder="e.g. 1045 or Vendor ID"
                          autoComplete="username"
                          value={vendorNo}
                          onChange={(e) => setVendorNo(e.target.value)}
                          required
                          style={{ height: '3rem', boxShadow: 'none', fontSize: '0.95rem' }}
                        />
                      </CInputGroup>
                    </div>

                    {/* Password Input */}
                    <div className="mb-3">
                      <label className="form-label text-muted small fw-semibold mb-1">Password</label>
                      <CInputGroup className="shadow-sm" style={{ borderRadius: '0.6rem', overflow: 'hidden' }}>
                        <CInputGroupText className="bg-light border-end-0 text-primary px-3">
                          <CIcon icon={cilLockLocked} />
                        </CInputGroupText>
                        <CFormInput
                          className="border-start-0 ps-1"
                          type="password"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          style={{ height: '3rem', boxShadow: 'none', fontSize: '0.95rem' }}
                        />
                      </CInputGroup>
                    </div>

                    {/* Role Selector */}
                    <div className="mb-4">
                      <label className="form-label text-muted small fw-semibold mb-1">Access Role</label>
                      <CInputGroup className="shadow-sm" style={{ borderRadius: '0.6rem', overflow: 'hidden' }}>
                        <CInputGroupText className="bg-light border-end-0 text-primary px-3">
                          <CIcon icon={cilShieldAlt} />
                        </CInputGroupText>
                        <select
                          className="form-select border-start-0 ps-1"
                          value={loginRole}
                          onChange={(e) => setLoginRole(e.target.value)}
                          style={{ height: '3rem', boxShadow: 'none', cursor: 'pointer', fontSize: '0.95rem' }}
                        >
                          <option value="member">👤 Member Portal</option>
                          <option value="executive">👔 Executive Member</option>
                          <option value="admin">🛡️ System Administrator</option>
                        </select>
                      </CInputGroup>
                    </div>

                    {/* Submit Button */}
                    <CRow>
                      <CCol xs={12}>
                        <CButton
                          type="submit"
                          disabled={isLoading}
                          className="w-100 fw-bold border-0 shadow text-white d-flex align-items-center justify-content-center"
                          style={{
                            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #0284c7 100%)',
                            height: '3.1rem',
                            borderRadius: '0.6rem',
                            fontSize: '1rem',
                            letterSpacing: '0.5px',
                            transition: 'all 0.25s ease',
                          }}
                        >
                          {isLoading ? (
                            <>
                              <CSpinner size="sm" className="me-2" />
                              Authenticating...
                            </>
                          ) : (
                            'Secure Sign In →'
                          )}
                        </CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </CCardBody>
              </CCard>

              {/* ── RIGHT SIDE: SOCIETY BRANDING BANNER ── */}
              <CCard
                className="text-white border-0 d-none d-md-flex"
                style={{
                  width: '46%',
                  background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 58, 138, 0.94) 50%, rgba(30, 27, 75, 0.96) 100%)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Decorative glowing highlights within card */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-20%',
                    right: '-20%',
                    width: '240px',
                    height: '240px',
                    background: 'radial-gradient(circle, rgba(245, 158, 11, 0.3) 0%, transparent 70%)',
                    filter: 'blur(50px)',
                    borderRadius: '50%',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-15%',
                    left: '-15%',
                    width: '220px',
                    height: '220px',
                    background: 'radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, transparent 70%)',
                    filter: 'blur(50px)',
                    borderRadius: '50%',
                  }}
                />

                <CCardBody className="text-center d-flex flex-column justify-content-center align-items-center p-4 p-lg-5 position-relative z-index-2">
                  {/* Society Logo with Glowing Border */}
                  <div
                    style={{
                      background: 'radial-gradient(circle, #ffffff 70%, #f1f5f9 100%)',
                      padding: '8px',
                      borderRadius: '50%',
                      marginBottom: '1.25rem',
                      boxShadow: '0 0 0 4px rgba(253, 224, 71, 0.4), 0 12px 35px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '130px',
                      height: '130px',
                      transition: 'transform 0.3s ease',
                    }}
                  >
                    <img
                      src="/logo.png"
                      alt="Society Logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
                    />
                  </div>

                  {/* HIGH-VISIBILITY SOCIETY NAME */}
                  <h3
                    className="fw-bold mb-2"
                    style={{
                      color: '#FFFFFF',
                      fontSize: '1.35rem',
                      letterSpacing: '0.8px',
                      textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 20px rgba(59, 130, 246, 0.4)',
                    }}
                  >
                    MAHADEV CO-OPERATIVE SOCIETY
                  </h3>

                  {/* VIBRANT HIGH-CONTRAST DEPARTMENT SUBTITLE */}
                  <div
                    style={{
                      background: 'linear-gradient(90deg, rgba(253, 224, 71, 0.18), rgba(250, 204, 21, 0.28))',
                      border: '1px solid rgba(253, 224, 71, 0.6)',
                      color: '#FEF08A',
                      borderRadius: '20px',
                      padding: '5px 14px',
                      fontWeight: '700',
                      fontSize: '0.82rem',
                      letterSpacing: '0.4px',
                      boxShadow: '0 4px 15px rgba(250, 204, 21, 0.18)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <span>⚡</span>
                    <span>HPSEBL, Shimla — Employees Society</span>
                  </div>

                  {/* Decorative divider */}
                  <div
                    style={{
                      width: '60px',
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, #fde047, transparent)',
                      margin: '0 auto 1.25rem auto',
                    }}
                  />

                  <p
                    className="small mb-4"
                    style={{
                      color: '#e2e8f0',
                      lineHeight: '1.5',
                      fontSize: '0.84rem',
                      maxWidth: '280px',
                    }}
                  >
                    Access your personal share ledger, track active loans, and manage recurring deposits with full transparency.
                  </p>

                  <Link to="/register" style={{ width: '100%' }}>
                    <CButton
                      color="light"
                      variant="outline"
                      className="w-80 fw-bold shadow-sm"
                      style={{
                        borderRadius: '2rem',
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                        color: '#ffffff',
                        padding: '8px 24px',
                        fontSize: '0.88rem',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#ffffff'
                        e.currentTarget.style.color = '#1e3a8a'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#ffffff'
                      }}
                    >
                      Request New Membership
                    </CButton>
                  </Link>
                </CCardBody>
              </CCard>
            </CCardGroup>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Login

