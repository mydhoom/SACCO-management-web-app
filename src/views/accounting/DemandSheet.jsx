import React, { useState, useEffect, useMemo } from 'react';
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable,
  CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CSpinner, CFormInput, CInputGroup, CInputGroupText, CFormSelect,
  CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CBadge, CAlert
} from '@coreui/react';
import CIcon from '@coreui/icons-react';
import {
  cilCloudDownload, cilList, cilSend, cilCheckCircle,
  cilPencil, cilTrash, cilReload, cilSearch, cilX
} from '@coreui/icons';

const DEFAULT_ANNUAL_RATE = 0.10;

const fmt = (v) => {
  if (typeof v !== 'number' || Number.isNaN(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const getNextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return { month: MONTHS[d.getMonth()], year: d.getFullYear() };
};

const getBatchId = (month, year) =>
  `DEMAND-PAYROLL-${month.toUpperCase().substring(0, 3)}-${year}`;

// ─── Edit Demand Member Modal (Pre-Transfer) ──────────────────────────────────
const EditDemandMemberModal = ({ member, onClose, onSave }) => {
  const [rdAmount, setRdAmount]                 = useState(member.rdAmount || 0);
  const [loanPrincipalDue, setLoanPrincipalDue] = useState(member.loanPrincipalDue || 0);
  const [loanInterestDue, setLoanInterestDue]   = useState(member.loanInterestDue || 0);

  const numRd   = parseFloat(Number(rdAmount || 0).toFixed(2));
  const numPrin = parseFloat(Number(loanPrincipalDue || 0).toFixed(2));
  const numInt  = parseFloat(Number(loanInterestDue || 0).toFixed(2));
  const totalLoan = parseFloat((numPrin + numInt).toFixed(2));
  const grandTotal = parseFloat((numRd + totalLoan).toFixed(2));

  const handleSave = () => {
    onSave({
      ...member,
      rdAmount: numRd,
      loanPrincipalDue: numPrin,
      loanInterestDue: numInt,
      loanTotalDue: totalLoan,
      totalDeduction: grandTotal,
      isCustomEdited: true
    });
    onClose();
  };

  return (
    <CModal visible onClose={onClose} size="md" alignment="center">
      <CModalHeader style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', color: '#fff' }}>
        <CModalTitle className="text-white fw-bold d-flex align-items-center gap-2">
          <CIcon icon={cilPencil} />
          Edit Demand: {member.memberName} ({member.vendorNo})
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-4">
        <div className="mb-3">
          <label className="form-label fw-semibold">RD Monthly Deduction (₹)</label>
          <CFormInput
            type="number"
            min="0"
            step="0.01"
            value={rdAmount}
            onChange={e => setRdAmount(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Loan Principal Due (₹)</label>
          <CFormInput
            type="number"
            min="0"
            step="0.01"
            value={loanPrincipalDue}
            onChange={e => setLoanPrincipalDue(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Loan Interest Due (₹)</label>
          <CFormInput
            type="number"
            min="0"
            step="0.01"
            value={loanInterestDue}
            onChange={e => setLoanInterestDue(e.target.value)}
          />
        </div>

        <div className="p-3 rounded bg-light border d-flex justify-content-between align-items-center mt-3">
          <div>
            <div className="text-muted small">Total Loan (P+I)</div>
            <strong className="text-info">{fmt(totalLoan)}</strong>
          </div>
          <div className="text-end">
            <div className="text-muted small">Revised Total Deduction</div>
            <strong className="text-danger fs-5">{fmt(grandTotal)}</strong>
          </div>
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton
          style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', border: 'none' }}
          className="text-white fw-bold"
          onClick={handleSave}
        >
          Apply Changes
        </CButton>
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cancel
        </CButton>
      </CModalFooter>
    </CModal>
  );
};

const DemandSheet = () => {
  const [demandData, setDemandData]     = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [annualRate, setAnnualRate]     = useState(DEFAULT_ANNUAL_RATE);
  const [search, setSearch]             = useState('');
  const [editingMember, setEditingMember] = useState(null);

  // Month/year selectors
  const next = getNextMonth();
  const [selectedMonth, setSelectedMonth] = useState(next.month);
  const [selectedYear,  setSelectedYear]  = useState(next.year);

  // Transfer to Batch modal
  const [showTransferModal, setShowTransferModal]   = useState(false);
  const [isTransferring, setIsTransferring]         = useState(false);
  const [transferResult, setTransferResult]         = useState(null);
  const [transferError, setTransferError]           = useState('');

  const GLOBAL_BACKEND_URL =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    'http://localhost:5000';

  const token = localStorage.getItem('adminToken') || localStorage.getItem('token');

  const fetchDemandSheet = async () => {
    setIsGenerating(true);
    setTransferResult(null);
    setTransferError('');
    try {
      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/demand/generate`);
      const result   = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setDemandData(result.data);
      } else {
        alert(result.message || 'Failed to generate list.');
      }
    } catch (error) {
      console.error('Error fetching demand sheet:', error);
      alert('Server error generating demand sheet.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => { fetchDemandSheet(); }, []);

  const totals = useMemo(() => {
    const totalRD        = demandData.reduce((s, r) => s + (Number(r.rdAmount || 0)), 0);
    const totalPrincipal = demandData.reduce((s, r) => s + (Number(r.loanPrincipalDue || 0)), 0);
    const totalInterest  = demandData.reduce((s, r) => s + (Number(r.loanInterestDue || 0)), 0);
    const totalLoan      = demandData.reduce((s, r) => s + (Number(r.loanTotalDue || 0)), 0);
    const grand          = totalRD + totalLoan;
    return { totalRD, totalPrincipal, totalInterest, totalLoan, grand };
  }, [demandData]);

  const filteredData = useMemo(() => {
    if (!search) return demandData;
    const q = search.toLowerCase();
    return demandData.filter(r =>
      (r.memberName && r.memberName.toLowerCase().includes(q)) ||
      (r.vendorNo && r.vendorNo.toLowerCase().includes(q))
    );
  }, [demandData, search]);

  const handleUpdateMember = (updatedMember) => {
    setDemandData(prev => prev.map(m => m.vendorNo === updatedMember.vendorNo ? updatedMember : m));
  };

  const handleRemoveMember = (vendorNo) => {
    if (window.confirm(`Are you sure you want to remove ${vendorNo} from this demand recovery sheet?`)) {
      setDemandData(prev => prev.filter(m => m.vendorNo !== vendorNo));
    }
  };

  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const batchId = getBatchId(selectedMonth, selectedYear);

  const exportToCSV = () => {
    if (demandData.length === 0) { alert('No data to export!'); return; }
    const headers = [
      'Vendor Number','Member Name','Active Loan IDs',
      'RD Monthly (Rs)','Loan Principal Due (Rs)','Loan Interest Due (Rs)',
      'Loan Total Due (Rs)','Total Deduction (Rs)'
    ];
    const rows = demandData.map(row => [
      row.vendorNo || '',
      `"${row.memberName || ''}"`,
      `"${(row.activeLoanIds || []).join(', ') || 'N/A'}"`,
      Number(row.rdAmount || 0).toFixed(2),
      Number(row.loanPrincipalDue || 0).toFixed(2),
      Number(row.loanInterestDue  || 0).toFixed(2),
      Number(row.loanTotalDue     || 0).toFixed(2),
      Number(row.totalDeduction   || 0).toFixed(2)
    ]);
    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href  = URL.createObjectURL(blob);
    link.setAttribute('download', `HPSEBL_Demand_Sheet_${selectedMonth}_${selectedYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTransferToBatch = async () => {
    setIsTransferring(true);
    setTransferError('');
    try {
      const resp = await fetch(`${GLOBAL_BACKEND_URL}/api/demand/create-batch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ month: selectedMonth, year: selectedYear, members: demandData })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setTransferResult(data.data);
      } else {
        setTransferError(data.message || 'Failed to create batch.');
      }
    } catch (err) {
      setTransferError('Server error. Please try again.');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="shadow border-top-3" style={{ borderTopColor: '#4361ee' }}>
          <CCardHeader className="py-3 d-flex justify-content-between align-items-center bg-white flex-wrap gap-2">
            <h4 className="mb-0 d-flex align-items-center gap-2 text-dark fw-bold">
              <CIcon icon={cilList} size="lg" style={{ color: '#4361ee' }} />
              Monthly Demand Recovery List
            </h4>

            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Month Selector */}
              <CInputGroup size="sm" style={{ width: 160 }}>
                <CInputGroupText className="fw-semibold">Month</CInputGroupText>
                <CFormSelect
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                >
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </CFormSelect>
              </CInputGroup>

              {/* Year Selector */}
              <CInputGroup size="sm" style={{ width: 130 }}>
                <CInputGroupText className="fw-semibold">Year</CInputGroupText>
                <CFormSelect
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                >
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </CFormSelect>
              </CInputGroup>

              {/* Rate */}
              <CInputGroup size="sm" style={{ width: 160 }}>
                <CInputGroupText>Rate %</CInputGroupText>
                <CFormInput
                  type="number" step="0.01" min="0"
                  value={(annualRate * 100).toFixed(2)}
                  onChange={e => {
                    const v = parseFloat(e.target.value || '10') / 100;
                    setAnnualRate(Number.isFinite(v) ? v : DEFAULT_ANNUAL_RATE);
                  }}
                />
              </CInputGroup>

              <CButton color="primary" variant="outline" size="sm" onClick={fetchDemandSheet} disabled={isGenerating}>
                {isGenerating ? <CSpinner size="sm" /> : <><CIcon icon={cilReload} className="me-1" />Reset / Reload</>}
              </CButton>

              <CButton color="success" size="sm" className="text-white" onClick={exportToCSV} disabled={demandData.length === 0}>
                <CIcon icon={cilCloudDownload} className="me-1" />Export CSV
              </CButton>

              <CButton
                size="sm"
                className="text-white fw-bold"
                style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', border: 'none' }}
                disabled={demandData.length === 0}
                onClick={() => { setTransferResult(null); setTransferError(''); setShowTransferModal(true); }}
              >
                <CIcon icon={cilSend} className="me-1" />
                Transfer to Clearance
              </CButton>
            </div>
          </CCardHeader>

          <CCardBody className="p-4">
            {isGenerating ? (
              <div className="text-center py-5">
                <CSpinner color="primary" />
                <p className="mt-3 text-muted">Calculating outstanding balances and formatting ledgers...</p>
              </div>
            ) : (
              <>
                {/* Summary Banner */}
                <div className="d-flex flex-wrap gap-3 mb-4 p-3 rounded-3 border"
                  style={{ background: 'linear-gradient(135deg,#f0f4ff,#faf0ff)' }}>
                  <div className="d-flex flex-column align-items-center px-3 border-end">
                    <span className="text-muted small fw-semibold">Members</span>
                    <span className="fs-4 fw-bold text-dark">{demandData.length}</span>
                  </div>
                  <div className="d-flex flex-column align-items-center px-3 border-end">
                    <span className="text-muted small fw-semibold">Total RD</span>
                    <span className="fs-5 fw-bold text-primary">{fmt(totals.totalRD)}</span>
                  </div>
                  <div className="d-flex flex-column align-items-center px-3 border-end">
                    <span className="text-muted small fw-semibold">Loan Principal</span>
                    <span className="fs-5 fw-bold text-info">{fmt(totals.totalPrincipal)}</span>
                  </div>
                  <div className="d-flex flex-column align-items-center px-3 border-end">
                    <span className="text-muted small fw-semibold">Loan Interest</span>
                    <span className="fs-5 fw-bold text-warning">{fmt(totals.totalInterest)}</span>
                  </div>
                  <div className="d-flex flex-column align-items-center px-3">
                    <span className="text-muted small fw-semibold">Grand Total Recovery</span>
                    <span className="fs-4 fw-bold text-danger">{fmt(totals.grand)}</span>
                  </div>
                  <div className="d-flex align-items-center ms-auto">
                    <CBadge
                      style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', fontSize: 13 }}
                      className="px-3 py-2 text-white"
                    >
                      Batch ID: {batchId}
                    </CBadge>
                  </div>
                </div>

                {/* Search Bar & Table Header */}
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div className="small text-muted">
                    💡 <em>You can edit or exclude any member deduction directly in this table before transferring.</em>
                  </div>
                  <CInputGroup size="sm" style={{ maxWidth: 280 }}>
                    <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
                    <CFormInput
                      placeholder="Search member or vendor no..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                      <CButton color="secondary" variant="outline" onClick={() => setSearch('')}>
                        <CIcon icon={cilX} />
                      </CButton>
                    )}
                  </CInputGroup>
                </div>

                {/* Table */}
                <div className="table-responsive rounded-3 border shadow-sm">
                  <CTable hover align="middle" className="mb-0">
                    <CTableHead style={{ background: 'linear-gradient(135deg,#1e1e2f,#2d2b55)', color: '#fff' }}>
                      <CTableRow>
                        <CTableHeaderCell className="text-white py-3">#</CTableHeaderCell>
                        <CTableHeaderCell className="text-white">Vendor No.</CTableHeaderCell>
                        <CTableHeaderCell className="text-white">Member Name</CTableHeaderCell>
                        <CTableHeaderCell className="text-white text-end">RD Monthly</CTableHeaderCell>
                        <CTableHeaderCell className="text-white text-end">Loan Principal</CTableHeaderCell>
                        <CTableHeaderCell className="text-white text-end">Loan Interest</CTableHeaderCell>
                        <CTableHeaderCell className="text-white text-end">Loan Total</CTableHeaderCell>
                        <CTableHeaderCell
                          className="text-end py-3"
                          style={{ background: '#f72585', color: '#fff' }}
                        >
                          Total Deduction
                        </CTableHeaderCell>
                        <CTableHeaderCell className="text-white text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {filteredData.length > 0 ? filteredData.map((row, index) => (
                        <CTableRow key={row.vendorNo || index}
                          style={{
                            transition: 'background 0.2s',
                            background: row.isCustomEdited ? 'rgba(255, 183, 3, 0.08)' : undefined
                          }}
                          className="demand-row"
                        >
                          <CTableDataCell className="text-muted small">{index + 1}</CTableDataCell>
                          <CTableDataCell className="fw-bold text-primary">
                            {row.vendorNo || '—'}
                            {row.isCustomEdited && (
                              <CBadge color="warning" className="ms-1" size="sm" title="Manually Adjusted">
                                Edited
                              </CBadge>
                            )}
                          </CTableDataCell>
                          <CTableDataCell>{row.memberName || '—'}</CTableDataCell>
                          <CTableDataCell className="text-end">{fmt(Number(row.rdAmount || 0))}</CTableDataCell>
                          <CTableDataCell className="text-end text-info">{fmt(Number(row.loanPrincipalDue || 0))}</CTableDataCell>
                          <CTableDataCell className="text-end text-warning">{fmt(Number(row.loanInterestDue || 0))}</CTableDataCell>
                          <CTableDataCell className="text-end">{fmt(Number(row.loanTotalDue || 0))}</CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-danger"
                            style={{ background: 'rgba(247,37,133,0.06)' }}
                          >
                            {fmt(Number(row.totalDeduction || 0))}
                            {row.activeLoanIds?.length > 0 && (
                              <div className="small text-muted fw-normal">
                                Loans: {row.activeLoanIds.join(', ')}
                              </div>
                            )}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            <div className="d-flex gap-1 justify-content-center">
                              <CButton
                                color="info"
                                size="sm"
                                className="text-white px-2"
                                title="Edit Amount"
                                onClick={() => setEditingMember(row)}
                              >
                                <CIcon icon={cilPencil} />
                              </CButton>
                              <CButton
                                color="danger"
                                size="sm"
                                className="text-white px-2"
                                title="Remove from Demand"
                                onClick={() => handleRemoveMember(row.vendorNo)}
                              >
                                <CIcon icon={cilTrash} />
                              </CButton>
                            </div>
                          </CTableDataCell>
                        </CTableRow>
                      )) : (
                        <CTableRow>
                          <CTableDataCell colSpan="9" className="text-center text-muted py-5">
                            <CIcon icon={cilList} size="xxl" className="mb-3 opacity-25" /><br />
                            {search ? 'No members match your search filter.' : 'No active demands found for the upcoming cycle.'}
                          </CTableDataCell>
                        </CTableRow>
                      )}
                    </CTableBody>
                  </CTable>
                </div>
              </>
            )}
          </CCardBody>
        </CCard>
      </CCol>

      {/* ─── Edit Modal (Pre-Transfer) ─── */}
      {editingMember && (
        <EditDemandMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSave={handleUpdateMember}
        />
      )}

      {/* ─── Transfer to Financial Clearance Modal ─── */}
      <CModal
        visible={showTransferModal}
        onClose={() => !isTransferring && setShowTransferModal(false)}
        size="lg"
        alignment="center"
      >
        <CModalHeader className="py-3" style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', color: '#fff' }}>
          <CModalTitle className="fw-bold text-white d-flex align-items-center gap-2">
            <CIcon icon={cilSend} /> Transfer to Financial Clearance
          </CModalTitle>
        </CModalHeader>
        <CModalBody className="p-4">
          {transferResult ? (
            <CAlert color="success" className="mb-0">
              <h5 className="fw-bold mb-3">
                <CIcon icon={cilCheckCircle} className="me-2" />
                Batch Created Successfully!
              </h5>
              <div className="d-flex flex-wrap gap-3 mb-3">
                <div className="border rounded p-3 text-center flex-grow-1">
                  <div className="text-muted small">Batch ID</div>
                  <code className="fs-6 fw-bold">{transferResult.batchId}</code>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1">
                  <div className="text-muted small">Members</div>
                  <div className="fs-5 fw-bold">{transferResult.totalMembers}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1">
                  <div className="text-muted small">Total RD</div>
                  <div className="fs-6 fw-bold text-primary">{fmt(transferResult.totalRDAmount)}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1">
                  <div className="text-muted small">Total Loan</div>
                  <div className="fs-6 fw-bold text-info">{fmt(transferResult.totalLoanAmount)}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1">
                  <div className="text-muted small">Grand Total</div>
                  <div className="fs-5 fw-bold text-danger">{fmt(transferResult.grandTotalAmount)}</div>
                </div>
              </div>
              <p className="mb-2">
                Navigate to <strong>Financial Clearances</strong> to clear individual member entries.
              </p>
              <a href="#/admin/clearances" className="btn btn-sm btn-outline-primary"
                onClick={() => setShowTransferModal(false)}
              >
                Open Financial Clearances →
              </a>
            </CAlert>
          ) : (
            <>
              {transferError && <CAlert color="danger">{transferError}</CAlert>}
              <p className="mb-3">
                You are about to transfer the demand recovery list for{' '}
                <strong>{selectedMonth} {selectedYear}</strong> to Financial Clearances as a batch.
              </p>
              <div className="d-flex flex-wrap gap-3 mb-4">
                <div className="border rounded p-3 text-center flex-grow-1" style={{ background: '#f0f4ff' }}>
                  <div className="text-muted small">Batch ID</div>
                  <code className="fw-bold">{batchId}</code>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1" style={{ background: '#f0f4ff' }}>
                  <div className="text-muted small">Members</div>
                  <div className="fs-5 fw-bold">{demandData.length}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1" style={{ background: '#f0f4ff' }}>
                  <div className="text-muted small">Total RD</div>
                  <div className="fw-bold text-primary">{fmt(totals.totalRD)}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1" style={{ background: '#f0f4ff' }}>
                  <div className="text-muted small">Total Loan (P+I)</div>
                  <div className="fw-bold text-info">{fmt(totals.totalLoan)}</div>
                </div>
                <div className="border rounded p-3 text-center flex-grow-1" style={{ background: '#fff0f6' }}>
                  <div className="text-muted small">Grand Total</div>
                  <div className="fs-5 fw-bold text-danger">{fmt(totals.grand)}</div>
                </div>
              </div>
              <div className="alert alert-info py-2 mb-0 small">
                <strong>Note:</strong> Financial entries (credits to Loan Principal, Interest & RD) will be
                posted individually per member upon clearance. A single BRS-only memo entry will be created
                for bank reconciliation matching — it does <strong>not</strong> affect your financial balances or reports.
              </div>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          {!transferResult && (
            <CButton
              className="text-white fw-bold"
              style={{ background: 'linear-gradient(135deg,#4361ee,#7209b7)', border: 'none' }}
              onClick={handleTransferToBatch}
              disabled={isTransferring}
            >
              {isTransferring ? <><CSpinner size="sm" className="me-2" />Transferring...</> : '✔ Confirm & Transfer'}
            </CButton>
          )}
          <CButton color="secondary" variant="outline" onClick={() => setShowTransferModal(false)} disabled={isTransferring}>
            {transferResult ? 'Close' : 'Cancel'}
          </CButton>
        </CModalFooter>
      </CModal>

      <style>{`
        .demand-row:hover { background: rgba(67, 97, 238, 0.04) !important; }
      `}</style>
    </CRow>
  );
};

export default DemandSheet;
