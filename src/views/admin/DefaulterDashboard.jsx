import React, { useState, useEffect } from 'react';
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CWidgetStatsF,
  CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell,
  CTableRow, CBadge, CSpinner, CAlert, CButton
} from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilWarning, cilSend, cilMoney, cilBell, cilCloudDownload } from '@coreui/icons';
import { generatePDF } from '../../utils/pdfGenerator';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

const DefaulterDashboard = () => {
  const [defaulters, setDefaulters] = useState([]);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    fetchDefaulters();
  }, []);

  const fetchDefaulters = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/dashboard/defaulters`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setDefaulters(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch defaulters.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching defaulters.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (vendorNo, daysOverdue, overdueAmount, emiAmount) => {
    try {
      setSendingReminder(vendorNo);
      setFeedbackMsg('');
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/dashboard/defaulters/remind`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ vendorNo, daysOverdue, overdueAmount, emiAmount })
      });
      const data = await response.json();
      if (data.success) {
        setFeedbackMsg(data.message);
      } else {
        alert(data.message || 'Failed to send reminder.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while sending the reminder.');
    } finally {
      setSendingReminder(null);
    }
  };

  const totalAtRisk = defaulters.reduce((sum, d) => sum + (d.pendingLoanBalance || 0), 0);
  const totalOverdue = defaulters.reduce((sum, d) => sum + (d.overdueAmount || 0), 0);
  const criticalCount = defaulters.filter(d => d.daysOverdue > 60).length;

  const getRiskBadge = (level) => {
    switch (level) {
      case 'Critical': return <CBadge color="danger" shape="rounded-pill">Critical (&gt;60 Days)</CBadge>;
      case 'High': return <CBadge color="warning" shape="rounded-pill">High (31-60 Days)</CBadge>;
      default: return <CBadge color="info" shape="rounded-pill">Warning (1-30 Days)</CBadge>;
    }
  };

  const handleDownloadPDF = async () => {
    const columns = ['Vendor No', 'Name', 'Phone', 'Days Overdue', 'Overdue Amount', 'Risk Level'];
    const data = defaulters.map(d => [
      d.vendorNo,
      d.name,
      d.phoneNumber || 'N/A',
      `${d.daysOverdue} Days`,
      formatCurrency(d.overdueAmount),
      d.riskLevel
    ]);

    await generatePDF({
      title: 'Active Defaulters Report',
      subtitle: `Total At Risk: ${formatCurrency(totalAtRisk)}`,
      filename: `Defaulters_Report_${new Date().toISOString().split('T')[0]}.pdf`,
      columns,
      data,
      summaryData: [
        `Total Defaulters: ${defaulters.length}`,
        `Total Overdue Amount: ${formatCurrency(totalOverdue)}`,
        `Critical Cases (>60 Days): ${criticalCount}`
      ]
    });
  };

  return (
    <div>
      <h3 className="mb-4">Defaulter Management</h3>

      {error && <CAlert color="danger">{error}</CAlert>}
      {feedbackMsg && <CAlert color="success" dismissible onClose={() => setFeedbackMsg('')}>{feedbackMsg}</CAlert>}

      {loading ? (
        <div className="text-center py-5">
          <CSpinner color="primary" />
          <p className="mt-3 text-muted">Scanning loan portfolios for defaulters...</p>
        </div>
      ) : (
        <>
          <CRow className="mb-4">
            <CCol xs={12} sm={6} lg={3}>
              <CWidgetStatsF
                className="mb-3 shadow-sm border-0"
                icon={<CIcon icon={cilWarning} height={24} />}
                color="danger"
                title="Total Defaulters"
                value={defaulters.length}
              />
            </CCol>
            <CCol xs={12} sm={6} lg={3}>
              <CWidgetStatsF
                className="mb-3 shadow-sm border-0"
                icon={<CIcon icon={cilMoney} height={24} />}
                color="warning"
                title="Total Amount Overdue"
                value={formatCurrency(totalOverdue)}
              />
            </CCol>
            <CCol xs={12} sm={6} lg={3}>
              <CWidgetStatsF
                className="mb-3 shadow-sm border-0"
                icon={<CIcon icon={cilBell} height={24} />}
                color="dark"
                title="Total Balance At Risk"
                value={formatCurrency(totalAtRisk)}
              />
            </CCol>
            <CCol xs={12} sm={6} lg={3}>
              <CWidgetStatsF
                className="mb-3 shadow-sm border-0"
                icon={<CIcon icon={cilWarning} height={24} />}
                color="danger"
                title="Critical Cases (>60 days)"
                value={criticalCount}
              />
            </CCol>
          </CRow>

          <CCard className="shadow-sm border-0 mb-4">
            <CCardHeader className="bg-white border-bottom-0 pt-4 pb-0 d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Active Defaulters List</h5>
              <CButton color="primary" onClick={handleDownloadPDF} disabled={defaulters.length === 0}>
                <CIcon icon={cilCloudDownload} className="me-2" />
                Download PDF Report
              </CButton>
            </CCardHeader>
            <CCardBody>
              <div className="table-responsive">
                <CTable align="middle" className="mb-0 border" hover responsive>
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Vendor No</CTableHeaderCell>
                      <CTableHeaderCell>Member Name</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Days Overdue</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Overdue Amount</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Pending Principal</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Risk Level</CTableHeaderCell>
                      <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {defaulters.length === 0 ? (
                      <CTableRow>
                        <CTableDataCell colSpan="7" className="text-center py-4 text-muted">
                          No defaulters found! All loan accounts are up to date.
                        </CTableDataCell>
                      </CTableRow>
                    ) : (
                      defaulters.map((d, idx) => (
                        <CTableRow key={idx}>
                          <CTableDataCell><strong>{d.vendorNo}</strong></CTableDataCell>
                          <CTableDataCell>
                            <div>{d.name}</div>
                            <div className="small text-muted">{d.phoneNumber || 'No phone'} | {d.emailId || 'No email'}</div>
                          </CTableDataCell>
                          <CTableDataCell className="text-center text-danger fw-bold">
                            {d.daysOverdue} Days
                          </CTableDataCell>
                          <CTableDataCell className="text-end fw-bold text-danger">
                            {formatCurrency(d.overdueAmount)}
                          </CTableDataCell>
                          <CTableDataCell className="text-end text-muted">
                            {formatCurrency(d.pendingLoanBalance)}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            {getRiskBadge(d.riskLevel)}
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            <CButton 
                              color="danger" 
                              variant="outline"
                              size="sm"
                              disabled={sendingReminder === d.vendorNo || !d.emailId}
                              onClick={() => handleSendReminder(d.vendorNo, d.daysOverdue, d.overdueAmount, d.monthlyEmiAmount)}
                            >
                              {sendingReminder === d.vendorNo ? (
                                <CSpinner size="sm" />
                              ) : (
                                <><CIcon icon={cilSend} className="me-1" /> Remind</>
                              )}
                            </CButton>
                          </CTableDataCell>
                        </CTableRow>
                      ))
                    )}
                  </CTableBody>
                </CTable>
              </div>
            </CCardBody>
          </CCard>
        </>
      )}
    </div>
  );
};

export default DefaulterDashboard;
