import React, { useState } from 'react'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CRow,
  CCol,
  CButton,
  CFormInput,
  CFormLabel,
  CAlert
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCloudUpload, cilFile, cilDescription, cilCheckCircle } from '@coreui/icons'

const UpdateData = () => {
  // State to handle the success messages after clicking "Process Data"
  const [uploadStatus, setUploadStatus] = useState({
    master: false,
    shares: false,
    loans: false
  })

  // Simulated upload function to show the UI interaction
  const handleUpload = (type) => {
    setUploadStatus({ ...uploadStatus, [type]: true })
    
    // Automatically hide the success message after 4 seconds
    setTimeout(() => {
      setUploadStatus(prev => ({ ...prev, [type]: false }))
    }, 4000)
  }

  // A reusable function to generate the 3 distinct upload cards cleanly
  const renderUploadCard = (title, description, type, templateName, colorTheme) => (
    <CCard className="mb-4 shadow-sm border-0 h-100">
      <CCardHeader className={`bg-white pt-3 pb-3 border-bottom border-3 border-${colorTheme}`}>
        <h5 className="mb-0 text-dark fw-bold">{title}</h5>
      </CCardHeader>
      
      <CCardBody className="p-4 d-flex flex-column">
        <p className="text-medium-emphasis mb-4">{description}</p>
        
        {/* Success Alert Banner */}
        {uploadStatus[type] && (
          <CAlert color="success" className="d-flex align-items-center py-2 mb-3 shadow-sm">
            <CIcon icon={cilCheckCircle} className="me-2 flex-shrink-0" size="lg" />
            <div><strong>Success!</strong> Data processed successfully.</div>
          </CAlert>
        )}

        {/* Drag and Drop Zone */}
        <div 
          className="mb-4 bg-light p-4 rounded text-center flex-grow-1 d-flex flex-column justify-content-center align-items-center" 
          style={{ border: '2px dashed #c4c9d0', transition: 'all 0.2s' }}
        >
          <CIcon icon={cilFile} size="3xl" className="mb-3 text-secondary" />
          <CFormLabel htmlFor={`file-${type}`} style={{ cursor: 'pointer' }} className="fw-semibold text-primary text-decoration-underline-hover mb-2">
            Click to Browse or Drag File Here
          </CFormLabel>
          <div className="small text-muted mb-3">Supports .xlsx and .xls formats</div>
          
          {/* The actual hidden-ish file input */}
          <CFormInput type="file" id={`file-${type}`} accept=".xlsx, .xls" size="sm" className="w-75 mx-auto" />
        </div>

        {/* Bottom Actions */}
        <div className="d-flex flex-column flex-xl-row justify-content-between gap-2 mt-auto">
          <CButton color="secondary" variant="ghost" size="sm" className="d-flex align-items-center justify-content-center gap-2">
            <CIcon icon={cilDescription} />
            {templateName} Template
          </CButton>
          
          <CButton color={colorTheme} className="text-white d-flex align-items-center justify-content-center gap-2 shadow-sm" onClick={() => handleUpload(type)}>
            <CIcon icon={cilCloudUpload} />
            Process Data
          </CButton>
        </div>
      </CCardBody>
    </CCard>
  )

  return (
    <>
      <div className="mb-4">
        <h4 className="mb-0 text-dark fw-bold">Command Center</h4>
        <div className="small text-medium-emphasis">Securely upload monthly division sheets to update ledgers in bulk.</div>
      </div>

      <CRow className="align-items-stretch">
        <CCol lg={4} className="mb-4">
          {renderUploadCard(
            "1. Master Directory", 
            "Upload a complete sheet to bulk-add new members or update existing designations and statuses.",
            "master",
            "Master",
            "dark" // Uses dark gray accents
          )}
        </CCol>
        
        <CCol lg={4} className="mb-4">
          {renderUploadCard(
            "2. Monthly Shares", 
            "Upload the monthly payroll deduction sheet to credit all member share accounts automatically.",
            "shares",
            "Shares",
            "success" // Uses green accents
          )}
        </CCol>
        
        <CCol lg={4} className="mb-4">
          {renderUploadCard(
            "3. Monthly Loan EMIs", 
            "Upload the loan recovery sheet to process EMI payments against outstanding member balances.",
            "loans",
            "Loan EMI",
            "primary" // Uses blue accents
          )}
        </CCol>
      </CRow>
    </>
  )
}

export default UpdateData