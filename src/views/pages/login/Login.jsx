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
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilUser } from '@coreui/icons'

import API_BASE_URL from '../../../apiConfig'

const Login = () => {
  const navigate = useNavigate() 
  const [vendorNo, setVendorNo] = useState('')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState('member') // default to member

  const handleLogin = async (e) => {
    e.preventDefault() 
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vendorNo: vendorNo, password: password, loginRole: loginRole }),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('adminToken', data.token)
        localStorage.setItem('token', data.token) 
        
        if (data.user.name) {
          localStorage.setItem('userName', data.user.name);
        }
        if (data.user.profilePictureUrl) {
          localStorage.setItem('userAvatar', data.user.profilePictureUrl);
        }
        if (data.user.role) {
          localStorage.setItem('userRole', data.user.role);
        }

        // ==========================================
        // NEW: The Password Interceptor
        // ==========================================
        if (data.user.requiresPasswordChange === true) {
          // Trap them on the password setup screen
          navigate('/setup-password')
        } else {
          // Normal login flow
          navigate('/dashboard') 
        }
        // ==========================================

      } else {
        alert('Login failed: ' + (data.error || data.message))
      }
    } catch (error) {
      alert('Error connecting to the server.')
    }
  }

  return (
    <div className="min-vh-100 d-flex flex-row align-items-center" style={{
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative background shapes */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px',
        background: 'rgba(255,255,255,0.1)', filter: 'blur(80px)', borderRadius: '50%'
      }}></div>
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-5%', width: '300px', height: '300px',
        background: 'rgba(0,0,0,0.2)', filter: 'blur(60px)', borderRadius: '50%'
      }}></div>

      <CContainer style={{ position: 'relative', zIndex: 10 }}>
        <CRow className="justify-content-center">
          <CCol md={9} lg={8}>
            <CCardGroup className="shadow-lg" style={{ borderRadius: '1rem', overflow: 'hidden', border: 'none' }}>
              
              {/* Left Side: The Working Login Form */}
              <CCard className="p-4 p-md-5 border-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}>
                <CCardBody>
                  <div className="text-center mb-4 d-md-none">
                    {/* Show logo on mobile only */}
                    <img src="/logo.png" alt="Logo" style={{ width: '80px', marginBottom: '1rem' }} />
                    <h4 className="fw-bold" style={{ color: '#1e3c72' }}>MAHADEV SOCIETY</h4>
                  </div>
                  <CForm onSubmit={handleLogin}>
                    <h2 className="fw-bold mb-1" style={{ color: '#1e3c72' }}>Welcome Back</h2>
                    <p className="text-muted mb-4">Please sign in to your account</p>
                    
                    <CInputGroup className="mb-4 shadow-sm" style={{ borderRadius: '0.5rem', overflow: 'hidden' }}>
                      <CInputGroupText className="bg-white border-end-0 text-primary">
                        <CIcon icon={cilUser} />
                      </CInputGroupText>
                      <CFormInput 
                        className="border-start-0 ps-0"
                        placeholder="Vendor No. (e.g. 10452)" 
                        autoComplete="username" 
                        value={vendorNo}
                        onChange={(e) => setVendorNo(e.target.value)}
                        required
                        style={{ height: '3rem', boxShadow: 'none' }}
                      />
                    </CInputGroup>
                    
                    <CInputGroup className="mb-4 shadow-sm" style={{ borderRadius: '0.5rem', overflow: 'hidden' }}>
                      <CInputGroupText className="bg-white border-end-0 text-primary">
                        <CIcon icon={cilLockLocked} />
                      </CInputGroupText>
                      <CFormInput
                        className="border-start-0 ps-0"
                        type="password"
                        placeholder="Password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{ height: '3rem', boxShadow: 'none' }}
                      />
                    </CInputGroup>

                    <div className="mb-4">
                      <label className="form-label text-muted small fw-semibold">Access Level</label>
                      <select 
                        className="form-select shadow-sm" 
                        value={loginRole}
                        onChange={(e) => setLoginRole(e.target.value)}
                        style={{ height: '3rem', borderRadius: '0.5rem', border: '1px solid #ced4da', cursor: 'pointer' }}
                      >
                        <option value="member">Member</option>
                        <option value="executive">Executive Member</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    
                    <CRow>
                      <CCol xs={12}>
                        <CButton type="submit" className="px-4 w-100 fw-bold border-0 shadow-sm text-white" style={{
                          background: 'linear-gradient(to right, #1e3c72, #2a5298)',
                          height: '3rem',
                          borderRadius: '0.5rem'
                        }}>
                          Secure Login
                        </CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </CCardBody>
              </CCard>

              {/* Right Side: Division Branding & Registration Link */}
              <CCard className="text-white border-0 d-none d-md-flex" style={{ 
                width: '45%', 
                background: 'linear-gradient(135deg, rgba(30,60,114,0.95) 0%, rgba(42,82,152,0.95) 100%)',
                backdropFilter: 'blur(10px)'
              }}>
                <CCardBody className="text-center d-flex flex-column justify-content-center align-items-center p-5">
                  <div style={{
                    background: 'white',
                    padding: '0.5rem',
                    borderRadius: '50%',
                    marginBottom: '1.5rem',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '140px',
                    height: '140px'
                  }}>
                    <img src="/logo.png" alt="Society Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
                  </div>
                  <h3 className="fw-bold mb-2">MAHADEV SOCIETY PORTAL</h3>
                  <p className="mb-4 opacity-75 small">
                    HPSEBL, Shimla — Employees Cooperative Society
                  </p>
                  <div style={{ width: '50px', height: '2px', backgroundColor: 'rgba(255,255,255,0.5)', margin: '0 auto 1.5rem auto' }}></div>
                  <p className="small mb-4 opacity-75">
                    Access your personal share ledger, track active loans, and manage your monthly contributions securely.
                  </p>
                  <Link to="/register" style={{ width: '100%' }}>
                    <CButton color="light" variant="outline" className="mt-2 w-75 fw-semibold" style={{ borderRadius: '2rem' }}>
                      Request Access
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
