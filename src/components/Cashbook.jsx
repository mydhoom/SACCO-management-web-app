import React, { useEffect, useMemo, useState } from 'react';

const Cashbook = () => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [cashbookData, setCashbookData] = useState({
    openingBalance: 0,
    closingBalance: 0,
    receipts: [],
    payments: []
  });

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  const GLOBAL_BACKEND_URL =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    'http://localhost:5000';

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(Number(amount) || 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB');
  };

  const cleanAmount = (amount) => Number(amount) || 0;

  const getCategory = (tx) =>
    tx.description ||
    tx.ledgerFolio ||
    tx.category ||
    tx.narration ||
    'Uncategorized';

  const getPartyName = (tx) =>
    tx.memberName ||
    tx.vendorName ||
    tx.vendorNo ||
    tx.memberNo ||
    tx.memberId?.name ||
    'System';

  const getReference = (tx) =>
    tx.voucherNumber ||
    tx.referenceNumber ||
    tx.transactionId ||
    tx._id ||
    'N/A';

  const getNarration = (tx) =>
    tx.narration ||
    tx.description ||
    tx.ledgerFolio ||
    'No narration';

  const fetchCashbookData = async () => {
    setLoading(true);
    setFeedback({ type: '', message: '' });
    setSelectedCategory(null);
    setModalSearch('');

    try {
      const response = await fetch(
        `${GLOBAL_BACKEND_URL}/api/reports/cashbook?startDate=${startDate}&endDate=${endDate}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load Cashbook data.');
      }

      if (data.success) {
        setCashbookData({
          openingBalance: cleanAmount(data.data?.openingBalance),
          closingBalance: cleanAmount(data.data?.closingBalance),
          receipts: Array.isArray(data.data?.receipts) ? data.data.receipts : [],
          payments: Array.isArray(data.data?.payments) ? data.data.payments : []
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Failed to load Cashbook data.'
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Server connection failed.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashbookData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analytics = useMemo(() => {
    const groupedReceipts = {};
    const groupedPayments = {};

    let totalReceipts = 0;
    let totalPayments = 0;

    cashbookData.receipts.forEach((tx) => {
      const category = getCategory(tx);
      const amount = cleanAmount(tx.amount);

      if (!groupedReceipts[category]) {
        groupedReceipts[category] = {
          total: 0,
          count: 0,
          items: []
        };
      }

      groupedReceipts[category].total += amount;
      groupedReceipts[category].count += 1;
      groupedReceipts[category].items.push(tx);
      totalReceipts += amount;
    });

    cashbookData.payments.forEach((tx) => {
      const category = getCategory(tx);
      const amount = cleanAmount(tx.amount);

      if (!groupedPayments[category]) {
        groupedPayments[category] = {
          total: 0,
          count: 0,
          items: []
        };
      }

      groupedPayments[category].total += amount;
      groupedPayments[category].count += 1;
      groupedPayments[category].items.push(tx);
      totalPayments += amount;
    });

    const receiptEntries = Object.entries(groupedReceipts).sort(
      (a, b) => b[1].total - a[1].total
    );

    const paymentEntries = Object.entries(groupedPayments).sort(
      (a, b) => b[1].total - a[1].total
    );

    const totalTransactions =
      cashbookData.receipts.length + cashbookData.payments.length;

    const netMovement = totalReceipts - totalPayments;

    const averageReceipt =
      cashbookData.receipts.length > 0
        ? totalReceipts / cashbookData.receipts.length
        : 0;

    const averagePayment =
      cashbookData.payments.length > 0
        ? totalPayments / cashbookData.payments.length
        : 0;

    const combinedTransactions = [
      ...cashbookData.receipts.map((tx) => ({
        ...tx,
        reportType: 'Receipt',
        receiptAmount: cleanAmount(tx.amount),
        paymentAmount: 0
      })),
      ...cashbookData.payments.map((tx) => ({
        ...tx,
        reportType: 'Payment',
        receiptAmount: 0,
        paymentAmount: cleanAmount(tx.amount)
      }))
    ].sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.createdAt || 0);
      const dateB = new Date(b.transactionDate || b.createdAt || 0);
      return dateA - dateB;
    });

    let runningBalance = cleanAmount(cashbookData.openingBalance);

    const runningLedger = combinedTransactions.map((tx) => {
      runningBalance += cleanAmount(tx.receiptAmount);
      runningBalance -= cleanAmount(tx.paymentAmount);

      return {
        ...tx,
        runningBalance
      };
    });

    const allAmounts = combinedTransactions.map((tx) =>
      cleanAmount(tx.amount)
    );

    const averageAmount =
      allAmounts.length > 0
        ? allAmounts.reduce((sum, amount) => sum + amount, 0) / allAmounts.length
        : 0;

    const largeTransactions = combinedTransactions.filter(
      (tx) => averageAmount > 0 && cleanAmount(tx.amount) > averageAmount * 5
    );

    const negativeTransactions = combinedTransactions.filter(
      (tx) => cleanAmount(tx.amount) < 0
    );

    const duplicateMap = {};
    combinedTransactions.forEach((tx) => {
      const key = [
        formatDate(tx.transactionDate || tx.createdAt),
        getPartyName(tx),
        cleanAmount(tx.amount),
        getCategory(tx)
      ].join('|');

      duplicateMap[key] = duplicateMap[key] || [];
      duplicateMap[key].push(tx);
    });

    const possibleDuplicates = Object.values(duplicateMap).filter(
      (items) => items.length > 1
    );

    return {
      groupedReceipts,
      groupedPayments,
      receiptEntries,
      paymentEntries,
      totalReceipts,
      totalPayments,
      totalTransactions,
      netMovement,
      averageReceipt,
      averagePayment,
      runningLedger,
      largeTransactions,
      negativeTransactions,
      possibleDuplicates,
      balancedTotal: cleanAmount(cashbookData.openingBalance) + totalReceipts
    };
  }, [cashbookData]);

  const receiptPercent = (amount) =>
    analytics.totalReceipts > 0
      ? ((amount / analytics.totalReceipts) * 100).toFixed(1)
      : '0.0';

  const paymentPercent = (amount) =>
    analytics.totalPayments > 0
      ? ((amount / analytics.totalPayments) * 100).toFixed(1)
      : '0.0';

  const csvEscape = (value) => {
    const safe = value === null || value === undefined ? '' : String(value);
    return `"${safe.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  };

  const downloadCSV = (csvContent, fileName) => {
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const exportSummaryCSV = () => {
    let csv = `CASHBOOK SUMMARY\n`;
    csv += `Period,${startDate} to ${endDate}\n\n`;

    csv += `Opening Balance,${cashbookData.openingBalance}\n`;
    csv += `Total Receipts,${analytics.totalReceipts}\n`;
    csv += `Total Payments,${analytics.totalPayments}\n`;
    csv += `Closing Balance,${cashbookData.closingBalance}\n`;
    csv += `Net Movement,${analytics.netMovement}\n`;
    csv += `Total Transactions,${analytics.totalTransactions}\n\n`;

    csv += `RECEIPTS Dr,Txn Count,Percentage,Amount,PAYMENTS Cr,Txn Count,Percentage,Amount\n`;
    csv += `To Balance b/d Opening,,,${cashbookData.openingBalance},,,,\n`;

    const maxRows = Math.max(
      analytics.receiptEntries.length,
      analytics.paymentEntries.length
    );

    for (let i = 0; i < maxRows; i++) {
      const receipt = analytics.receiptEntries[i];
      const payment = analytics.paymentEntries[i];

      const receiptName = receipt ? `To ${receipt[0]}` : '';
      const receiptCount = receipt ? receipt[1].count : '';
      const receiptPct = receipt ? `${receiptPercent(receipt[1].total)}%` : '';
      const receiptAmount = receipt ? receipt[1].total : '';

      const paymentName = payment ? `By ${payment[0]}` : '';
      const paymentCount = payment ? payment[1].count : '';
      const paymentPct = payment ? `${paymentPercent(payment[1].total)}%` : '';
      const paymentAmount = payment ? payment[1].total : '';

      csv += [
        csvEscape(receiptName),
        receiptCount,
        receiptPct,
        receiptAmount,
        csvEscape(paymentName),
        paymentCount,
        paymentPct,
        paymentAmount
      ].join(',') + '\n';
    }

    csv += `,,,,By Balance c/d Closing,,,${cashbookData.closingBalance}\n`;
    csv += `TOTAL,,,${analytics.balancedTotal},TOTAL,,,${analytics.balancedTotal}\n`;

    downloadCSV(csv, `Cashbook_Summary_${startDate}_to_${endDate}.csv`);
  };

  const exportDetailedCSV = () => {
    if (!cashbookData.receipts.length && !cashbookData.payments.length) {
      alert('No transactions available to export for this period.');
      return;
    }

    let csv = `DETAILED CASHBOOK LEDGER\n`;
    csv += `Period,${startDate} to ${endDate}\n\n`;
    csv += `Date,Type,Reference,Category,Folio,Member/Vendor,Payment Mode,Narration,Receipt In,Payment Out,Running Balance\n`;

    analytics.runningLedger.forEach((tx) => {
      csv += [
        csvEscape(formatDate(tx.transactionDate || tx.createdAt)),
        csvEscape(tx.reportType),
        csvEscape(getReference(tx)),
        csvEscape(getCategory(tx)),
        csvEscape(tx.ledgerFolio || 'N/A'),
        csvEscape(getPartyName(tx)),
        csvEscape(tx.paymentMode || 'AUTO'),
        csvEscape(getNarration(tx)),
        tx.receiptAmount || 0,
        tx.paymentAmount || 0,
        tx.runningBalance || 0
      ].join(',') + '\n';
    });

    downloadCSV(csv, `Cashbook_Detailed_${startDate}_to_${endDate}.csv`);
  };

  const exportSelectedCategoryCSV = () => {
    if (!selectedCategory) return;

    let csv = `${selectedCategory.type.toUpperCase()} FOLIO INVESTIGATION\n`;
    csv += `Category,${selectedCategory.name}\n`;
    csv += `Period,${startDate} to ${endDate}\n\n`;
    csv += `Date,Reference,Member/Vendor,Payment Mode,Narration,Amount\n`;

    selectedCategory.data.forEach((tx) => {
      csv += [
        csvEscape(formatDate(tx.transactionDate || tx.createdAt)),
        csvEscape(getReference(tx)),
        csvEscape(getPartyName(tx)),
        csvEscape(tx.paymentMode || 'AUTO'),
        csvEscape(getNarration(tx)),
        cleanAmount(tx.amount)
      ].join(',') + '\n';
    });

    csv += `\nTOTAL,,,,,${selectedCategory.data.reduce(
      (sum, tx) => sum + cleanAmount(tx.amount),
      0
    )}\n`;

    downloadCSV(
      csv,
      `Cashbook_${selectedCategory.type}_${selectedCategory.name}_${startDate}_to_${endDate}.csv`
    );
  };

  const filteredModalData = useMemo(() => {
    if (!selectedCategory) return [];

    const term = modalSearch.trim().toLowerCase();

    if (!term) return selectedCategory.data;

    return selectedCategory.data.filter((tx) => {
      const searchable = [
        getReference(tx),
        getPartyName(tx),
        getCategory(tx),
        getNarration(tx),
        tx.paymentMode,
        tx.ledgerFolio,
        tx.status
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [selectedCategory, modalSearch]);

  const MetricCard = ({ title, value, subtitle, variant = 'dark' }) => (
    <div className="bg-white rounded shadow-sm border p-3 h-100">
      <div className="text-xs text-muted fw-bold text-uppercase mb-1">
        {title}
      </div>
      <div className={`fs-4 fw-bold text-${variant}`}>{value}</div>
      {subtitle && <div className="text-xs text-muted mt-1">{subtitle}</div>}
    </div>
  );

  const TopCategoryList = ({ title, entries, type }) => (
    <div className="bg-white rounded shadow-sm border p-4 h-100">
      <h5 className="fw-bold mb-3 text-dark">{title}</h5>

      {entries.length === 0 ? (
        <div className="text-muted">No data available.</div>
      ) : (
        entries.slice(0, 5).map(([name, group], index) => {
          const percentage =
            type === 'receipt'
              ? receiptPercent(group.total)
              : paymentPercent(group.total);

          return (
            <div key={name} className="mb-3">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="fw-bold me-2">#{index + 1}</span>
                  <span>{name}</span>
                  <div className="text-xs text-muted">
                    {group.count} transaction{group.count === 1 ? '' : 's'} ·{' '}
                    {percentage}%
                  </div>
                </div>

                <div
                  className={`fw-bold ${
                    type === 'receipt' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatCurrency(group.total)}
                </div>
              </div>

              <div className="progress mt-2" style={{ height: '6px' }}>
                <div
                  className={`progress-bar ${
                    type === 'receipt' ? 'bg-success' : 'bg-danger'
                  }`}
                  style={{ width: `${Math.min(Number(percentage), 100)}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      <style>
        {`
          @media print {
            .header, .sidebar, .app-header, .app-sidebar, .footer, .d-print-none {
              display: none !important;
            }

            .wrapper, .body {
              padding: 0 !important;
              margin: 0 !important;
              overflow: visible !important;
            }

            body {
              background-color: #fff !important;
            }

            .container-fluid {
              padding: 0 !important;
            }

            .print-shadow-none {
              box-shadow: none !important;
            }
          }

          .clickable-row:hover {
            background-color: #f8f9fa;
            cursor: pointer;
            transition: 0.2s;
          }

          .t-account-table th,
          .t-account-table td {
            border-color: #000 !important;
          }

          .animate-fade-in {
            animation: fadeIn 0.25s ease-in-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(4px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .text-xs {
            font-size: 0.75rem;
          }

          .tracking-wider {
            letter-spacing: 0.06em;
          }

          .modal-backdrop-custom {
            background-color: rgba(0, 0, 0, 0.62);
            z-index: 1050;
          }
        `}
      </style>

      <div className="container-fluid pb-5 position-relative">
        {/* HEADER CONTROLS */}
        <div className="d-print-none mb-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center bg-white p-4 rounded shadow-sm border gap-4">
          <div>
            <h2 className="text-xl fw-bold text-dark m-0">Master Cashbook</h2>
            <div className="text-muted text-sm">
              Classic T-account report with cashflow analytics
            </div>
          </div>

          <div className="d-flex align-items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs fw-bold text-muted text-uppercase d-block">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-control fw-bold bg-light"
              />
            </div>

            <div>
              <label className="text-xs fw-bold text-muted text-uppercase d-block">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-control fw-bold bg-light"
              />
            </div>

            <button
              onClick={fetchCashbookData}
              className="btn btn-primary fw-bold px-4"
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Load Cashbook'}
            </button>
          </div>
        </div>

        {feedback.message && (
          <div
            className={`d-print-none p-3 mb-4 rounded border ${
              feedback.type === 'error'
                ? 'bg-danger text-white border-danger'
                : 'bg-success text-white border-success'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* EXECUTIVE SUMMARY */}
        <div className="d-print-none row g-3 mb-4">
          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Opening Balance"
              value={formatCurrency(cashbookData.openingBalance)}
              variant="primary"
            />
          </div>

          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Total Receipts"
              value={formatCurrency(analytics.totalReceipts)}
              subtitle={`${cashbookData.receipts.length} transactions`}
              variant="success"
            />
          </div>

          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Total Payments"
              value={formatCurrency(analytics.totalPayments)}
              subtitle={`${cashbookData.payments.length} transactions`}
              variant="danger"
            />
          </div>

          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Closing Balance"
              value={formatCurrency(cashbookData.closingBalance)}
              variant="dark"
            />
          </div>

          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Net Movement"
              value={formatCurrency(analytics.netMovement)}
              subtitle={analytics.netMovement >= 0 ? 'Cash increased' : 'Cash decreased'}
              variant={analytics.netMovement >= 0 ? 'success' : 'danger'}
            />
          </div>

          <div className="col-12 col-md-6 col-xl-2">
            <MetricCard
              title="Transactions"
              value={analytics.totalTransactions}
              subtitle={`${analytics.receiptEntries.length} receipt groups · ${analytics.paymentEntries.length} payment groups`}
              variant="secondary"
            />
          </div>
        </div>

        {/* AUDIT WARNINGS */}
        {(analytics.largeTransactions.length > 0 ||
          analytics.negativeTransactions.length > 0 ||
          analytics.possibleDuplicates.length > 0) && (
          <div className="d-print-none alert alert-warning border-warning shadow-sm mb-4">
            <div className="fw-bold mb-1">Audit Attention</div>
            <div className="small">
              {analytics.largeTransactions.length > 0 && (
                <div>
                  ⚠ {analytics.largeTransactions.length} unusually large transaction
                  {analytics.largeTransactions.length === 1 ? '' : 's'} detected.
                </div>
              )}

              {analytics.negativeTransactions.length > 0 && (
                <div>
                  ⚠ {analytics.negativeTransactions.length} negative transaction
                  {analytics.negativeTransactions.length === 1 ? '' : 's'} detected.
                </div>
              )}

              {analytics.possibleDuplicates.length > 0 && (
                <div>
                  ⚠ {analytics.possibleDuplicates.length} possible duplicate group
                  {analytics.possibleDuplicates.length === 1 ? '' : 's'} detected.
                </div>
              )}
            </div>
          </div>
        )}

        {/* T-FORMAT CASHBOOK */}
        <div className="bg-white p-5 rounded shadow-sm border animate-fade-in print:p-0 print:border-0 print-shadow-none">
          <div className="text-center mb-4 border-bottom border-dark pb-3 border-3">
            <h2 className="fw-bold text-uppercase tracking-wider text-dark mb-1">
              General Cashbook
            </h2>
            <p className="text-muted mb-0">
              For the period:{' '}
              <strong>
                {formatDate(startDate)} to {formatDate(endDate)}
              </strong>
            </p>
          </div>

          <div className="row g-0 border border-dark border-2">
            {/* LEFT SIDE: RECEIPTS */}
            <div className="col-12 col-lg-6 border-end border-dark border-2">
              <div className="bg-dark text-white text-center fw-bold py-2 tracking-wider">
                RECEIPTS Dr.
              </div>

              <table className="table table-borderless t-account-table mb-0 w-100">
                <thead className="border-bottom border-dark">
                  <tr>
                    <th className="py-2 px-3">Particulars / Category</th>
                    <th className="py-2 px-3 text-center" style={{ width: '90px' }}>
                      Txns
                    </th>
                    <th className="py-2 px-3 text-center" style={{ width: '80px' }}>
                      %
                    </th>
                    <th className="py-2 px-3 text-end" style={{ width: '150px' }}>
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td className="py-2 px-3 fw-bold text-primary">
                      To Balance b/d Opening
                    </td>
                    <td className="py-2 px-3 text-center text-muted">—</td>
                    <td className="py-2 px-3 text-center text-muted">—</td>
                    <td className="py-2 px-3 text-end fw-bold text-primary">
                      {formatCurrency(cashbookData.openingBalance)}
                    </td>
                  </tr>

                  {analytics.receiptEntries.map(([cat, group]) => (
                    <tr
                      key={`rec-${cat}`}
                      onClick={() => {
                        setSelectedCategory({
                          name: cat,
                          type: 'Receipts',
                          data: group.items
                        });
                        setModalSearch('');
                      }}
                      className="clickable-row"
                    >
                      <td className="py-2 px-3">
                        <span className="text-muted me-2">To</span>
                        {cat}
                      </td>
                      <td className="py-2 px-3 text-center">{group.count}</td>
                      <td className="py-2 px-3 text-center">
                        {receiptPercent(group.total)}%
                      </td>
                      <td className="py-2 px-3 text-end">
                        {formatCurrency(group.total)}
                      </td>
                    </tr>
                  ))}

                  {analytics.receiptEntries.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-4 text-center text-muted">
                        No receipts found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* RIGHT SIDE: PAYMENTS */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark text-white text-center fw-bold py-2 tracking-wider">
                PAYMENTS Cr.
              </div>

              <table className="table table-borderless t-account-table mb-0 w-100">
                <thead className="border-bottom border-dark">
                  <tr>
                    <th className="py-2 px-3">Particulars / Category</th>
                    <th className="py-2 px-3 text-center" style={{ width: '90px' }}>
                      Txns
                    </th>
                    <th className="py-2 px-3 text-center" style={{ width: '80px' }}>
                      %
                    </th>
                    <th className="py-2 px-3 text-end" style={{ width: '150px' }}>
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {analytics.paymentEntries.map(([cat, group]) => (
                    <tr
                      key={`pay-${cat}`}
                      onClick={() => {
                        setSelectedCategory({
                          name: cat,
                          type: 'Payments',
                          data: group.items
                        });
                        setModalSearch('');
                      }}
                      className="clickable-row"
                    >
                      <td className="py-2 px-3">
                        <span className="text-muted me-2">By</span>
                        {cat}
                      </td>
                      <td className="py-2 px-3 text-center">{group.count}</td>
                      <td className="py-2 px-3 text-center">
                        {paymentPercent(group.total)}%
                      </td>
                      <td className="py-2 px-3 text-end">
                        {formatCurrency(group.total)}
                      </td>
                    </tr>
                  ))}

                  {analytics.paymentEntries.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-4 text-center text-muted">
                        No payments found for this period.
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td colSpan="4" className="py-2">
                      <br />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-3 fw-bold text-danger">
                      By Balance c/d Closing
                    </td>
                    <td className="py-2 px-3 text-center text-muted">—</td>
                    <td className="py-2 px-3 text-center text-muted">—</td>
                    <td className="py-2 px-3 text-end fw-bold text-danger">
                      {formatCurrency(cashbookData.closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* BOTTOM BALANCING ROW */}
          <div className="row g-0 border-start border-end border-bottom border-dark border-2 bg-light">
            <div className="col-12 col-lg-6 border-end border-dark border-2 p-3 d-flex justify-content-between align-items-center">
              <strong className="text-uppercase tracking-wider">
                Total Receipts Side
              </strong>
              <strong className="fs-5 border-bottom border-top border-dark border-2 px-2 py-1">
                {formatCurrency(analytics.balancedTotal)}
              </strong>
            </div>

            <div className="col-12 col-lg-6 p-3 d-flex justify-content-between align-items-center">
              <strong className="text-uppercase tracking-wider">
                Total Payments Side
              </strong>
              <strong className="fs-5 border-bottom border-top border-dark border-2 px-2 py-1">
                {formatCurrency(analytics.balancedTotal)}
              </strong>
            </div>
          </div>

          <div className="d-print-none mt-5 d-flex justify-content-end gap-3 border-top pt-4 flex-wrap">
            <button
              onClick={exportSummaryCSV}
              className="btn btn-outline-dark fw-bold px-4"
            >
              📊 Export Summary CSV
            </button>

            <button
              onClick={exportDetailedCSV}
              className="btn btn-outline-success fw-bold px-4"
            >
              📋 Export Detailed Ledger CSV
            </button>

            <button
              onClick={() => window.print()}
              className="btn btn-dark fw-bold px-5"
            >
              🖨️ Print Cashbook
            </button>
          </div>
        </div>

        {/* ANALYTICS SECTION */}
        <div className="d-print-none row g-4 mt-4">
          <div className="col-12 col-xl-6">
            <TopCategoryList
              title="Top Receipt Sources"
              entries={analytics.receiptEntries}
              type="receipt"
            />
          </div>

          <div className="col-12 col-xl-6">
            <TopCategoryList
              title="Top Payment Categories"
              entries={analytics.paymentEntries}
              type="payment"
            />
          </div>
        </div>

        <div className="d-print-none row g-3 mt-1">
          <div className="col-12 col-md-3">
            <MetricCard
              title="Average Receipt"
              value={formatCurrency(analytics.averageReceipt)}
              variant="success"
            />
          </div>

          <div className="col-12 col-md-3">
            <MetricCard
              title="Average Payment"
              value={formatCurrency(analytics.averagePayment)}
              variant="danger"
            />
          </div>

          <div className="col-12 col-md-3">
            <MetricCard
              title="Receipt Groups"
              value={analytics.receiptEntries.length}
              variant="primary"
            />
          </div>

          <div className="col-12 col-md-3">
            <MetricCard
              title="Payment Groups"
              value={analytics.paymentEntries.length}
              variant="secondary"
            />
          </div>
        </div>

        {/* DRILL-DOWN MODAL */}
        {selectedCategory && (
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center d-print-none modal-backdrop-custom">
            <div
              className="bg-white rounded shadow-lg w-100 m-4 d-flex flex-column"
              style={{ maxWidth: '1050px', maxHeight: '85vh' }}
            >
              <div className="p-4 border-bottom d-flex justify-content-between align-items-start bg-light rounded-top gap-3">
                <div>
                  <h3 className="m-0 fw-bold text-dark">
                    Folio Investigation: {selectedCategory.name}
                  </h3>
                  <p className="text-muted m-0 text-sm">
                    {selectedCategory.type} Detail View ·{' '}
                    {selectedCategory.data.length} transaction
                    {selectedCategory.data.length === 1 ? '' : 's'}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedCategory(null)}
                  className="btn-close"
                  aria-label="Close"
                />
              </div>

              <div className="p-3 border-bottom bg-white">
                <div className="row g-3 align-items-center">
                  <div className="col-12 col-md-8">
                    <input
                      type="text"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Search by reference, member, vendor, narration, mode, or folio..."
                      className="form-control"
                    />
                  </div>

                  <div className="col-12 col-md-4 text-md-end">
                    <button
                      onClick={exportSelectedCategoryCSV}
                      className="btn btn-outline-success fw-bold"
                    >
                      Export This Folio
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 overflow-auto flex-1">
                <table className="table table-hover table-bordered mb-0">
                  <thead className="table-dark sticky-top">
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Member / Vendor</th>
                      <th>Mode</th>
                      <th>Narration</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredModalData.map((tx, idx) => (
                      <tr key={tx._id || tx.transactionId || idx}>
                        <td className="align-middle text-nowrap">
                          {formatDate(tx.transactionDate || tx.createdAt)}
                        </td>

                        <td className="align-middle">
                          <span className="font-monospace text-xs d-block text-muted">
                            {getReference(tx)}
                          </span>
                        </td>

                        <td className="align-middle fw-semibold text-dark">
                          {getPartyName(tx)}
                        </td>

                        <td className="align-middle">
                          <span className="badge bg-secondary">
                            {tx.paymentMode || 'AUTO'}
                          </span>
                        </td>

                        <td className="align-middle">
                          <div className="text-sm">{getNarration(tx)}</div>
                          {tx.status && (
                            <div className="text-xs text-muted">
                              Status: {tx.status}
                            </div>
                          )}
                        </td>

                        <td
                          className={`align-middle text-end fw-bold ${
                            selectedCategory.type === 'Receipts'
                              ? 'text-success'
                              : 'text-danger'
                          }`}
                        >
                          {formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}

                    {filteredModalData.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center text-muted py-4">
                          No matching transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot className="table-light fw-bold">
                    <tr>
                      <td colSpan="5" className="text-end py-3">
                        TOTAL SHOWN:
                      </td>
                      <td className="text-end py-3 text-dark">
                        {formatCurrency(
                          filteredModalData.reduce(
                            (sum, item) => sum + cleanAmount(item.amount),
                            0
                          )
                        )}
                      </td>
                    </tr>

                    {modalSearch && (
                      <tr>
                        <td colSpan="5" className="text-end py-3">
                          FULL FOLIO TOTAL:
                        </td>
                        <td className="text-end py-3 text-dark">
                          {formatCurrency(
                            selectedCategory.data.reduce(
                              (sum, item) => sum + cleanAmount(item.amount),
                              0
                            )
                          )}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              <div className="p-3 border-top bg-light text-end rounded-bottom">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="btn btn-secondary fw-bold px-4"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Cashbook;
