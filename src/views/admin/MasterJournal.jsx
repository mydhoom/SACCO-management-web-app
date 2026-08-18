import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generatePDF } from '../../utils/pdfGenerator';
import { API_BASE_URL } from '../../apiConfig';
import React, { useState, useEffect } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CTable, CTableBody,
  CTableDataCell, CTableHead, CTableHeaderCell, CTableRow, CButton,
  CSpinner, CAlert, CBadge, CModal, CModalHeader, CModalTitle,
  CModalBody, CModalFooter, CForm, CFormLabel, CFormInput, CFormSelect,
  CInputGroup, CInputGroupText
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilSearch, cilSpreadsheet, cilFile } from '@coreui/icons'

const MasterJournal = () => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // NEW: Search Filter State
  const [searchTerm, setSearchTerm] = useState('')
  
  // --- ADVANCED FILTER STATES ---
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedFY, setSelectedFY] = useState(''); 
  const [selectedMonth, setSelectedMonth] = useState(''); 

  // Modal & Form State
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    vendorNo: '',
    memberId: '64a1b2c3d4e5f6g7h8i9j0k1', 
    ledgerFolio: '', 
    category: 'MONTHLY_THRIFT',
    amount: '',
    entryType: 'CREDIT',
    paymentMode: 'CASH', 
    status: 'COMPLETED', 
    description: ''
  })

  // Fetch transactions on load
  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/transactions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      })
      if (!response.ok) throw new Error("Failed to fetch ledger")
      const data = await response.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch (err) {
      setError("Could not load the Master Journal data.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          ...formData,
          amount: Number(formData.amount)
        })
      })
      
      if (!response.ok) throw new Error("Failed to save transaction")
      
      await fetchTransactions()
      setVisible(false)
      setFormData({ ...formData, vendorNo: '', amount: '', description: '', ledgerFolio: '', paymentMode: 'CASH', status: 'COMPLETED' })
    } catch (err) {
      console.error(err)
      alert("Error saving transaction. Please check the inputs.")
    } finally {
      setSubmitting(false)
    }
  }

  // Formatting helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
  }
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // --- UPGRADED: ADVANCED FILTERING ENGINE ---
  const filteredTransactions = transactions.filter(trx => {
    const searchLower = searchTerm.toLowerCase();
    
    // Fallback to createdAt if transactionDate is undefined
    const txDate = new Date(trx.transactionDate || trx.createdAt);
    const txMonth = txDate.getMonth() + 1; // JavaScript months are 0-11, so we add 1

    // 1. Text Search Match
    const matchesSearch = searchTerm === '' ||
      (trx.vendorNo && trx.vendorNo.toLowerCase().includes(searchLower)) ||
      (trx.memberName && trx.memberName.toLowerCase().includes(searchLower)) ||
      (trx.description && trx.description.toLowerCase().includes(searchLower)) ||
      (trx.transactionId && trx.transactionId.toLowerCase().includes(searchLower));

    // 2. Custom Date Range Match
    const matchesStartDate = startDate === '' || new Date(startDate) <= txDate;
    const matchesEndDate = endDate === '' || new Date(`${endDate}T23:59:59`) >= txDate;

    // 3. Financial Year Match (April 1 to March 31)
    let matchesFY = true;
    if (selectedFY) {
      const [startYr, endYr] = selectedFY.split('-');
      const fyStartDate = new Date(`${startYr}-04-01T00:00:00`);
      const fyEndDate = new Date(`${endYr}-03-31T23:59:59`);
      matchesFY = txDate >= fyStartDate && txDate <= fyEndDate;
    }

    // 4. Specific Month Match
    let matchesMonth = true;
    if (selectedMonth) {
       matchesMonth = txMonth === parseInt(selectedMonth);
    }

    // A transaction only appears if it passes ALL active filters
    return matchesSearch && matchesStartDate && matchesEndDate && matchesFY && matchesMonth;
  })

  // --- EXPORT TO EXCEL ---
  const exportToExcel = () => {
    // 1. Format the data perfectly for Excel
    const exportData = filteredTransactions.map(tx => ({
      "Date": new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN'),
      "Vendor No.": tx.vendorNo,
      "Member Name": tx.memberName,
      "Folio": tx.ledgerFolio,
      "Category": tx.category.replace(/_/g, ' '),
      "Mode": tx.paymentMode,
      "Status": tx.status,
      "Debit (₹)": tx.entryType === 'DEBIT' ? tx.amount : 0,
      "Credit (₹)": tx.entryType === 'CREDIT' ? tx.amount : 0,
      "Batch ID": tx.batchId
    }));

    // 2. Build and download the workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Master Journal");
    XLSX.writeFile(workbook, `Master_Journal_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // --- EXPORT TO PDF ---
  const exportToPDF = async () => {
    // 1. Map data for the AutoTable
    const tableColumn = ["Date", "Vendor No.", "Name", "Folio", "Category", "Mode", "Debit (Rs)", "Credit (Rs)", "Status"];
    const tableRows = [];

    filteredTransactions.forEach(tx => {
      const txData = [
        new Date(tx.transactionDate || tx.createdAt).toLocaleDateString('en-IN'),
        tx.vendorNo,
        tx.memberName,
        tx.ledgerFolio,
        tx.category.replace(/_/g, ' '),
        tx.paymentMode,
        tx.entryType === 'DEBIT' ? tx.amount.toLocaleString('en-IN') : "-",
        tx.entryType === 'CREDIT' ? tx.amount.toLocaleString('en-IN') : "-",
        tx.status
      ];
      tableRows.push(txData);
    });

    // 2. Download the PDF using standardized utility
    await generatePDF({
      title: 'Master Journal Report',
      filename: `Master_Journal_${new Date().toISOString().split('T')[0]}.pdf`,
      columns: tableColumn,
      data: tableRows,
      orientation: 'landscape'
    });
  };

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="shadow-sm border-0">
          <CCardHeader className="bg-white d-flex flex-column flex-md-row justify-content-between align-items-md-center py-3 gap-3">
            <h4 className="mb-0 fw-bold text-heading-color">Master Journal (Ledger)</h4>
            
            <div className="d-flex gap-2">
              <CButton color="success" className="text-white fw-bold shadow-sm" onClick={exportToExcel}>
                <CIcon icon={cilSpreadsheet} className="me-2" /> Export to Excel
              </CButton>
              <CButton color="danger" className="text-white fw-bold shadow-sm" onClick={exportToPDF}>
                <CIcon icon={cilFile} className="me-2" /> Download PDF
              </CButton>
            </div>

            {/* NEW: Search Bar Restored */}
            <div className="d-flex flex-grow-1 mx-md-4" style={{ maxWidth: '400px' }}>
              <CInputGroup>
                <CInputGroupText className="bg-light"><CIcon icon={cilSearch} /></CInputGroupText>
                <CFormInput 
                  placeholder="Search Vendor No, Name, or details..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-light border-start-0"
                />
              </CInputGroup>
            </div>

            <CButton color="primary" className="fw-semibold d-flex align-items-center gap-2" onClick={() => setVisible(true)}>
              <CIcon icon={cilPlus} /> New Entry
            </CButton>
          </CCardHeader>

          {/* --- NEW: ADVANCED FILTER BAR --- */}
          <CCardBody className="bg-light border-bottom py-3">
            <CRow className="g-3 align-items-end">
              
              {/* Financial Year Dropdown */}
              <CCol xs={12} md={3}>
                <label className="fw-bold small text-muted mb-1">Financial Year</label>
                <select 
                  className="form-select shadow-sm" 
                  value={selectedFY} 
                  onChange={(e) => { setSelectedFY(e.target.value); setStartDate(''); setEndDate(''); }}
                >
                  <option value="">All Financial Years</option>
                  <option value="2024-2025">FY 2024-2025</option>
                  <option value="2025-2026">FY 2025-2026</option>
                  <option value="2026-2027">FY 2026-2027</option>
                  <option value="2027-2028">FY 2027-2028</option>
                </select>
              </CCol>

              {/* Month Dropdown */}
              <CCol xs={12} md={3}>
                <label className="fw-bold small text-muted mb-1">Month</label>
                <select 
                  className="form-select shadow-sm" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  <option value="">All Months</option>
                  <option disabled>--- Q1 ---</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option disabled>--- Q2 ---</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option disabled>--- Q3 ---</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                  <option disabled>--- Q4 ---</option>
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                </select>
              </CCol>

              {/* Custom Date Range */}
              <CCol xs={12} md={4}>
                <label className="fw-bold small text-muted mb-1">Custom Date Range</label>
                <div className="d-flex gap-2">
                  <input 
                    type="date" 
                    className="form-control shadow-sm" 
                    value={startDate} 
                    onChange={(e) => { setStartDate(e.target.value); setSelectedFY(''); }} 
                  />
                  <span className="align-self-center text-muted">to</span>
                  <input 
                    type="date" 
                    className="form-control shadow-sm" 
                    value={endDate} 
                    onChange={(e) => { setEndDate(e.target.value); setSelectedFY(''); }} 
                  />
                </div>
              </CCol>

              {/* Clear Filters Button */}
              <CCol xs={12} md={2} className="text-end">
                <button 
                  className="btn btn-outline-secondary w-100 shadow-sm fw-bold"
                  onClick={() => {
                    setSelectedFY('');
                    setSelectedMonth('');
                    setStartDate('');
                    setEndDate('');
                    setSearchTerm('');
                  }}
                >
                  Clear Filters
                </button>
              </CCol>

            </CRow>
          </CCardBody>
          {/* --- END ADVANCED FILTER BAR --- */}

          <CCardBody>
            {error && <CAlert color="danger">{error}</CAlert>}
            
            {loading ? (
              <div className="text-center py-5"><CSpinner color="primary" /></div>
            ) : (
              <CTable hover responsive align="middle" className="border mb-0">
                <CTableHead color="light">
                  <CTableRow>
                    <CTableHeaderCell>Date</CTableHeaderCell>
                    
                    <CTableHeaderCell className="bg-secondary bg-opacity-10 border-start">Vendor No.</CTableHeaderCell>
                    <CTableHeaderCell className="bg-secondary bg-opacity-10 border-end">Member Name</CTableHeaderCell>
                    
                    <CTableHeaderCell>Folio</CTableHeaderCell>
                    <CTableHeaderCell>Particulars</CTableHeaderCell>
                    <CTableHeaderCell>Mode & Status</CTableHeaderCell>
                    <CTableHeaderCell className="text-end text-danger">Debit (₹)</CTableHeaderCell>
                    <CTableHeaderCell className="text-end text-success">Credit (₹)</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {/* Mapping to use filteredTransactions */}
                  {filteredTransactions.length > 0 ? filteredTransactions.map((trx) => (
                    <CTableRow key={trx._id || trx.transactionId}>
                      <CTableDataCell className="text-medium-emphasis small">
                        {formatDate(trx.transactionDate || trx.createdAt)}
                        <br/>
                        <span className="text-muted" style={{fontSize: '0.75rem'}}>{trx.transactionId}</span>
                      </CTableDataCell>
                      
                      <CTableDataCell className="border-start bg-light fw-bold text-dark">
                        {trx.vendorNo && trx.vendorNo.startsWith('SYS-') ? (
                          <CBadge color="dark" shape="rounded-pill">System Entry</CBadge>
                        ) : (
                          trx.vendorNo || '-'
                        )}
                      </CTableDataCell>
                      
                      <CTableDataCell className="border-end bg-light fw-semibold text-primary">
                        {trx.memberName || '-'}
                      </CTableDataCell>

                      <CTableDataCell className="fw-semibold text-medium-emphasis">
                        {trx.ledgerFolio || '-'}
                      </CTableDataCell>

                      <CTableDataCell>
                        <div className="fw-semibold">{trx.description}</div>
                        <CBadge color="secondary" shape="rounded-pill" className="mt-1">
                          {trx.category.replace(/_/g, ' ')}
                        </CBadge>
                        {trx.batchId && <div className="text-muted small mt-1">Batch: {trx.batchId.split('-')[1]}</div>}
                      </CTableDataCell>

                      <CTableDataCell>
                        <div className="small fw-semibold">{trx.paymentMode || 'CASH'}</div>
                        <CBadge 
                          color={
                            trx.status === 'REVERSED'   ? 'warning' :
                            trx.category === 'REVERSAL' ? 'dark'    :
                            trx.status === 'PENDING'    ? 'info'    :
                            trx.status === 'FAILED'     ? 'danger'  : 'success'
                          } 
                          shape="rounded-pill" className="mt-1"
                        >
                          {trx.status || 'COMPLETED'}
                        </CBadge>
                      </CTableDataCell>

                      <CTableDataCell className="text-end fw-bold text-danger">
                        {trx.entryType === 'DEBIT' ? formatCurrency(trx.amount) : '-'}
                      </CTableDataCell>
                      <CTableDataCell className="text-end fw-bold text-success">
                        {trx.entryType === 'CREDIT' ? formatCurrency(trx.amount) : '-'}
                      </CTableDataCell>
                    </CTableRow>
                  )) : (
                    <CTableRow>
                      <CTableDataCell colSpan="8" className="text-center py-4 text-medium-emphasis">
                        No transactions found matching your search.
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </CTableBody>
              </CTable>
            )}
          </CCardBody>
        </CCard>
      </CCol>

      {/* --- ADD NEW TRANSACTION MODAL --- */}
      <CModal visible={visible} onClose={() => setVisible(false)} alignment="center" size="lg">
        <CForm onSubmit={handleSubmit}>
          <CModalHeader onClose={() => setVisible(false)}>
            <CModalTitle>Add Ledger Entry</CModalTitle>
          </CModalHeader>
          <CModalBody>
            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel>Vendor No. / Ref</CFormLabel>
                <CFormInput type="text" required value={formData.vendorNo} onChange={(e) => setFormData({...formData, vendorNo: e.target.value})} placeholder="e.g., VEND-501" />
              </CCol>
              <CCol md={6}>
                <CFormLabel>Ledger Folio</CFormLabel>
                <CFormInput type="text" value={formData.ledgerFolio} onChange={(e) => setFormData({...formData, ledgerFolio: e.target.value})} placeholder="e.g., 151, 154" />
              </CCol>
            </CRow>
            
            <CRow className="mb-3">
              <CCol md={12}>
                <CFormLabel>Account Category</CFormLabel>
                <CFormSelect value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                  <option value="SHARE_CAPITAL">Share Capital (Folio 155)</option>
                  <option value="MONTHLY_THRIFT">Monthly Thrift</option>
                  <option value="RECURRING_DEPOSIT">Recurring Deposit Account (Folio 154)</option>
                  <option value="LOAN_DISBURSEMENT">Loan Disbursement (Folio 152)</option>
                  <option value="LOAN_EMI">Loan EMI Payment</option>
                  <option value="DIVIDEND_PAYOUT">Members Dividend Payable (Folio 158)</option>
                  <option value="HONORARIUM">Honorarium Account (Folio 157)</option>
                  <option value="ADMISSION_FEE">Admission Fees (Folio 157)</option>
                  <option value="STATIONARY_MISC">Stationary/Miscellaneous (Folio 157)</option>
                  <option value="AUDIT_FEE">Audit Fees (Folio 157)</option>
                  <option value="RESERVE_FUND">Reserve Fund (Folio 159)</option>
                  <option value="EDUCATION_FUND">Co.Op. Education Fund (Folio 159)</option>
                  <option value="WELFARE_FUND">Welfare Fund</option>
                </CFormSelect>
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel>Amount (₹)</CFormLabel>
                <CFormInput type="number" min="1" required value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} placeholder="Enter amount" />
              </CCol>
              <CCol md={6}>
                <CFormLabel>Entry Type</CFormLabel>
                <CFormSelect value={formData.entryType} onChange={(e) => setFormData({...formData, entryType: e.target.value})}>
                  <option value="CREDIT">CREDIT (Income / Receipt)</option>
                  <option value="DEBIT">DEBIT (Expense / Disbursement)</option>
                </CFormSelect>
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel>Payment Mode</CFormLabel>
                <CFormSelect value={formData.paymentMode} onChange={(e) => setFormData({...formData, paymentMode: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                  <option value="UPI">UPI</option>
                  <option value="INTERNAL_TRANSFER">Internal Ledger Transfer</option>
                </CFormSelect>
              </CCol>
              <CCol md={6}>
                <CFormLabel>Status</CFormLabel>
                <CFormSelect value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                  <option value="COMPLETED">Completed (Cleared)</option>
                  <option value="PENDING">Pending (Cheque in Transit / Processing)</option>
                  <option value="FAILED">Failed / Bounced</option>
                </CFormSelect>
              </CCol>
            </CRow>

            <div className="mb-3">
              <CFormLabel>Particulars / Description</CFormLabel>
              <CFormInput type="text" required value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="e.g., Interest on S/B A/C HPS Co.Op.Bank" />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setVisible(false)}>Cancel</CButton>
            <CButton color="primary" type="submit" disabled={submitting}>
              {submitting ? <CSpinner size="sm" /> : 'Save Entry'}
            </CButton>
          </CModalFooter>
        </CForm>
      </CModal>
    </CRow>
  )
}

export default MasterJournal
