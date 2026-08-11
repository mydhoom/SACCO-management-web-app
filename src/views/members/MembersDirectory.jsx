import React, { useState, useEffect } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CButton,
  CSpinner,
  CBadge,
  CInputGroup,
  CInputGroupText,
  CFormInput,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CForm,
  CNav,
  CNavItem,
  CNavLink,
  CTabContent,
  CTabPane
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilTrash, cilPencil, cilSearch, cilBank, cilMoney, cilUserPlus } from '@coreui/icons'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const MembersDirectory = () => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('') 

  // Modal States
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [activeTab, setActiveTab] = useState(1)

  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editFormData, setEditFormData] = useState(null)

  const [addModalVisible, setAddModalVisible] = useState(false)
  const [addFormData, setAddFormData] = useState({ 
    name: '', vendorNo: '', designation: '', loanAccountNo: '', emailId: '', dateOfBirth: '', dateOfRetirement: '' 
  })

  const [isSaving, setIsSaving] = useState(false)

  // Fetch all members from the live Render backend
  // Fetch all members from the live Render backend
  const fetchMembers = async () => {
    try {
      const token = localStorage.getItem('token'); // <-- 1. Get the token
      
      const response = await fetch('http://localhost:5000/api/auth/users', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // <-- 2. Send the token in the header
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      
      if (Array.isArray(data)) {
        setMembers(data)
      } else {
        console.error("Backend returned an error instead of an array:", data)
        setMembers([]) 
      }
      
    } catch (error) {
      console.error("Error fetching members:", error)
      setMembers([]) 
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [])

  // --- AUTOMATIC RETIREMENT CALCULATOR (Frontend) ---
  const calculateRetirementDate = (dobString) => {
    if (!dobString) return '';
    const dob = new Date(dobString);
    // JS automatically resolves day '0' to the last day of the previous month.
    // So month + 1 with day 0 = exact last day of the birth month!
    const retirementDate = new Date(dob.getFullYear() + 58, dob.getMonth() + 1, 0);

    // Format back to YYYY-MM-DD for the HTML input element
    const yyyy = retirementDate.getFullYear();
    const mm = String(retirementDate.getMonth() + 1).padStart(2, '0');
    const dd = String(retirementDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleAddDobChange = (e) => {
    const dob = e.target.value;
    const dor = calculateRetirementDate(dob);
    setAddFormData({ ...addFormData, dateOfBirth: dob, dateOfRetirement: dor });
  };

  const handleEditDobChange = (e) => {
    const dob = e.target.value;
    const dor = calculateRetirementDate(dob);
    setEditFormData({ ...editFormData, dateOfBirth: dob, dateOfRetirement: dor });
  };

  // Helper to format MongoDB ISO dates to HTML YYYY-MM-DD format
  const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    return isoString.split('T')[0];
  };
  // --------------------------------------------------

  // Delete a member
  const handleDelete = async (vendorNo) => {
    if (!window.confirm(`Are you sure you want to completely remove Vendor No: ${vendorNo}?`)) return

    try {
      const response = await fetch(`http://localhost:5000/api/auth/users/${vendorNo}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setMembers(members.filter(member => member.vendorNo !== vendorNo))
      } else {
        alert("Failed to delete member.")
      }
    } catch (error) {
      console.error("Error deleting member:", error)
    }
  }

  // Reset Password Function
  const handlePasswordReset = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to reset the password for ${userName} to the default?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/auth/reset-password/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Success! ${userName}'s password has been reset to default.`);
      } else {
        alert('Failed to reset password: ' + data.message);
      }
    } catch (error) {
      alert('Network error while trying to reset password.');
    }
  };

  // PDF Export: RD Passbook
  const handleDownloadPassbook = () => {
    if (!selectedProfile) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Member Passbook - Recurring Deposit", 14, 20)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text(`Name: ${selectedProfile.name} | Vendor No: ${selectedProfile.vendorNo}`, 14, 28)

    const tableColumn = ["Date", "Description", "Credit (Rs)", "Balance (Rs)"]
    const tableRows = [
      ["01-May-2026", "Salary Deduction", "1,000", (selectedProfile.rdBalance || 1000).toLocaleString('en-IN')]
    ]

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [46, 204, 113] },
    })

    doc.save(`${selectedProfile.vendorNo}_RD_Passbook.pdf`)
  }

  // PDF Export: Loan Statement
  const handleDownloadLoanStatement = () => {
    if (!selectedProfile) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Member Loan & Share Statement", 14, 20)
    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text(`Name: ${selectedProfile.name} | Vendor No: ${selectedProfile.vendorNo}`, 14, 28)
    doc.text(`Loan A/C No: ${selectedProfile.loanAccountNo || 'N/A'} | Outstanding: Rs ${(selectedProfile.pendingLoanBalance || 0).toLocaleString('en-IN')}`, 14, 34)

    const tableColumn = ["Date", "EMI Paid (Rs)", "Share Contribution (Rs)", "Remaining Loan (Rs)"]
    const tableRows = [
      ["01-May-2026", "5,000", `₹${(selectedProfile.currentShareMoneyTotal || 0).toLocaleString('en-IN')}`, (selectedProfile.pendingLoanBalance || 0).toLocaleString('en-IN')]
    ]

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [231, 76, 60] },
    })

    doc.save(`${selectedProfile.vendorNo}_Loan_Statement.pdf`)
  }

  // Handle Add Member Submission
  const handleAddMember = async () => {
    setIsSaving(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(addFormData)
      })
      if (response.ok) {
        setAddModalVisible(false)
        setAddFormData({ name: '', vendorNo: '', designation: '', loanAccountNo: '', emailId: '', dateOfBirth: '', dateOfRetirement: '' })
        fetchMembers()
        alert("Member added successfully!")
      } else {
        const errorData = await response.json()
        alert(`Failed to add member: ${errorData.message || 'Server error'}`)
      }
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Edit Member Submission
  const handleUpdateMember = async () => {
    if (!editFormData) return
    setIsSaving(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:5000/api/auth/users/${editFormData._id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(editFormData)
      })
      if (response.ok) {
        setMembers(members.map(m => m._id === editFormData._id ? { ...m, ...editFormData } : m))
        setEditModalVisible(false)
        alert("Member details updated successfully!")
      } else {
        alert('Failed to update member details.')
      }
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Filter members based on search
  const filteredMembers = members.filter((member) => {
    const searchLower = searchTerm.toLowerCase();
    const nameMatch = member.name && member.name.toLowerCase().includes(searchLower);
    const vendorMatch = member.vendorNo && member.vendorNo.toLowerCase().includes(searchLower);
    const loanAccMatch = member.loanAccountNo && member.loanAccountNo.toLowerCase().includes(searchLower);
    return nameMatch || vendorMatch || loanAccMatch;
  });

  return (
    <>
      <CRow>
        <CCol xs={12}>
          <CCard className="mb-4 shadow-sm">
            <CCardHeader className="d-flex flex-column flex-md-row justify-content-between align-items-center py-3">
              <div>
                <strong>Members Directory</strong> <small className="text-medium-emphasis">Master List</small>
              </div>
              <div className="d-flex align-items-center gap-2 mt-3 mt-md-0">
                <div style={{ width: '250px' }}>
                  <CInputGroup>
                    <CInputGroupText>
                      <CIcon icon={cilSearch} />
                    </CInputGroupText>
                    <CFormInput 
                      placeholder="Search Name, Vendor No, Loan A/C..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </CInputGroup>
                </div>
                <CButton color="primary" className="text-white d-flex align-items-center gap-1" onClick={() => setAddModalVisible(true)}>
                  <CIcon icon={cilUserPlus} /> Add Member
                </CButton>
              </div>
            </CCardHeader>
            <CCardBody>
              {loading ? (
                <div className="text-center py-5">
                  <CSpinner color="primary" />
                </div>
              ) : (
                <CTable hover responsive align="middle">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Name</CTableHeaderCell>
                      <CTableHeaderCell>Designation</CTableHeaderCell>
                      <CTableHeaderCell>Loan A/C No.</CTableHeaderCell>
                      <CTableHeaderCell>Pending Loan</CTableHeaderCell>
                      <CTableHeaderCell>Share Money</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Actions</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {filteredMembers.map((member, index) => (
                      <CTableRow key={index}>
                        <CTableDataCell>
                          <span 
                            className="fw-bold text-primary" 
                            style={{ cursor: 'pointer' }} 
                            title="Click for 360° Profile"
                            onClick={() => { setSelectedProfile(member); setActiveTab(1); setProfileModalVisible(true); }}
                          >
                            {member.vendorNo}
                          </span>
                        </CTableDataCell>
                        <CTableDataCell>
                          <div 
                            className="fw-semibold text-primary" 
                            style={{ cursor: 'pointer' }} 
                            title="Click for 360° Profile"
                            onClick={() => { setSelectedProfile(member); setActiveTab(1); setProfileModalVisible(true); }}
                          >
                            {member.name}
                          </div>
                          <div className="small text-medium-emphasis">{member.emailId}</div>
                        </CTableDataCell>
                        <CTableDataCell>
                          {member.designation ? (
                            <CBadge color="info">{member.designation}</CBadge>
                          ) : (
                            <span className="text-muted small">Not set</span>
                          )}
                        </CTableDataCell>
                        <CTableDataCell>
                          <strong>{member.loanAccountNo || 'N/A'}</strong>
                        </CTableDataCell>
                        <CTableDataCell className="text-danger fw-semibold">₹{(member.pendingLoanBalance || 0).toLocaleString('en-IN')}</CTableDataCell>
                        <CTableDataCell className="text-success fw-semibold">₹{(member.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</CTableDataCell>
                        <CTableDataCell className="text-end">
                          <div className="d-flex justify-content-end gap-2 align-items-center">
                            {/* Edit */}
                            <CButton color="primary" size="sm" variant="ghost" title="Edit" onClick={() => { setEditFormData(member); setEditModalVisible(true); }}>
                              <CIcon icon={cilPencil} />
                            </CButton>

                            {/* Reset Password */}
                            <CButton 
                              color="warning" 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handlePasswordReset(member._id, member.name)}
                            >
                              Reset Password
                            </CButton>

                            {/* Delete */}
                            <CButton 
                              color="danger" 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete(member.vendorNo)}
                              title="Delete"
                            >
                              <CIcon icon={cilTrash} />
                            </CButton>
                          </div>
                        </CTableDataCell>
                      </CTableRow>
                    ))}
                    {filteredMembers.length === 0 && (
                      <CTableRow>
                        <CTableDataCell colSpan="7" className="text-center text-muted py-4">
                          No members found matching "{searchTerm}".
                        </CTableDataCell>
                      </CTableRow>
                    )}
                  </CTableBody>
                </CTable>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* --- ADD MEMBER MODAL --- */}
      <CModal visible={addModalVisible} onClose={() => setAddModalVisible(false)} alignment="center">
        <CModalHeader><CModalTitle>Add New Member</CModalTitle></CModalHeader>
        <CModalBody>
           <CForm>
             <CFormInput className="mb-3" label="Full Name" value={addFormData.name} onChange={(e) => setAddFormData({...addFormData, name: e.target.value})} />
             <CFormInput className="mb-3" label="Vendor No" value={addFormData.vendorNo} onChange={(e) => setAddFormData({...addFormData, vendorNo: e.target.value})} />
             
             {/* NEW: Date of Birth & Auto-Calculating Date of Retirement */}
             <CRow>
                <CCol sm={6}>
                  <CFormInput 
                    type="date" 
                    className="mb-3" 
                    label="Date of Birth" 
                    value={addFormData.dateOfBirth || ''} 
                    onChange={handleAddDobChange} 
                  />
                </CCol>
                <CCol sm={6}>
                  <CFormInput 
                    type="date" 
                    className="mb-3" 
                    label="Date of Retirement" 
                    value={addFormData.dateOfRetirement || ''} 
                    onChange={(e) => setAddFormData({...addFormData, dateOfRetirement: e.target.value})} 
                  />
                </CCol>
             </CRow>

             <CFormInput className="mb-3" label="Designation" value={addFormData.designation} onChange={(e) => setAddFormData({...addFormData, designation: e.target.value})} />
             <CFormInput className="mb-3" label="Loan A/C No" value={addFormData.loanAccountNo} onChange={(e) => setAddFormData({...addFormData, loanAccountNo: e.target.value})} />
             <CFormInput className="mb-3" label="Email ID" type="email" value={addFormData.emailId} onChange={(e) => setAddFormData({...addFormData, emailId: e.target.value})} />
           </CForm>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setAddModalVisible(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleAddMember}>{isSaving ? <CSpinner size="sm"/> : 'Create Member'}</CButton>
        </CModalFooter>
      </CModal>

      {/* --- EDIT MEMBER MODAL --- */}
      <CModal visible={editModalVisible} onClose={() => setEditModalVisible(false)} alignment="center">
        <CModalHeader><CModalTitle>Edit Member Details</CModalTitle></CModalHeader>
        <CModalBody>
           {editFormData && (
             <CForm>
               <CRow>
                 <CCol sm={6}>
                   <CFormInput className="mb-3" label="Name" value={editFormData.name || ''} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} />
                 </CCol>
                 <CCol sm={6}>
                   <CFormInput className="mb-3" label="Vendor No" value={editFormData.vendorNo || ''} onChange={(e) => setEditFormData({...editFormData, vendorNo: e.target.value})} />
                 </CCol>
               </CRow>
               
               <CRow>
                  <CCol sm={6}>
                    <CFormInput 
                      type="date" 
                      className="mb-3" 
                      label="Date of Birth" 
                      value={formatDateForInput(editFormData.dateOfBirth)} 
                      onChange={handleEditDobChange} 
                    />
                  </CCol>
                  <CCol sm={6}>
                    <CFormInput 
                      type="date" 
                      className="mb-3" 
                      label="Date of Retirement" 
                      value={formatDateForInput(editFormData.dateOfRetirement)} 
                      onChange={(e) => setEditFormData({...editFormData, dateOfRetirement: e.target.value})} 
                    />
                  </CCol>
               </CRow>

               <CRow>
                 <CCol sm={6}>
                   <CFormInput className="mb-3" label="Designation" value={editFormData.designation || ''} onChange={(e) => setEditFormData({...editFormData, designation: e.target.value})} />
                 </CCol>
                 <CCol sm={6}>
                   <div className="mb-3">
                     <label className="form-label">System Role</label>
                     <select 
                       className="form-select" 
                       value={editFormData.role || 'member'} 
                       onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}
                     >
                       <option value="member">Member</option>
                       <option value="executive">Executive Member</option>
                       <option value="admin">Administrator</option>
                     </select>
                   </div>
                 </CCol>
               </CRow>

               <CRow>
                 <CCol sm={6}>
                   <CFormInput className="mb-3" label="Loan A/C No" value={editFormData.loanAccountNo || ''} onChange={(e) => setEditFormData({...editFormData, loanAccountNo: e.target.value})} />
                 </CCol>
                 <CCol sm={6}>
                   <CFormInput className="mb-3" label="Email" value={editFormData.emailId || ''} onChange={(e) => setEditFormData({...editFormData, emailId: e.target.value})} />
                 </CCol>
               </CRow>
             </CForm>
           )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setEditModalVisible(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleUpdateMember}>{isSaving ? <CSpinner size="sm"/> : 'Save Changes'}</CButton>
        </CModalFooter>
      </CModal>

      {/* --- CUSTOMER 360° PROFILE MODAL --- */}
      <CModal size="lg" visible={profileModalVisible} onClose={() => setProfileModalVisible(false)} backdrop="static" alignment="center">
        <CModalHeader>
          <CModalTitle>{selectedProfile ? `${selectedProfile.name} - 360° Profile` : 'Member Profile'}</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {selectedProfile && (
            <>
              {/* Top Row: Basic Info */}
              <CRow className="mb-3 text-center text-sm-start">
                <CCol sm={4} className="mb-3 mb-sm-0">
                  <div className="text-medium-emphasis small">Vendor No</div>
                  <div className="fs-5 fw-semibold">{selectedProfile.vendorNo}</div>
                </CCol>
                <CCol sm={4} className="mb-3 mb-sm-0">
                  <div className="text-medium-emphasis small">Designation</div>
                  <div className="fs-5 fw-semibold">{selectedProfile.designation || 'N/A'}</div>
                </CCol>
                <CCol sm={4}>
                  <div className="text-medium-emphasis small">Loan A/C No</div>
                  <div className="fs-5 fw-semibold text-primary">{selectedProfile.loanAccountNo || 'N/A'}</div>
                </CCol>
              </CRow>

              {/* NEW: Bottom Row: Vital Dates */}
              <CRow className="mb-4 text-center text-sm-start border-bottom pb-3">
                <CCol sm={6} className="mb-3 mb-sm-0">
                  <div className="text-medium-emphasis small">Date of Birth</div>
                  <div className="fs-6 fw-semibold text-dark">
                    {selectedProfile.dateOfBirth ? new Date(selectedProfile.dateOfBirth).toLocaleDateString('en-IN') : 'Not Provided'}
                  </div>
                </CCol>
                <CCol sm={6}>
                  <div className="text-medium-emphasis small">Date of Retirement</div>
                  <div className="fs-6 fw-bold text-danger">
                    {selectedProfile.dateOfRetirement ? new Date(selectedProfile.dateOfRetirement).toLocaleDateString('en-IN') : 'Not Calculated'}
                  </div>
                </CCol>
              </CRow>

              <CNav variant="tabs" role="tablist">
                <CNavItem>
                  <CNavLink style={{ cursor: 'pointer' }} active={activeTab === 1} onClick={() => setActiveTab(1)}>
                    <CIcon icon={cilBank} className="me-2" /> RD Ledger (Savings)
                  </CNavLink>
                </CNavItem>
                <CNavItem>
                  <CNavLink style={{ cursor: 'pointer' }} active={activeTab === 2} onClick={() => setActiveTab(2)}>
                    <CIcon icon={cilMoney} className="me-2" /> Loan & Share Ledger
                  </CNavLink>
                </CNavItem>
              </CNav>

              <CTabContent className="pt-4">
                {/* TAB 1: RD LEDGER */}
                <CTabPane role="tabpanel" visible={activeTab === 1}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">RD Balance: <span className="text-success">₹{(selectedProfile.rdBalance || 0).toLocaleString('en-IN')}</span></h5>
                    <CButton color="primary" variant="outline" size="sm" onClick={handleDownloadPassbook}>
                      Download Passbook PDF
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
                        <CTableDataCell className="text-end fw-bold">₹{(selectedProfile.rdBalance || 1000).toLocaleString('en-IN')}</CTableDataCell>
                      </CTableRow>
                    </CTableBody>
                  </CTable>
                </CTabPane>

                {/* TAB 2: LOAN & SHARE LEDGER */}
                <CTabPane role="tabpanel" visible={activeTab === 2}>
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="mb-1">Pending Loan: <span className="text-danger">₹{(selectedProfile.pendingLoanBalance || 0).toLocaleString('en-IN')}</span></h5>
                      <div className="text-medium-emphasis small">
                        Share Money Balance: <strong className="text-success">₹{(selectedProfile.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</strong>
                      </div>
                    </div>
                    <CButton color="primary" variant="outline" size="sm" onClick={handleDownloadLoanStatement}>
                      Download Loan Statement PDF
                    </CButton>
                  </div>

                  <CTable bordered striped small responsive>
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell>Transaction Type</CTableHeaderCell>
                        <CTableHeaderCell className="text-end">Amount (₹)</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      <CTableRow>
                        <CTableDataCell>01-May-2026</CTableDataCell>
                        <CTableDataCell>Share Capital Contribution</CTableDataCell>
                        <CTableDataCell className="text-end fw-bold text-success">₹{(selectedProfile.currentShareMoneyTotal || 0).toLocaleString('en-IN')}</CTableDataCell>
                      </CTableRow>
                      {selectedProfile.pendingLoanBalance > 0 && (
                        <CTableRow>
                          <CTableDataCell>01-May-2026</CTableDataCell>
                          <CTableDataCell>Active Loan Outstanding ({selectedProfile.loanAccountNo || 'N/A'})</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-danger">₹{selectedProfile.pendingLoanBalance.toLocaleString('en-IN')}</CTableDataCell>
                        </CTableRow>
                      )}
                    </CTableBody>
                  </CTable>
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

export default MembersDirectory;
