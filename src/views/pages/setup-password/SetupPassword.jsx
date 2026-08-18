import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CButton,
  CCard,
  CCardBody,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
  CAlert
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked } from '@coreui/icons'
import { API_BASE_URL } from '../../../apiConfig'

const SetupPassword = () => {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match. Please try again.')
    }
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters long.')
    }

    try {
      // 1. Grab the token we saved during login
      const token = localStorage.getItem('token');

      // 2. Send the new password and the token to the backend
      const response = await fetch(`${API_BASE_URL}/api/auth/setup-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // This passes the backend security middleware!
        },
        body: JSON.stringify({ newPassword: newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        // 3. If successful, release them to the dashboard!
        navigate('/dashboard');
      } else {
        setError(data.message || 'Failed to update password.');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
  }

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={9} lg={7} xl={6}>
            <CCard className="mx-4 shadow-sm border-top-primary border-top-3">
              <CCardBody className="p-4">
                <CForm onSubmit={handleSubmit}>
                  <h2 className="text-primary fw-bold mb-3">Action Required</h2>
                  <p className="text-medium-emphasis">
                    For your security, please change your temporary password before accessing the Society Portal.
                  </p>
                  
                  {error && <CAlert color="danger">{error}</CAlert>}

                  <CInputGroup className="mb-3 mt-4">
                    <CInputGroupText>
                      <CIcon icon={cilLockLocked} />
                    </CInputGroupText>
                    <CFormInput
                      type="password"
                      placeholder="New Password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </CInputGroup>
                  <CInputGroup className="mb-4">
                    <CInputGroupText>
                      <CIcon icon={cilLockLocked} />
                    </CInputGroupText>
                    <CFormInput
                      type="password"
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </CInputGroup>
                  <div className="d-grid">
                    <CButton color="primary" type="submit" className="fw-semibold">
                      Secure Account & Continue
                    </CButton>
                  </div>
                </CForm>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default SetupPassword
