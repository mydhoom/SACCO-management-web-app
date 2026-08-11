import React, { useState } from 'react'
import {
  CCard, CCardHeader, CCardBody, CRow, CCol, CButton,
  CFormInput, CFormLabel, CAlert, CSpinner, CInputGroup, CInputGroupText
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCloudUpload, cilFile, cilDescription, cilCheckCircle, cilWarning } from '@coreui/icons'

const UpdateData = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'
  
  // --- STATE MANAGEMENT ---
  const [uploadStatus, setUploadStatus] = useState({ master: false, shares: false, loans: false })
  const [alerts, setAlerts] = useState({ master: null, shares: null, loans: null })
  
  // Special State for System Initialization (Master Upload)
  const [initForm, setInitForm] = useState({
    file: null,
    asOfDate: '',
    bankBalance: '',
    cashInHand: ''
  })

  // --- TEMPLATE GENERATOR ---
  const downloadTemplate = (type, templateName) => {
    let csvContent = "data:text/csv;charset=utf-8,"
    let headers = ""
    let sampleRow = ""

    if (type === 'master') {
      // Added Monthly_RD_Amount and Opening_Interest_Pending
      headers = "Vendor_No,Full_Name,Designation,Phone,Email,Circle,Division,Sub_Division,Section,Opening_Share_Balance,Opening_RD_Balance,Monthly_RD_Amount,Active_Loan_ID,Opening_Principal_Pending,Opening_Interest_Pending,Current_EMI_Amount"
      sampleRow = "1045,Amit Kumar,Foreman,9876543210,amit@test.com,Shimla,City Electrical,Lakkar Bazar,Sec-A,25000,12500,2000,LN-1045-A,15000,1200,2500"
    } else if (type === 'shares') {
      headers = "Vendor_No,Member_Name,Share_Deduction,RD_Deduction,Transaction_Date,Batch_ID"
      sampleRow = "1045,Amit Kumar,1000,2000,2026-07-31,SAL-JULY-2026"
    } else if (type === 'loans') {
      headers = "Vendor_No,Member_Name,Loan_ID,Total_EMI_Amount,Transaction_Date,Batch_ID"
      sampleRow = "1045,Amit Kumar,LN-1045-A,4614,2026-07-31,EMI-JULY-2026"
    }

    csvContent += headers + "\n" + sampleRow + "\n"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${templateName}_Template.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // --- 1. NEW INIT UPLOAD LOGIC (API Integration) ---
  const handleInitUpload = async () => {
    setAlerts(prev => ({ ...prev, master: null }))
    
    if (!initForm.file || !initForm.asOfDate) {
      setAlerts(prev => ({ ...prev, master: { type: 'warning', text: 'File and As Of Date are strictly required.' } }))
      return
    }

    setUploadStatus(prev => ({ ...prev, master: true }))

    // Using FormData to send the file AND the text inputs together
    const formData = new FormData()
    formData.append('masterFile', initForm.file)
    formData.append('asOfDate', initForm.asOfDate)
    formData.append('bankBalance', initForm.bankBalance || 0)
    formData.append('cashInHand', initForm.cashInHand || 0)

    try {
      const response = await fetch(`${apiBase}/api/auth/system-init`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          // Note: Do NOT set 'Content-Type'. The browser sets it automatically when using FormData!
        },
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setAlerts(prev => ({ ...prev, master: { type: 'success', text: `Success: ${data.details.usersCreated} Users & ${data.details.loansCreated} Loans created!` } }))
        // Clear form on success
        setInitForm({ file: null, asOfDate: '', bankBalance: '', cashInHand: '' })
      } else {
        setAlerts(prev => ({ ...prev, master: { type: 'danger', text: data.message || 'Initialization failed.' } }))
      }
    } catch (error) {
      console.error('Upload Error:', error)
      setAlerts(prev => ({ ...prev, master: { type: 'danger', text: 'Server error during upload.' } }))
    } finally {
      setUploadStatus(prev => ({ ...prev, master: false }))
    }
  }

  // --- 2. EXISTING MOCK UPLOAD (For Shares & Loans temporarily) ---
  const handleSimulatedUpload = (type) => {
    setUploadStatus({ ...uploadStatus, [type]: true })
    setTimeout(() => {
      setUploadStatus(prev => ({ ...prev, [type]: false }))
      setAlerts(prev => ({ ...prev, [type]: { type: 'success', text: 'Data processed successfully.' } }))
    }, 2000)
  }

  // --- UI RENDERERS ---

  // Custom UI for the Initialization Card
  const renderInitCard = () => (
    <CCard className="mb-4 shadow-sm border-0 h-100 border-top border-3 border-dark">
      <CCardHeader className="bg-white pt-3 pb-3 border-bottom">
        <h5 className="mb-0 text-dark fw-bold">1. System Initialization (Migration)</h5>
      </CCardHeader>
      
      <CCardBody className="p-4 d-flex flex-column">
        <p className="text-medium-emphasis mb-3">Upload your master historical sheet. Set the exact migration date and ledger cash positions.</p>
        
        {alerts.master && (
          <CAlert color={alerts.master.type} className="py-2 mb-3 shadow-sm d-flex align-items-center">
            <CIcon icon={alerts.master.type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
            <div>{alerts.master.text}</div>
          </CAlert>
        )}

        <div className="mb-3">
          <CFormLabel className="small fw-bold mb-1">Migration "As Of" Date</CFormLabel>
          <CFormInput 
            type="date" 
            size="sm"
            value={initForm.asOfDate}
            onChange={(e) => setInitForm({...initForm, asOfDate: e.target.value})}
          />
        </div>

        <CRow className="mb-3 g-2">
          <CCol xs={6}>
            <CFormLabel className="small fw-bold mb-1">Bank Balance</CFormLabel>
            <CInputGroup size="sm">
              <CInputGroupText>₹</CInputGroupText>
              <CFormInput 
                type="number" 
                placeholder="0" 
                value={initForm.bankBalance}
                onChange={(e) => setInitForm({...initForm, bankBalance: e.target.value})}
              />
            </CInputGroup>
          </CCol>
          <CCol xs={6}>
            <CFormLabel className="small fw-bold mb-1">Cash in Hand</CFormLabel>
            <CInputGroup size="sm">
              <CInputGroupText>₹</CInputGroupText>
              <CFormInput 
                type="number" 
                placeholder="0" 
                value={initForm.cashInHand}
                onChange={(e) => setInitForm({...initForm, cashInHand: e.target.value})}
              />
            </CInputGroup>
          </CCol>
        </CRow>

        <div className="mb-4 bg-light p-3 rounded text-center flex-grow-1" style={{ border: '2px dashed #c4c9d0' }}>
          <CIcon icon={cilFile} size="xl" className="mb-2 text-secondary" />
          <div className="small text-muted mb-2">Select Master Data (.xlsx, .csv)</div>
          <CFormInput 
            type="file" 
            size="sm" 
            accept=".csv, .xlsx, .xls"
            onChange={(e) => setInitForm({...initForm, file: e.target.files[0]})}
          />
        </div>

        <div className="d-flex flex-column flex-xl-row justify-content-between gap-2 mt-auto">
          <CButton color="secondary" variant="ghost" size="sm" onClick={() => downloadTemplate('master', 'Master_Init')}>
            <CIcon icon={cilDescription} className="me-2" />
            Template
          </CButton>
          <CButton color="dark" className="text-white shadow-sm" onClick={handleInitUpload} disabled={uploadStatus.master}>
            {uploadStatus.master ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudUpload} className="me-2"/> Initialize</>}
          </CButton>
        </div>
      </CCardBody>
    </CCard>
  )

  // Standard UI for Monthly Uploads
  const renderUploadCard = (title, description, type, templateName, colorTheme) => (
    <CCard className="mb-4 shadow-sm border-0 h-100 border-top border-3 border-secondary">
      <CCardHeader className="bg-white pt-3 pb-3 border-bottom">
        <h5 className="mb-0 text-dark fw-bold">{title}</h5>
      </CCardHeader>
      
      <CCardBody className="p-4 d-flex flex-column">
        <p className="text-medium-emphasis mb-4">{description}</p>
        
        {alerts[type] && (
          <CAlert color={alerts[type].type} className="py-2 mb-3 shadow-sm d-flex align-items-center">
            <CIcon icon={alerts[type].type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
            <div>{alerts[type].text}</div>
          </CAlert>
        )}

        <div className="mb-4 bg-light p-4 rounded text-center flex-grow-1 d-flex flex-column justify-content-center align-items-center" style={{ border: '2px dashed #c4c9d0' }}>
          <CIcon icon={cilFile} size="3xl" className="mb-3 text-secondary" />
          <CFormLabel htmlFor={`file-${type}`} style={{ cursor: 'pointer' }} className="fw-semibold text-primary text-decoration-underline-hover mb-2">
            Click to Browse or Drag File
          </CFormLabel>
          <div className="small text-muted mb-3">Supports .csv, .xlsx</div>
          <CFormInput type="file" id={`file-${type}`} accept=".csv, .xlsx, .xls" size="sm" className="w-75 mx-auto" />
        </div>

        <div className="d-flex flex-column flex-xl-row justify-content-between gap-2 mt-auto">
          <CButton color="secondary" variant="ghost" size="sm" onClick={() => downloadTemplate(type, templateName)}>
            <CIcon icon={cilDescription} className="me-2"/>
            Template
          </CButton>
          <CButton color={colorTheme} className="text-white shadow-sm" onClick={() => handleSimulatedUpload(type)} disabled={uploadStatus[type]}>
            {uploadStatus[type] ? <CSpinner size="sm" /> : <><CIcon icon={cilCloudUpload} className="me-2"/> Process</>}
          </CButton>
        </div>
      </CCardBody>
    </CCard>
  )

  return (
    <>
      <div className="mb-4">
        <h4 className="mb-0 text-dark fw-bold">Data Management Center</h4>
        <div className="small text-medium-emphasis">Initialize the database or upload monthly division sheets in bulk.</div>
      </div>

      <CRow className="align-items-stretch">
        <CCol lg={4} className="mb-4">
          {renderInitCard()}
        </CCol>
        
        <CCol lg={4} className="mb-4">
          {renderUploadCard(
            "2. Monthly Shares", 
            "Upload the monthly payroll deduction sheet to credit all member share and RD accounts automatically.",
            "shares",
            "Monthly_Shares",
            "success" 
          )}
        </CCol>
        
        <CCol lg={4} className="mb-4">
          {renderUploadCard(
            "3. Monthly Loan EMIs", 
            "Upload the loan recovery sheet to process EMI payments against outstanding member balances.",
            "loans",
            "Monthly_Loan_EMIs",
            "primary" 
          )}
        </CCol>
      </CRow>
    </>
  )
}

export default UpdateData
