import React, { useState, useEffect } from 'react'
import {
  CCard, CCardHeader, CCardBody, CTable, CTableHead, CTableRow,
  CTableHeaderCell, CTableBody, CTableDataCell, CButton, CFormInput,
  CInputGroup, CInputGroupText, CBadge, CSpinner, CModal, CModalHeader,
  CModalTitle, CModalBody, CModalFooter, CForm,
  CNav, CNavItem, CNavLink, CTabContent, CTabPane, CRow, CCol
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilSpreadsheet, cilPrint, cilUser, cilPencil, cilTrash, cilUserPlus, cilBank, cilMoney } from '@coreui/icons'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const SocietyDirectory = () => {
  // State Management
  const [searchTerm, setSearchTerm] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Modal States
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [addFormData, setAddFormData] = useState({ name: '', vendorNo: '', designation: '', phoneNumber: '', loanAccountNo: '', password: 'Password@123' })
  
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editFormData, setEditFormData] = useState(null)
  
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [activeTab, setActiveTab] = useState(1)

  // Fetch Members from Live API
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/members', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        })
        const data = await response.json()
        setMembers(data.map(m => ({
          id: m._id, 
          vendorNo: m.vendorNo || 'N/A', 
          name: m.name || 'N/A',
          designation: m.designation || 'Member', 
          rdBalance: m.currentShareMoneyTotal || m.rdBalance || 0,
          loan: m.activeLoanAmount || 0, 
          loanAccountNo: m.loanAccountNo || 'N/A', 
          status: m.status === 'approved' ? 'Active' : m.status,
          phoneNumber: m.phoneNumber || 'N/A'
        })))
      } catch (err) { 
        console.error("Fetch Error:", err) 
      } finally { 
        setLoading(false) 
      }
    }
    fetchMembers()
  }, [])

  // Add Member
  const handleAddMember = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('http://localhost:5000/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
        body: JSON.stringify({ ...addFormData, status: 'approved' })
      })
      if (response.ok) {
        const data = await response.json()
        setMembers([{ id: data.member._id, ...addFormData, rdBalance: 0, loan: 0, status: 'Active' }, ...members])
        setAddModalVisible(false)
        setAddFormData({ name: '', vendorNo: '', designation: '', phoneNumber: '', loanAccountNo: '', password: 'Password@123' })
      } else {
        const errorData = await response.json()
        alert(`Failed to add member: ${errorData.error || 'Server error occurred'}`)
      }
    } catch (err) { 
      alert(`Error: ${err.message}`) 
    } finally { 
      setIsSaving(false) 
    }
  }

  // Edit Member
  const handleEditMember = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`http://localhost:5000/api/members/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
        body: JSON.stringify(editFormData)
      })
      if (response.ok) {
        setMembers(members.map(m => m.id === editFormData.id ? { ...m, ...editFormData } : m))
        setEditModalVisible(false)
      } else {
        alert('Failed to update member')
      }
    } catch (err) { 
      alert(`Error: ${err.message}`) 
    } finally { 
      setIsSaving(false) 
    }
  }

  // Delete Member
  const handleDeleteMember = async (id, name) => {
    if (!window.confirm(`Permanently delete ${name}?`)) return
    const response = await fetch(`http://localhost:5000/api/members/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
    })
    if (response.ok) setMembers(prev => prev.filter(m => m.id !== id))
  }

  // Export Main Directory to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredMembers.map((m, index) => ({
      'S.No.': index + 1,
      'Vendor No.': m.vendorNo,
      'Member Name': m.name,
      'Designation': m.designation,
      'Loan A/C No.': m.loanAccountNo,
      'Total RD (₹)': m.rdBalance,
      'Outstanding Loan (₹)': m.loan,
      'Account Status': m.status 
    }))
    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Society_Members")
    XLSX.writeFile(workbook, "Society_Directory_Export.xlsx")
  }

  // Export Main Directory to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape')
    
    doc.setFontSize(18)
    doc.text("Society Directory", 14, 22)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text("Master member overview and management", 14, 30)

    const tableColumn = ["S.No.", "Vendor No.", "Name", "Designation", "Loan A/C", "RD (Rs)", "Loan (Rs)", "Status"]
    const tableRows = []

    filteredMembers.forEach((m, index) => {
      const memberData = [
        index + 1,
        m.vendorNo,
        m.name,
        m.designation,
        m.loanAccountNo,
        m.rdBalance.toLocaleString('en-IN'),
        m.loan.toLocaleString('en-IN'),
        m.status
      ]
      tableRows.push(memberData)
    })

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 9 }
    })

    doc.save("Society_Directory_Export.pdf")
  }

  // --- NEW: Download Individual RD Passbook ---
  const handleDownloadPassbook = () => {
    if (!selectedProfile) return
    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text("Member Passbook - Recurring Deposit", 14, 20)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text(`Name: ${selectedProfile.name} | Vendor No: ${selectedProfile.vendorNo}`, 14, 28)
    doc.text(`Total RD Balance: Rs ${selectedProfile.rdBalance.toLocaleString('en-IN')}`, 14, 34)

    const tableColumn = ["Date", "Description", "Credit (Rs)", "Balance (Rs)"]
    const tableRows = [
      ["01-May-2026", "Salary Deduction", "1,000", selectedProfile.rdBalance.toLocaleString('en-IN')],
      ["01-Apr-2026", "Salary Deduction", "1,000", (selectedProfile.rdBalance > 1000 ? selectedProfile.rdBalance - 1000 : 0).toLocaleString('en-IN')]
    ]

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [46, 204, 113] }, // Green header for savings
    })

    doc.save(`${selectedProfile.vendorNo}_RD_Passbook.pdf`)
  }

  // --- NEW: Download Individual Loan Statement ---
  const handleDownloadLoanStatement = () => {
    if (!selectedProfile) return
    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text("Member Loan Statement", 14, 20)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text(`Name: ${selectedProfile.name} | Vendor No: ${selectedProfile.vendorNo}`, 14, 28)
    doc.text(`Loan A/C No: ${selectedProfile.loanAccountNo} | Outstanding: Rs ${selectedProfile.loan.toLocaleString('en-IN')}`, 14, 34)

    const tableColumn = ["Date", "EMI Paid (Rs)", "Principal (Rs)", "Interest (Rs)", "Remaining (Rs)"]
    // Only show loan data if they actually have a loan
    const tableRows = selectedProfile.loan > 0 ? [
      ["01-May-2026", "5,000", "4,200", "800", selectedProfile.loan.toLocaleString('en-IN')]
    ] : [
      ["-", "-", "-", "-", "0"]
    ]

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [231, 76, 60] }, // Red header for loans
    })

    doc.save(`${selectedProfile.vendorNo}_Loan_Statement.pdf`)
  }

  // Open Profile View
  const handleViewProfile = (member) => {
    setSelectedProfile(member)
    setActiveTab(1)
    setProfileModalVisible(true)
  }

  // Helpers & Filters
  const getBadgeColor = (status) => status === 'Active' ? 'success' : status === 'Suspended' ? 'danger' : 'secondary'
  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.vendorNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.loanAccountNo.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      <CCard className="mb-4 shadow-sm">
        <CCardHeader className="pb-3 pt-3">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center">
            <div>
              <h4 className="mb-0">Society Directory</h4>
              <div className="small text-medium-emphasis">Master member overview and management</div>
            </div>
            <div className="d-flex flex-column flex-sm-row gap-2 mt-3 mt-md-0">
              <CInputGroup>
                <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
                <CFormInput 
                  placeholder="Search by Name, Vendor No, Loan A/C..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  style={{ minWidth: '250px' }} 
                />
              </CInputGroup>
              <CButton color="primary" className="text-white d-flex align-items-center gap-2" onClick={() => setAddModalVisible(true)}>
                <CIcon icon={cilUserPlus} /> Add
              </CButton>
              <CButton color="success" className="text-white d-flex align-items-center gap-2" onClick={handleExportExcel}>
                <CIcon icon={cilSpreadsheet} /> Excel
              </CButton>
              <CButton color="secondary" className="text-white d-flex align-items-center gap-2" onClick={handleExportPDF}>
                <CIcon icon={cilPrint} /> PDF
              </CButton>
            </div>
          </div>
        </CCardHeader>
        
        <CCardBody className="p-0">
          {loading ? (
            <div className="text-center py-5"><CSpinner color="primary" /></div>
          ) : (
            <div className="table-responsive">
              <CTable hover align="middle" className="mb-0 border-top">
                <CTableHead color="light">
                  <CTableRow>
                    <CTableHeaderCell className="ps-4">S.No.</CTableHeaderCell>
                    <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                    <CTableHeaderCell>Member Info</CTableHeaderCell>
                    <CTableHeaderCell>Loan A/C No.</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Total RD</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Outstanding Loan</CTableHeaderCell>
                    <CTableHeaderCell className="text-center">Status</CTableHeaderCell>
                    <CTableHeaderCell className="text-center pe-4">Actions</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {filteredMembers.map((m, index) => (
                    <CTableRow key={m.id}>
                      <CTableDataCell className="ps-4 text-medium-emphasis fw-semibold">
                        {index + 1}
                      </CTableDataCell>
                      <CTableDataCell>
                        <span 
                          className="fw-bold" 
                          style={{ cursor: 'pointer', color: 'inherit' }} 
                          title="Click to view full profile" 
                          onClick={() => handleViewProfile(m)}
                          onMouseOver={(e) => e.target.style.textDecoration = 'underline'} 
                          onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                        >
                          {m.vendorNo}
                        </span>
                      </CTableDataCell>
                      <CTableDataCell>
                        <div 
                          className="fw-semibold" 
                          style={{ cursor: 'pointer', color: 'inherit' }} 
                          title="Click to view full profile" 
                          onClick={() => handleViewProfile(m)}
                          onMouseOver={(e) => e.target.style.textDecoration = 'underline'} 
                          onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                        >
                          {m.name}
                        </div>
                        <div className="small text-medium-emphasis">{m.designation}</div>
                      </CTableDataCell>
                      <CTableDataCell>
                        <strong>{m.loanAccountNo}</strong>
                      </CTableDataCell>
                      <CTableDataCell className="text-end">₹{m.rdBalance.toLocaleString('en-IN')}</CTableDataCell>
                      <CTableDataCell className="text-end">
                        <div className={m.loan > 0 ? "fw-semibold" : ""}>
                          ₹{m.loan.toLocaleString('en-IN')}
                        </div>
                      </CTableDataCell>
                      <CTableDataCell className="text-center">
                        <CBadge color={getBadgeColor(m.status)} shape="rounded-pill">{m.status}</CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="text-center pe-4">
                        <CButton color="light" size="sm" className="me-2" title="View Profile" onClick={() => handleViewProfile(m)}>
                          <CIcon icon={cilUser} />
                        </CButton>
                        <CButton color="light" size="sm" className="me-2" title="Edit Member" onClick={() => { setEditFormData(m); setEditModalVisible(true) }}>
                          <CIcon icon={cilPencil} />
                        </CButton>
                        <CButton color="light" size="sm" title="Delete Member" onClick={() => handleDeleteMember(m.id, m.name)}>
                          <CIcon icon={cilTrash} className="text-danger" />
                        </CButton>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                  {filteredMembers.length === 0 && (
                    <CTableRow>
                      <CTableDataCell colSpan="8" className="text-center py-4 text-muted">
                        No members found matching "{searchTerm}"
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </CTableBody>
              </CTable>
            </div>
          )}
        </CCardBody>
      </CCard>

      {/* Add Member Modal */}
      <CModal visible={addModalVisible} onClose={() => setAddModalVisible(false)}>
        <CModalHeader><CModalTitle>Add Member</CModalTitle></CModalHeader>
        <CModalBody>
           <CForm>
             <CFormInput className="mb-3" label="Name" value={addFormData.name} onChange={(e) => setAddFormData({...addFormData, name: e.target.value})} />
             <CFormInput className="mb-3" label="Vendor No" value={addFormData.vendorNo} onChange={(e) => setAddFormData({...addFormData, vendorNo: e.target.value})} />
             <CFormInput className="mb-3" label="Designation" value={addFormData.designation} onChange={(e) => setAddFormData({...addFormData, designation: e.target.value})} />
             <CFormInput className="mb-3" label="Loan A/C No" placeholder="e.g. LN-1001" value={addFormData.loanAccountNo} onChange={(e) => setAddFormData({...addFormData, loanAccountNo: e.target.value})} />
             <CFormInput className="mb-3" label="Phone Number" value={addFormData.phoneNumber} onChange={(e) => setAddFormData({...addFormData, phoneNumber: e.target.value})} />
           </CForm>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setAddModalVisible(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleAddMember}>{isSaving ? <CSpinner size="sm"/> : 'Create Member'}</CButton>
        </CModalFooter>
      </CModal>

      {/* Edit Member Modal */}
      <CModal visible={editModalVisible} onClose={() => setEditModalVisible(false)}>
        <CModalHeader><CModalTitle>Edit Member</CModalTitle></CModalHeader>
        <CModalBody>
           {editFormData && (
             <CForm>
               <CFormInput className="mb-3" label="Name" value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} />
               <CFormInput className="mb-3" label="Vendor No" value={editFormData.vendorNo} onChange={(e) => setEditFormData({...editFormData, vendorNo: e.target.value})} />
               <CFormInput className="mb-3" label="Designation" value={editFormData.designation} onChange={(e) => setEditFormData({...editFormData, designation: e.target.value})} />
               <CFormInput className="mb-3" label="Loan A/C No" value={editFormData.loanAccountNo} onChange={(e) => setEditFormData({...editFormData, loanAccountNo: e.target.value})} />
             </CForm>
           )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setEditModalVisible(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleEditMember}>{isSaving ? <CSpinner size="sm"/> : 'Save Changes'}</CButton>
        </CModalFooter>
      </CModal>

      {/* CUSTOMER 360 MODAL */}
      <CModal size="lg" visible={profileModalVisible} onClose={() => setProfileModalVisible(false)} backdrop="static">
        <CModalHeader>
          <CModalTitle>{selectedProfile ? `${selectedProfile.name} - Profile` : 'Member Profile'}</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {selectedProfile && (
            <>
              {/* Member Summary Header */}
              <CRow className="mb-4 text-center text-sm-start">
                <CCol sm={4} className="mb-3 mb-sm-0">
                  <div className="text-medium-emphasis small">Vendor No</div>
                  <div className="fs-5 fw-semibold">{selectedProfile.vendorNo}</div>
                </CCol>
                <CCol sm={4} className="mb-3 mb-sm-0">
                  <div className="text-medium-emphasis small">Designation</div>
                  <div className="fs-5 fw-semibold">{selectedProfile.designation}</div>
                </CCol>
                <CCol sm={4}>
                  <div className="text-medium-emphasis small">Status</div>
                  <CBadge color={getBadgeColor(selectedProfile.status)} shape="rounded-pill">
                    {selectedProfile.status}
                  </CBadge>
                </CCol>
              </CRow>

              {/* Tab Navigation */}
              <CNav variant="tabs" role="tablist">
                <CNavItem>
                  <CNavLink style={{ cursor: 'pointer' }} active={activeTab === 1} onClick={() => setActiveTab(1)}>
                    <CIcon icon={cilBank} className="me-2" /> RD Ledger
                  </CNavLink>
                </CNavItem>
                <CNavItem>
                  <CNavLink style={{ cursor: 'pointer' }} active={activeTab === 2} onClick={() => setActiveTab(2)}>
                    <CIcon icon={cilMoney} className="me-2" /> Loan Ledger
                  </CNavLink>
                </CNavItem>
              </CNav>

              {/* Tab Content */}
              <CTabContent className="pt-4">
                
                {/* TAB 1: RECURRING DEPOSIT (RD) */}
                <CTabPane role="tabpanel" visible={activeTab === 1}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">Total RD: <span className="text-success">₹{selectedProfile.rdBalance.toLocaleString('en-IN')}</span></h5>
                    {/* UPDATED: Download Passbook Button */}
                    <CButton color="primary" variant="outline" size="sm" onClick={handleDownloadPassbook}>
                      Download Passbook
                    </CButton>
                  </div>
                  <CTable bordered striped small responsive>
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell>Description</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Credit (₹)</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Balance (₹)</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      <CTableRow>
                        <CTableDataCell>01-May-2026</CTableDataCell>
                        <CTableDataCell>Salary Deduction</CTableDataCell>
                        <CTableDataCell className="text-end text-success">+ 1,000</CTableDataCell>
                        <CTableDataCell className="text-end fw-bold">₹{selectedProfile.rdBalance.toLocaleString('en-IN')}</CTableDataCell>
                      </CTableRow>
                      <CTableRow>
                        <CTableDataCell>01-Apr-2026</CTableDataCell>
                        <CTableDataCell>Salary Deduction</CTableDataCell>
                        <CTableDataCell className="text-end text-success">+ 1,000</CTableDataCell>
                        <CTableDataCell className="text-end fw-bold">₹{(selectedProfile.rdBalance > 1000 ? selectedProfile.rdBalance - 1000 : 0).toLocaleString('en-IN')}</CTableDataCell>
                      </CTableRow>
                    </CTableBody>
                  </CTable>
                </CTabPane>

                {/* TAB 2: LOANS */}
                <CTabPane role="tabpanel" visible={activeTab === 2}>
                  
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="mb-1">Outstanding Loan: <span className="text-danger">₹{selectedProfile.loan.toLocaleString('en-IN')}</span></h5>
                      <div className="text-medium-emphasis small">
                        Loan A/C No: <strong>{selectedProfile.loanAccountNo}</strong>
                      </div>
                    </div>
                    {/* UPDATED: Loan Statement Button */}
                    <CButton color="primary" variant="outline" size="sm" onClick={handleDownloadLoanStatement}>
                      Loan Statement
                    </CButton>
                  </div>
                  
                  {selectedProfile.loan === 0 ? (
                    <div className="text-center p-4 text-muted border rounded bg-light">
                      This member has no active loans.
                    </div>
                  ) : (
                    <CTable bordered striped small responsive>
                      <CTableHead color="light">
                        <CTableRow>
                          <CTableHeaderCell>Date</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">EMI Paid</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Principal</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Interest</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Remaining</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        <CTableRow>
                          <CTableDataCell>01-May-2026</CTableDataCell>
                          <CTableDataCell className="text-end">₹5,000</CTableDataCell>
                          <CTableDataCell className="text-end">₹4,200</CTableDataCell>
                          <CTableDataCell className="text-end">₹800</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold">₹{selectedProfile.loan.toLocaleString('en-IN')}</CTableDataCell>
                        </CTableRow>
                      </CTableBody>
                    </CTable>
                  )}
                </CTabPane>
              </CTabContent>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setProfileModalVisible(false)}>Close</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default SocietyDirectory
