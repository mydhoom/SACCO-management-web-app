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

import API_BASE_URL from '../../apiConfig'

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

  // Fetch all members from the backend
  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
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
  const calculateRetirementDate = (dobString, retirementAge = 58) => {
    if (!dobString) return '';
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return '';

    const birthDay = dob.getDate();
    const birthMonth = dob.getMonth();
    const birthYear = dob.getFullYear();
    const age = Number(retirementAge) === 60 ? 60 : 58;
    const retYear = birthYear + age;

    // Special Rule: If born on the 1st of a month, employee retires on the last day of the previous month
    // Otherwise, employee retires on the last day of the birth month
    const retirementDate = birthDay === 1
      ? new Date(retYear, birthMonth, 0)
      : new Date(retYear, birthMonth + 1, 0);

    // Format back to YYYY-MM-DD for the HTML input element
    const yyyy = retirementDate.getFullYear();
    const mm = String(retirementDate.getMonth() + 1).padStart(2, '0');
    const dd = String(retirementDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleAddDobChange = (e) => {
    const dob = e.target.value;
    const dor = calculateRetirementDate(dob, addFormData.retirementAge || 58);
    setAddFormData({ ...addFormData, dateOfBirth: dob, dateOfRetirement: dor });
  };

  const handleAddRetirementAgeChange = (e) => {
    const age = Number(e.target.value);
    const dor = calculateRetirementDate(addFormData.dateOfBirth, age);
    setAddFormData({ ...addFormData, retirementAge: age, dateOfRetirement: dor });
  };

  const handleEditDobChange = (e) => {
    const dob = e.target.value;
    const dor = calculateRetirementDate(dob, editFormData?.retirementAge || 58);
    setEditFormData({ ...editFormData, dateOfBirth: dob, dateOfRetirement: dor });
  };

  const handleEditRetirementAgeChange = (e) => {
    const age = Number(e.target.value);
    const dor = calculateRetirementDate(editFormData?.dateOfBirth, age);
    setEditFormData({ ...editFormData, retirementAge: age, dateOfRetirement: dor });
  };

  // Helper to format MongoDB ISO dates to HTML YYYY-MM-DD format
  const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    return isoString.split('T')[0];
  };
  // --------------------------------------------------

  const getAuthToken = () => localStorage.getItem('adminToken') || localStorage.getItem('token') || '';

  // Delete a member
  const handleDelete = async (vendorNo) => {
    if (!window.confirm(`Are you sure you want to completely remove Vendor No: ${vendorNo}?`)) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users/${vendorNo}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setMembers(members.filter(member => member.vendorNo !== vendorNo))
        alert(`Member with Vendor No: ${vendorNo} successfully deleted.`)
      } else {
        const errData = await response.json().catch(() => ({}))
        alert(`Failed to delete member: ${errData.error || 'Unauthorized or server error.'}`)
      }
    } catch (error) {
      console.error("Error deleting member:", error)
      alert("Network error while deleting member.")
    }
  }

  // Reset Password Function
  const handlePasswordReset = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to reset the password for ${userName} to the default?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
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
    // Client-side format checks
    const rawAcc = (addFormData.accountNumber || '').trim();
    if (rawAcc && !/^\d{9,18}$/.test(rawAcc)) {
      alert("Invalid Bank Account Number! Must contain 9 to 18 numeric digits.");
      return;
    }
    const rawIfsc = (addFormData.ifscCode || '').trim().toUpperCase();
    if (rawIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(rawIfsc)) {
      alert("Invalid IFSC Code format! (e.g. SBIN0000718)");
      return;
    }
    const rawUpi = (addFormData.upiId || '').trim();
    if (rawUpi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(rawUpi)) {
      alert("Invalid UPI ID format! (e.g. username@bankhandle)");
      return;
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify(addFormData)
      })
      if (response.ok) {
        setAddModalVisible(false)
        setAddFormData({ 
          name: '', vendorNo: '', designation: '', loanAccountNo: '', emailId: '', 
          dateOfBirth: '', retirementAge: 58, dateOfRetirement: '', 
          accountNumber: '', ifscCode: '', upiId: '' 
        })
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
    const rawAcc = (editFormData.accountNumber || '').trim();
    if (rawAcc && !/^\d{9,18}$/.test(rawAcc)) {
      alert("Invalid Bank Account Number! Must contain 9 to 18 numeric digits.");
      return;
    }
    const rawIfsc = (editFormData.ifscCode || '').trim().toUpperCase();
    if (rawIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(rawIfsc)) {
      alert("Invalid IFSC Code format! (e.g. SBIN0000718)");
      return;
    }
    const rawUpi = (editFormData.upiId || '').trim();
    if (rawUpi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(rawUpi)) {
      alert("Invalid UPI ID format! (e.g. username@bankhandle)");
      return;
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users/${editFormData._id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${getAuthToken()}` 
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
            <CCardHeader className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <strong className="fs-5">Members Directory</strong>
                <div className="small text-medium-emphasis">View, search, and manage registered society members</div>
              </div>
              <div className="d-flex gap-2">
                <CButton color="primary" onClick={() => setAddModalVisible(true)}>
                  <CIcon icon={cilUserPlus} className="me-2" /> Add Member
                </CButton>
              </div>
            </CCardHeader>
            <CCardBody>
              {/* Search Bar */}
              <div className="mb-3">
                <CInputGroup>
                  <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
                  <CFormInput 
                    placeholder="Search by Name, Vendor Number, or Loan Account Number..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </CInputGroup>
              </div>

              {/* Table */}
              {loading ? (
                <div className="text-center py-5"><CSpinner color="primary" /></div>
              ) : (
                <CTable align="middle" className="mb-0 border" hover responsive>
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Member Info</CTableHeaderCell>
                      <CTableHeaderCell>Vendor No</CTableHeaderCell>
                      <CTableHeaderCell>Designation</CTableHeaderCell>
                      <CTableHeaderCell>Date of Birth</CTableHeaderCell>
                      <CTableHeaderCell>Retirement Date</CTableHeaderCell>
                      <CTableHeaderCell>Role</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {filteredMembers.map((member) => (
                      <CTableRow key={member._id}>
                        <CTableDataCell>
                          <div className="fw-semibold text-primary" style={{ cursor: 'pointer' }} onClick={() => handleRowClick(member)}>
                            {member.name}
                          </div>
                          <div className="small text-medium-emphasis">{member.emailId || 'No email registered'}</div>
                        </CTableDataCell>
                        <CTableDataCell>
                          <CBadge color="secondary">{member.vendorNo}</CBadge>
                        </CTableDataCell>
                        <CTableDataCell>{member.designation || 'N/A'}</CTableDataCell>
                        <CTableDataCell>
                          {member.dob || member.dateOfBirth
                            ? new Date(member.dob || member.dateOfBirth).toLocaleDateString('en-IN')
                            : 'N/A'}
                        </CTableDataCell>
                        <CTableDataCell>
                          {member.retirementDate || member.dateOfRetirement ? (
                            <span className="badge bg-light text-primary border">
                              {new Date(member.retirementDate || member.dateOfRetirement).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          ) : 'N/A'}
                        </CTableDataCell>
                        <CTableDataCell>
                          <CBadge color={member.role === 'admin' ? 'danger' : (member.role === 'executive' ? 'warning' : 'info')}>
                            {member.role || 'member'}
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
                          <CButton color="info" variant="ghost" size="sm" onClick={() => handleRowClick(member)} title="View 360 Profile">
                            <CIcon icon={cilSearch} />
                          </CButton>
                          <CButton color="warning" variant="ghost" size="sm" onClick={() => handleEditClick(member)} title="Edit Member">
                            <CIcon icon={cilPencil} />
                          </CButton>
                          <CButton color="danger" variant="ghost" size="sm" onClick={() => handleDelete(member.vendorNo)} title="Delete Member">
                            <CIcon icon={cilTrash} />
                          </CButton>
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
      <CModal size="lg" visible={addModalVisible} onClose={() => setAddModalVisible(false)} alignment="center">
        <CModalHeader><CModalTitle>Add New Member</CModalTitle></CModalHeader>
        <CModalBody>
           <CForm>
             <CRow>
               <CCol sm={6}>
                 <CFormInput className="mb-3" label="Full Name" value={addFormData.name} onChange={(e) => setAddFormData({...addFormData, name: e.target.value})} />
               </CCol>
               <CCol sm={6}>
                 <CFormInput className="mb-3" label="Vendor No" value={addFormData.vendorNo} onChange={(e) => setAddFormData({...addFormData, vendorNo: e.target.value})} />
               </CCol>
             </CRow>
             
             {/* Date of Birth, Service Period & Auto-Calculating Date of Retirement */}
             <CRow>
                <CCol sm={4}>
                  <CFormInput 
                    type="date" 
                    className="mb-3" 
                    label="Date of Birth" 
                    value={addFormData.dateOfBirth || ''} 
                    onChange={handleAddDobChange} 
                  />
                </CCol>
                <CCol sm={4}>
                  <div className="mb-3">
                    <label className="form-label">Service Period (Age)</label>
                    <select 
                      className="form-select" 
                      value={addFormData.retirementAge || 58} 
                      onChange={handleAddRetirementAgeChange}
                    >
                      <option value={58}>58 Years (Standard)</option>
                      <option value={60}>60 Years (Extended)</option>
                    </select>
                  </div>
                </CCol>
                <CCol sm={4}>
                  <CFormLabel>Date of Retirement</CFormLabel>
                  <CFormInput 
                    type="date" 
                    className="mb-3 bg-light" 
                    value={addFormData.dateOfRetirement || ''} 
                    onChange={(e) => setAddFormData({...addFormData, dateOfRetirement: e.target.value})} 
                  />
                </CCol>
             </CRow>
             {addFormData.dateOfRetirement && (
               <div className="p-2 mb-3 rounded bg-light border text-primary small">
                 📅 <strong>Auto-Calculated Retirement: </strong>
                 {new Date(addFormData.dateOfRetirement).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} (Last day of birth month)
               </div>
             )}

             <CRow>
               <CCol sm={6}>
                 <CFormInput className="mb-3" label="Designation" value={addFormData.designation} onChange={(e) => setAddFormData({...addFormData, designation: e.target.value})} />
               </CCol>
               <CCol sm={6}>
                 <CFormInput className="mb-3" label="Loan A/C No" value={addFormData.loanAccountNo} onChange={(e) => setAddFormData({...addFormData, loanAccountNo: e.target.value})} />
               </CCol>
             </CRow>

             <CRow>
               <CCol sm={4}>
                 <CFormInput 
                   className="mb-3" 
                   label="Bank Account No" 
                   placeholder="9-18 digits"
                   value={addFormData.accountNumber || ''} 
                   onChange={(e) => setAddFormData({...addFormData, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 18)})} 
                 />
               </CCol>
               <CCol sm={4}>
                 <CFormInput 
                   className="mb-3 text-uppercase" 
                   label="IFSC Code" 
                   placeholder="e.g. SBIN0000718"
                   maxLength={11}
                   value={addFormData.ifscCode || ''} 
                   onChange={(e) => setAddFormData({...addFormData, ifscCode: e.target.value.toUpperCase()})} 
                 />
               </CCol>
               <CCol sm={4}>
                 <CFormInput 
                   className="mb-3" 
                   label="UPI ID" 
                   placeholder="name@upi"
                   value={addFormData.upiId || ''} 
                   onChange={(e) => setAddFormData({...addFormData, upiId: e.target.value.trim().toLowerCase()})} 
                 />
               </CCol>
             </CRow>

             <CFormInput className="mb-3" label="Email ID" type="email" value={addFormData.emailId} onChange={(e) => setAddFormData({...addFormData, emailId: e.target.value})} />
           </CForm>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setAddModalVisible(false)}>Cancel</CButton>
          <CButton color="primary" onClick={handleAddMember}>{isSaving ? <CSpinner size="sm"/> : 'Create Member'}</CButton>
        </CModalFooter>
      </CModal>

      {/* --- EDIT MEMBER MODAL --- */}
      <CModal size="lg" visible={editModalVisible} onClose={() => setEditModalVisible(false)} alignment="center">
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
                  <CCol sm={4}>
                    <CFormInput 
                      type="date" 
                      className="mb-3" 
                      label="Date of Birth" 
                      value={formatDateForInput(editFormData.dob || editFormData.dateOfBirth)} 
                      onChange={handleEditDobChange} 
                    />
                  </CCol>
                  <CCol sm={4}>
                    <div className="mb-3">
                      <label className="form-label">Service Period (Age)</label>
                      <select 
                        className="form-select" 
                        value={editFormData.retirementAge || 58} 
                        onChange={handleEditRetirementAgeChange}
                      >
                        <option value={58}>58 Years (Standard)</option>
                        <option value={60}>60 Years (Extended)</option>
                      </select>
                    </div>
                  </CCol>
                  <CCol sm={4}>
                    <CFormLabel>Date of Retirement</CFormLabel>
                    <CFormInput 
                      type="date" 
                      className="mb-3 bg-light" 
                      value={formatDateForInput(editFormData.retirementDate || editFormData.dateOfRetirement)} 
                      onChange={(e) => setEditFormData({...editFormData, dateOfRetirement: e.target.value, retirementDate: e.target.value})} 
                    />
                  </CCol>
               </CRow>
               {(editFormData.retirementDate || editFormData.dateOfRetirement) && (
                 <div className="p-2 mb-3 rounded bg-light border text-primary small">
                   📅 <strong>Auto-Calculated Retirement: </strong>
                   {new Date(editFormData.retirementDate || editFormData.dateOfRetirement).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} (Last day of birth month)
                 </div>
               )}

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
                 <CCol sm={4}>
                   <CFormInput 
                     className="mb-3" 
                     label="Bank Account No" 
                     placeholder="9-18 digits"
                     value={editFormData.accountNumber || editFormData.bankAccountNumber || ''} 
                     onChange={(e) => setEditFormData({...editFormData, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 18)})} 
                   />
                 </CCol>
                 <CCol sm={4}>
                   <CFormInput 
                     className="mb-3 text-uppercase" 
                     label="IFSC Code" 
                     placeholder="e.g. SBIN0000718"
                     maxLength={11}
                     value={editFormData.ifscCode || ''} 
                     onChange={(e) => setEditFormData({...editFormData, ifscCode: e.target.value.toUpperCase()})} 
                   />
                 </CCol>
                 <CCol sm={4}>
                   <CFormInput 
                     className="mb-3" 
                     label="UPI ID" 
                     placeholder="name@upi"
                     value={editFormData.upiId || ''} 
                     onChange={(e) => setEditFormData({...editFormData, upiId: e.target.value.trim().toLowerCase()})} 
                   />
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
