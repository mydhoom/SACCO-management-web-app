import React, { useState, useEffect, useMemo } from 'react';
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CTable,
  CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CSpinner,
  CFormInput, CInputGroup, CInputGroupText
} from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilCloudDownload, cilList } from '@coreui/icons';

const DEFAULT_ANNUAL_RATE = 0.10; // 10%

/**
 * Helper: format currency INR
 */
const fmt = (v) => {
  if (typeof v !== 'number' || Number.isNaN(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

/**
 * Compute monthly EMI interest/principal split for a single loan
 * - outstandingBalance: current principal outstanding
 * - monthlyEMI: scheduled EMI amount
 * - annualRate: decimal (e.g., 0.10 for 10%)
 *
 * Returns { interestDue, principalDue, totalDue }
 */
const splitLoanEMI = (outstandingBalance = 0, monthlyEMI = 0, annualRate = DEFAULT_ANNUAL_RATE) => {
  const monthlyRate = annualRate / 12;
  const interestDue = outstandingBalance * monthlyRate;
  const principalDue = Math.max(monthlyEMI - interestDue, 0);
  const totalDue = principalDue + interestDue;
  return { interestDue, principalDue, totalDue };
};

/**
 * Compute RD interest and maturity for monthly deposit P, months n, annualRate r (decimal)
 * interest = P * (r/12) * (n*(n+1)/2)
 * maturity = P * n + interest
 */
const computeRD = (monthlyDeposit = 0, months = 0, annualRate = DEFAULT_ANNUAL_RATE) => {
  if (monthlyDeposit <= 0 || months <= 0) return { rdInterest: 0, rdMaturity: 0 };
  const rMonthly = annualRate / 12;
  const rdInterest = monthlyDeposit * rMonthly * (months * (months + 1) / 2);
  const rdMaturity = monthlyDeposit * months + rdInterest;
  return { rdInterest, rdMaturity };
};

const DemandSheet = () => {
  const [demandData, setDemandData] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [annualRate, setAnnualRate] = useState(DEFAULT_ANNUAL_RATE); // decimal
  const [rdMonths, setRdMonths] = useState(12); // default RD tenure months

  const GLOBAL_BACKEND_URL =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    'http://localhost:5000';

  const fetchDemandSheet = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`${GLOBAL_BACKEND_URL}/api/loans/generate-demand-sheet`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        // Normalize and enrich each row with computed splits
        const enriched = result.data.map((row) => {
          // Backend expected fields (fallbacks)
          // row.activeLoans could be an array of loan objects or a comma string; adapt accordingly
          const activeLoans = Array.isArray(row.activeLoans) ? row.activeLoans : (row.activeLoans ? String(row.activeLoans).split(',') : []);
          // If backend provides loan objects with outstandingBalance and monthlyEMI, use them
          let loanPrincipalDue = 0;
          let loanInterestDue = 0;
          let loanTotalDue = 0;
          let activeLoanIds = 'N/A';

          if (Array.isArray(activeLoans) && activeLoans.length > 0) {
            // If activeLoans are objects
            if (typeof activeLoans[0] === 'object') {
              activeLoanIds = activeLoans.map(l => l.loanId || l.id || 'N/A').join(',');
              activeLoans.forEach((loan) => {
                const outstanding = Number(loan.outstandingBalance || loan.balance || 0);
                const emi = Number(loan.monthlyEMI || loan.emi || 0);
                const { interestDue, principalDue, totalDue } = splitLoanEMI(outstanding, emi, annualRate);
                loanPrincipalDue += principalDue;
                loanInterestDue += interestDue;
                loanTotalDue += totalDue;
              });
            } else {
              // If activeLoans are simple ids and backend provided aggregated fields
              activeLoanIds = activeLoans.join(',');
              loanPrincipalDue = Number(row.principalDue || 0);
              loanInterestDue = Number(row.interestDue || 0);
              loanTotalDue = Number(row.loanDemand || loanPrincipalDue + loanInterestDue || 0);
            }
          } else {
            // No active loans
            loanPrincipalDue = Number(row.principalDue || 0);
            loanInterestDue = Number(row.interestDue || 0);
            loanTotalDue = Number(row.loanDemand || 0);
          }

          // RD: if backend provides rdAmount (monthly deposit), compute RD interest & maturity
          const rdMonthly = Number(row.rdAmount || row.rdMonthly || 0);
          const { rdInterest, rdMaturity } = computeRD(rdMonthly, Number(row.rdMonths || rdMonths), annualRate);

          return {
            ...row,
            activeLoanIds,
            loanPrincipalDue,
            loanInterestDue,
            loanTotalDue,
            rdMonthly,
            rdInterest,
            rdMaturity,
            // totalDeduction fallback: loanTotalDue + rdMonthly
            totalDeduction: Number(row.totalDeduction || loanTotalDue + rdMonthly)
          };
        });
        setDemandData(enriched);
      } else {
        alert(result.message || 'Failed to generate list.');
      }
    } catch (error) {
      console.error('Error fetching demand sheet:', error);
      alert('Server error.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    // Auto-fetch when the page loads
    fetchDemandSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived totals using useMemo
  const totals = useMemo(() => {
    const totalRD = demandData.reduce((s, r) => s + (Number(r.rdMonthly || 0)), 0);
    const totalRDInterest = demandData.reduce((s, r) => s + (Number(r.rdInterest || 0)), 0);
    const totalPrincipal = demandData.reduce((s, r) => s + (Number(r.loanPrincipalDue || 0)), 0);
    const totalInterest = demandData.reduce((s, r) => s + (Number(r.loanInterestDue || 0)), 0);
    const totalLoan = demandData.reduce((s, r) => s + (Number(r.loanTotalDue || 0)), 0);
    const grand = totalRD + totalLoan;
    return { totalRD, totalRDInterest, totalPrincipal, totalInterest, totalLoan, grand };
  }, [demandData]);

  // CSV Export with breakdown
  const exportToCSV = () => {
    if (demandData.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = [
      'Vendor Number', 'Member Name', 'Active Loan IDs',
      'RD Monthly (Rs)', 'RD Interest Estimate (Rs)', 'RD Maturity Estimate (Rs)',
      'Loan Principal Due (Rs)', 'Loan Interest Due (Rs)', 'Loan Total Due (Rs)',
      'Total Deduction (Rs)'
    ];

    const rows = demandData.map(row => [
      row.vendorNo || '',
      `"${row.memberName || ''}"`,
      `"${row.activeLoanIds || 'N/A'}"`,
      Number(row.rdMonthly || 0).toFixed(2),
      Number(row.rdInterest || 0).toFixed(2),
      Number(row.rdMaturity || 0).toFixed(2),
      Number(row.loanPrincipalDue || 0).toFixed(2),
      Number(row.loanInterestDue || 0).toFixed(2),
      Number(row.loanTotalDue || 0).toFixed(2),
      Number(row.totalDeduction || 0).toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `HPSEBL_City_Div_Demand_Sheet_NextMonth_with_breakdown.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="shadow-sm border-top-dark border-top-3">
          <CCardHeader className="py-3 d-flex justify-content-between align-items-center bg-white">
            <h4 className="mb-0 d-flex align-items-center gap-2 text-dark">
              <CIcon icon={cilList} size="lg" />
              Monthly Demand Recovery List with Breakdown
            </h4>

            <div className="d-flex align-items-center gap-2">
              <CInputGroup size="sm" className="me-2">
                <CInputGroupText>Annual Rate %</CInputGroupText>
                <CFormInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={(annualRate * 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value || '10') / 100;
                    setAnnualRate(Number.isFinite(val) ? val : DEFAULT_ANNUAL_RATE);
                  }}
                />
              </CInputGroup>

              <CInputGroup size="sm" className="me-2">
                <CInputGroupText>RD Months</CInputGroupText>
                <CFormInput
                  type="number"
                  min="1"
                  value={rdMonths}
                  onChange={(e) => setRdMonths(Math.max(1, Number(e.target.value || 12)))}
                />
              </CInputGroup>

              <CButton color="primary" className="me-2" onClick={fetchDemandSheet} disabled={isGenerating}>
                Recalculate
              </CButton>

              <CButton color="success" className="text-white fw-bold shadow-sm" onClick={exportToCSV} disabled={demandData.length === 0}>
                <CIcon icon={cilCloudDownload} className="me-2" />
                Export for Payroll
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
                <div className="d-flex flex-wrap justify-content-between mb-4 bg-light p-3 rounded border">
                  <div className="me-3"><strong>Total Expected RD</strong> {fmt(totals.totalRD)}</div>
                  <div className="me-3"><strong>RD Interest Estimate</strong> {fmt(totals.totalRDInterest)}</div>
                  <div className="me-3"><strong>Total Principal Due</strong> {fmt(totals.totalPrincipal)}</div>
                  <div className="me-3"><strong>Total Interest Due</strong> {fmt(totals.totalInterest)}</div>
                  <div className="text-danger fw-bold fs-5">Total Recovery {fmt(totals.grand)}</div>
                </div>

                <CTable bordered hover responsive align="middle" className="shadow-sm">
                  <CTableHead color="dark">
                    <CTableRow>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Member Name</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">RD Monthly</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">RD Interest Est</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">RD Maturity Est</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Loan Principal Due</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Loan Interest Due</CTableHeaderCell>
                      <CTableHeaderCell className="text-end bg-warning text-dark">Total Deduction</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>

                  <CTableBody>
                    {demandData.length > 0 ? demandData.map((row, index) => (
                      <CTableRow key={index}>
                        <CTableDataCell className="fw-bold">{row.vendorNo || '—'}</CTableDataCell>
                        <CTableDataCell>{row.memberName || '—'}</CTableDataCell>

                        <CTableDataCell className="text-end">{fmt(Number(row.rdMonthly || 0))}</CTableDataCell>
                        <CTableDataCell className="text-end">{fmt(Number(row.rdInterest || 0))}</CTableDataCell>
                        <CTableDataCell className="text-end">{fmt(Number(row.rdMaturity || 0))}</CTableDataCell>

                        <CTableDataCell className="text-end">{fmt(Number(row.loanPrincipalDue || 0))}</CTableDataCell>
                        <CTableDataCell className="text-end">{fmt(Number(row.loanInterestDue || 0))}</CTableDataCell>

                        <CTableDataCell className="text-end fw-bold text-danger bg-light">
                          {fmt(Number(row.totalDeduction || (Number(row.loanTotalDue || 0) + Number(row.rdMonthly || 0))))}
                          {row.activeLoanIds && row.activeLoanIds !== 'N/A' && (
                            <div className="small text-muted">({row.activeLoanIds})</div>
                          )}
                        </CTableDataCell>
                      </CTableRow>
                    )) : (
                      <CTableRow>
                        <CTableDataCell colSpan="8" className="text-center text-muted py-4">
                          No active demands found for the upcoming cycle.
                        </CTableDataCell>
                      </CTableRow>
                    )}
                  </CTableBody>
                </CTable>
              </>
            )}
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  );
};

export default DemandSheet;
