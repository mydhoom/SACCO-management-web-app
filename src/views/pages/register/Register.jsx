import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  CAlert,
  CSpinner
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilUser, cilBriefcase, cilInfo } from '@coreui/icons'

const Register = () => {
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    name: '',
    vendorNo: '',
    designation: '',
    phoneNumber: '',
    password: '',
    confirmPassword: ''
  })
  
  // New states for handling the API request
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setErrorMsg('') // Clear any previous errors
    
    // 1. Check if passwords match
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("Passwords do not match!")
      return
    }

    setLoading(true)

    try {
      // 2. Send the actual data to your backend API
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          vendorNo: formData.vendorNo,
          designation: formData.designation,
          phoneNumber: formData.phoneNumber,
          password: formData.password
        }),
      })

      const data = await response.json()

      // 3. Handle the server's response
      if (response.ok) {
        alert("Registration Request Submitted! Pending Admin Approval.")
        navigate('/login')
      } else {
        setErrorMsg(data.error || data.message || "Registration failed. Please try again.")
      }
    } catch (error) {
      setErrorMsg("Error connecting to the server. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={9} lg={7} xl={6}>
            <CCard className="mx-4 shadow-lg border-0">
              <CCardBody className="p-4 p-md-5">
                <CForm onSubmit={handleRegister}>
                  <h2 className="fw-bold mb-3">Request Access</h2>
                  <p className="text-body-secondary mb-4">Submit a request to join the society portal.</p>
                  
                  {/* Security Notice */}
                  <CAlert color="info" className="d-flex align-items-center small mb-4 py-2 border-0 bg-info bg-opacity-10 text-info">
                    <CIcon icon={cilInfo} className="me-2 flex-shrink-0" />
                    <div>
                      <strong>Security Notice:</strong> New accounts are placed in "Pending" status. You will receive access once approved by the division administrator.
                    </div>
                  </CAlert>

                  {/* Error Message Display */}
                  {errorMsg && (
                    <CAlert color="danger" className="py-2 border-0 bg-danger bg-opacity-10 text-danger small">
                      {errorMsg}
                    </CAlert>
                  )}

                  <CInputGroup className="mb-3">
                    <CInputGroupText><CIcon icon={cilUser} /></CInputGroupText>
                    <CFormInput name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} required />
                  </CInputGroup>

                  <CInputGroup className="mb-3">
                    <CInputGroupText><CIcon icon={cilBriefcase} /></CInputGroupText>
                    <CFormInput name="vendorNo" placeholder="Vendor No. (e.g., 10452)" value={formData.vendorNo} onChange={handleChange} required />
                  </CInputGroup>
                  
                  <CInputGroup className="mb-3">
                    <CInputGroupText><CIcon icon={cilBriefcase} /></CInputGroupText>
                    <CFormInput name="designation" placeholder="Designation (e.g., Lineman, Clerk)" value={formData.designation} onChange={handleChange} required />
                  </CInputGroup>

                  <CInputGroup className="mb-3">
                    <CInputGroupText>+91</CInputGroupText>
                    <CFormInput name="phoneNumber" placeholder="Phone Number" value={formData.phoneNumber} onChange={handleChange} required />
                  </CInputGroup>

                  <CInputGroup className="mb-3">
                    <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                    <CFormInput type="password" name="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
                  </CInputGroup>

                  <CInputGroup className="mb-4">
                    <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                    <CFormInput type="password" name="confirmPassword" placeholder="Repeat password" value={formData.confirmPassword} onChange={handleChange} required />
                  </CInputGroup>

                  <div className="d-grid gap-2">
                    <CButton color="primary" className="text-white fw-semibold" type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <CSpinner component="span" size="sm" aria-hidden="true" className="me-2" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Request'
                      )}
                    </CButton>
                  </div>
                  
                  <div className="text-center mt-4">
                    <span className="text-body-secondary small">Already have an account? </span>
                    <Link to="/login" className="text-decoration-none fw-semibold">
                      Back to Login
                    </Link>
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

export default Register
