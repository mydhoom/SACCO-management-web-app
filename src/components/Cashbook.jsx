import React, { useEffect, useMemo, useState } from 'react';
import { generatePDF } from '../utils/pdfGenerator';

const Cashbook = () => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [reversalFilter, setReversalFilter] = useState('EFFECTIVE'); // 'EFFECTIVE', 'ALL_WITH_REVERSALS', 'REVERSALS_ONLY'

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [cashbookData, setCashbookData] = useState({
    openingBalance: 0,
    closingBalance: 0,
    receipts: [],
    payments: [],
    summary: {
      grossReceiptsTotal: 0,
      reversedReceiptsTotal: 0,
      effectiveReceiptsTotal: 0,
      grossPaymentsTotal: 0,
      reversedPaymentsTotal: 0,
      effectivePaymentsTotal: 0,
      netMovement: 0
    }
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
    tx.category ||
    tx.narration ||
    (tx.ledgerFolio ? `Folio ${tx.ledgerFolio}` : 'Uncategorized');

  const getFolio = (tx) => tx.ledgerFolio || '100';

  const getPartyName = (tx) =>
    tx.memberName ||
    tx.vendorName ||
    tx.vendorNo ||
    tx.memberNo ||
    tx.memberId?.name ||
    'Society Account';

  const getReference = (tx) =>
    tx.voucherNumber ||
    tx.referenceNumber ||
    tx.transactionId ||
    tx._id ||
    'N/A';

  const getNarration = (tx) =>
    tx.narration ||
    tx.description ||
    `Folio ${tx.ledgerFolio || 'N/A'}`;

  const fetchCashbookData = async () => {
    setLoading(true);
    setFeedback({ type: '', message: '' });
    setSelectedCategory(null);
    setModalSearch('');

    try {
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('adminToken') ||
        '';

      const response = await fetch(
        `${GLOBAL_BACKEND_URL}/api/reports/cashbook?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        }
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
          payments: Array.isArray(data.data?.payments) ? data.data.payments : [],
          summary: data.data?.summary || {
            grossReceiptsTotal: 0,
            reversedReceiptsTotal: 0,
            effectiveReceiptsTotal: 0,
            grossPaymentsTotal: 0,
            reversedPaymentsTotal: 0,
            effectivePaymentsTotal: 0,
            netMovement: 0
          }
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
    // Mode match helper
    const isModeMatch = (tx) => {
      if (paymentModeFilter === 'ALL') return true;
      const mode = (tx.paymentMode || '').toUpperCase();
      return mode === paymentModeFilter.toUpperCase();
    };

    // 1. Calculate overall financial reconciliation totals for the date period
    let grossReceipts = 0;
    let reversedReceipts = 0;
    let effectiveReceipts = 0;
    let reversedReceiptsCount = 0;

    let grossPayments = 0;
    let reversedPayments = 0;
    let effectivePayments = 0;
    let reversedPaymentsCount = 0;

    let effectiveTransactionsCount = 0;
    let grossTransactionsCount = 0;

    cashbookData.receipts.forEach((tx) => {
      if (!isModeMatch(tx)) return;
      const amount = cleanAmount(tx.amount);
      const isRev = tx.isReversed || tx.status === 'REVERSED' || tx.category === 'REVERSAL';

      grossReceipts += amount;
      grossTransactionsCount += 1;

      if (isRev) {
        reversedReceipts += amount;
        reversedReceiptsCount += 1;
      } else {
        effectiveReceipts += amount;
        effectiveTransactionsCount += 1;
      }
    });

    cashbookData.payments.forEach((tx) => {
      if (!isModeMatch(tx)) return;
      const amount = cleanAmount(tx.amount);
      const isRev = tx.isReversed || tx.status === 'REVERSED' || tx.category === 'REVERSAL';

      grossPayments += amount;
      grossTransactionsCount += 1;

      if (isRev) {
        reversedPayments += amount;
        reversedPaymentsCount += 1;
      } else {
        effectivePayments += amount;
        effectiveTransactionsCount += 1;
      }
    });

    // 2. Filter transactions for the T-Account table based on reversalFilter
    const isReversalMatch = (tx) => {
      const isRev = tx.isReversed || tx.status === 'REVERSED';
      const isCounter = tx.isReversalCounter || tx.category === 'REVERSAL';

      if (reversalFilter === 'EFFECTIVE') {
        return !isRev && !isCounter;
      }
      if (reversalFilter === 'REVERSALS_ONLY') {
        return isRev || isCounter;
      }
      return true; // 'ALL_WITH_REVERSALS'
    };

    const filteredReceipts = cashbookData.receipts.filter(
      (tx) => isModeMatch(tx) && isReversalMatch(tx)
    );

    const filteredPayments = cashbookData.payments.filter(
      (tx) => isModeMatch(tx) && isReversalMatch(tx)
    );

    // 3. Grouping for T-Account table display
    const groupedReceipts = {};
    const groupedPayments = {};

    filteredReceipts.forEach((tx) => {
      const category = getCategory(tx);
      const folio = getFolio(tx);
      const amount = cleanAmount(tx.amount);
      const key = `${folio} - ${category}`;

      if (!groupedReceipts[key]) {
        groupedReceipts[key] = {
          categoryName: category,
          folio,
          total: 0,
          count: 0,
          items: []
        };
      }

      const isRev = tx.isReversed || tx.status === 'REVERSED' || tx.category === 'REVERSAL';
      if (!isRev || reversalFilter === 'REVERSALS_ONLY') {
        groupedReceipts[key].total += amount;
      }

      groupedReceipts[key].count += 1;
      groupedReceipts[key].items.push(tx);
    });

    filteredPayments.forEach((tx) => {
      const category = getCategory(tx);
      const folio = getFolio(tx);
      const amount = cleanAmount(tx.amount);
      const key = `${folio} - ${category}`;

      if (!groupedPayments[key]) {
        groupedPayments[key] = {
          categoryName: category,
          folio,
          total: 0,
          count: 0,
          items: []
        };
      }

      const isRev = tx.isReversed || tx.status === 'REVERSED' || tx.category === 'REVERSAL';
      if (!isRev || reversalFilter === 'REVERSALS_ONLY') {
        groupedPayments[key].total += amount;
      }

      groupedPayments[key].count += 1;
      groupedPayments[key].items.push(tx);
    });

    const receiptEntries = Object.entries(groupedReceipts).sort(
      (a, b) => b[1].total - a[1].total
    );

    const paymentEntries = Object.entries(groupedPayments).sort(
      (a, b) => b[1].total - a[1].total
    );

    const totalTransactions = filteredReceipts.length + filteredPayments.length;
    const netMovement = effectiveReceipts - effectivePayments;
    const calculatedClosingBalance = cashbookData.openingBalance + netMovement;

    const averageReceipt =
      filteredReceipts.length > 0 ? effectiveReceipts / filteredReceipts.length : 0;

    const averagePayment =
      filteredPayments.length > 0 ? effectivePayments / filteredPayments.length : 0;

    // Running Ledger Array
    const combinedTransactions = [
      ...filteredReceipts.map((tx) => ({
        ...tx,
        reportType: 'Receipt',
        receiptAmount: tx.isReversed || tx.category === 'REVERSAL' ? 0 : cleanAmount(tx.amount),
        paymentAmount: 0
      })),
      ...filteredPayments.map((tx) => ({
        ...tx,
        reportType: 'Payment',
        receiptAmount: 0,
        paymentAmount: tx.isReversed || tx.category === 'REVERSAL' ? 0 : cleanAmount(tx.amount)
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

    const allAmounts = combinedTransactions.map((tx) => cleanAmount(tx.amount));
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

    const reversedTransactionsList = combinedTransactions.filter(
      (tx) => tx.isReversed || tx.status === 'REVERSED' || tx.category === 'REVERSAL'
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

    const reversedTransactionsCount = reversedReceiptsCount + reversedPaymentsCount;

    const possibleDuplicates = Object.values(duplicateMap).filter(
      (items) => items.length > 1
    );

    return {
      groupedReceipts,
      groupedPayments,
      receiptEntries,
      paymentEntries,
      effectiveReceipts,
      reversedReceipts,
      grossReceipts,
      effectivePayments,
      reversedPayments,
      grossPayments,
      totalTransactions,
      grossTransactionsCount,
      reversedTransactionsCount,
      effectiveTransactionsCount,
      netMovement,
      calculatedClosingBalance,
      averageReceipt,
      averagePayment,
      runningLedger,
      largeTransactions,
      negativeTransactions,
      reversedTransactionsList,
      possibleDuplicates,
      balancedTotal: cleanAmount(cashbookData.openingBalance) + effectiveReceipts
    };
  }, [cashbookData, paymentModeFilter, reversalFilter]);

  const receiptPercent = (amount) =>
    analytics.effectiveReceipts > 0
      ? ((amount / analytics.effectiveReceipts) * 100).toFixed(1)
      : '0.0';

  const paymentPercent = (amount) =>
    analytics.effectivePayments > 0
      ? ((amount / analytics.effectivePayments) * 100).toFixed(1)
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
    let csv = `CASHBOOK FINANCIAL AUDIT SUMMARY\n`;
    csv += `Period,${startDate} to ${endDate}\n`;
    csv += `Payment Mode Filter,${paymentModeFilter}\n`;
    csv += `Reversal Mode,${reversalFilter}\n\n`;

    csv += `FINANCIAL TIERS SUMMARY\n`;
    csv += `Opening Balance,${cashbookData.openingBalance}\n`;
    csv += `Gross Receipts (Posted),${analytics.grossReceipts}\n`;
    csv += `Reversed Receipts,${analytics.reversedReceipts}\n`;
    csv += `EFFECTIVE RECEIPTS,${analytics.effectiveReceipts}\n\n`;

    csv += `Gross Payments (Posted),${analytics.grossPayments}\n`;
    csv += `Reversed Payments,${analytics.reversedPayments}\n`;
    csv += `EFFECTIVE PAYMENTS,${analytics.effectivePayments}\n\n`;

    csv += `Net Effective Movement,${analytics.netMovement}\n`;
    csv += `EFFECTIVE CLOSING BALANCE,${analytics.calculatedClosingBalance}\n`;
    csv += `Total Transactions Filtered,${analytics.totalTransactions}\n\n`;

    csv += `RECEIPTS Dr,Folio,Txn Count,Percentage,Effective Amount,PAYMENTS Cr,Folio,Txn Count,Percentage,Effective Amount\n`;
    csv += `To Balance b/d Opening,,,${cashbookData.openingBalance},,,,,\n`;

    const maxRows = Math.max(
      analytics.receiptEntries.length,
      analytics.paymentEntries.length
    );

    for (let i = 0; i < maxRows; i++) {
      const receipt = analytics.receiptEntries[i];
      const payment = analytics.paymentEntries[i];

      const receiptName = receipt ? `To ${receipt[1].categoryName}` : '';
      const receiptFolio = receipt ? receipt[1].folio : '';
      const receiptCount = receipt ? receipt[1].count : '';
      const receiptPct = receipt ? `${receiptPercent(receipt[1].total)}%` : '';
      const receiptAmount = receipt ? receipt[1].total : '';

      const paymentName = payment ? `By ${payment[1].categoryName}` : '';
      const paymentFolio = payment ? payment[1].folio : '';
      const paymentCount = payment ? payment[1].count : '';
      const paymentPct = payment ? `${paymentPercent(payment[1].total)}%` : '';
      const paymentAmount = payment ? payment[1].total : '';

      csv += [
        csvEscape(receiptName),
        receiptFolio,
        receiptCount,
        receiptPct,
        receiptAmount,
        csvEscape(paymentName),
        paymentFolio,
        paymentCount,
        paymentPct,
        paymentAmount
      ].join(',') + '\n';
    }

    csv += `,,,,,,By Balance c/d Closing,,,${analytics.calculatedClosingBalance}\n`;
    csv += `TOTAL RECEIPTS SIDE,,,${analytics.balancedTotal},,,TOTAL PAYMENTS SIDE,,,${analytics.balancedTotal}\n`;

    downloadCSV(csv, `Cashbook_Summary_${startDate}_to_${endDate}.csv`);
  };

  const exportDetailedCSV = () => {
    if (!analytics.runningLedger.length) {
      alert('No transactions available to export for this selection.');
      return;
    }

    let csv = `DETAILED CASHBOOK AUDIT LEDGER\n`;
    csv += `Period,${startDate} to ${endDate}\n`;
    csv += `Mode,${paymentModeFilter} | Reversals: ${reversalFilter}\n\n`;
    csv += `Date,Type,Reference,Category,L.F.,Member/Vendor,Payment Mode,Status,Narration,Receipt In,Payment Out,Running Balance\n`;

    analytics.runningLedger.forEach((tx) => {
      const statusText = tx.isReversed
        ? 'REVERSED'
        : tx.category === 'REVERSAL'
        ? 'REVERSAL_COUNTER'
        : 'ACTIVE';

      csv += [
        csvEscape(formatDate(tx.transactionDate || tx.createdAt)),
        csvEscape(tx.reportType),
        csvEscape(getReference(tx)),
        csvEscape(getCategory(tx)),
        csvEscape(tx.ledgerFolio || '100'),
        csvEscape(getPartyName(tx)),
        csvEscape(tx.paymentMode || 'AUTO'),
        csvEscape(statusText),
        csvEscape(getNarration(tx)),
        tx.receiptAmount || 0,
        tx.paymentAmount || 0,
        tx.runningBalance || 0
      ].join(',') + '\n';
    });

    downloadCSV(csv, `Cashbook_Detailed_${startDate}_to_${endDate}.csv`);
  };

  const exportPDFReport = async () => {
    if (!analytics.runningLedger.length) {
      alert('No transactions available to generate PDF.');
      return;
    }

    const columns = [
      'Date',
      'Type',
      'Reference',
      'L.F.',
      'Member / Vendor',
      'Mode',
      'Narration',
      'Amount (Rs)',
      'Status'
    ];

    const data = analytics.runningLedger.map((tx) => [
      formatDate(tx.transactionDate || tx.createdAt),
      tx.reportType,
      getReference(tx),
      tx.ledgerFolio || '100',
      getPartyName(tx),
      tx.paymentMode || 'AUTO',
      getNarration(tx),
      formatCurrency(tx.amount),
      tx.isReversed ? 'REVERSED' : tx.category === 'REVERSAL' ? 'COUNTER' : 'ACTIVE'
    ]);

    const summaryNotes = [
      `Opening Cash Balance: ${formatCurrency(cashbookData.openingBalance)}`,
      `Gross Receipts (Posted): ${formatCurrency(analytics.grossReceipts)} | Reversed: ${formatCurrency(analytics.reversedReceipts)} | Effective Receipts: ${formatCurrency(analytics.effectiveReceipts)}`,
      `Gross Payments (Posted): ${formatCurrency(analytics.grossPayments)} | Reversed: ${formatCurrency(analytics.reversedPayments)} | Effective Payments: ${formatCurrency(analytics.effectivePayments)}`,
      `Effective Net Cash Movement: ${formatCurrency(analytics.netMovement)}`,
      `Closing Cash Balance: ${formatCurrency(analytics.calculatedClosingBalance)}`,
      `Audit Parameters: Date ${startDate} to ${endDate} | Mode: ${paymentModeFilter} | Reversal View: ${reversalFilter}`
    ];

    await generatePDF({
      title: 'MAHADEV SACCO - MASTER CASHBOOK AUDIT REPORT',
      subtitle: `Statement Period: ${formatDate(startDate)} to ${formatDate(endDate)} | Mode Filter: ${paymentModeFilter}`,
      filename: `Master_Cashbook_${startDate}_to_${endDate}.pdf`,
      columns,
      data,
      orientation: 'landscape',
      summaryData: summaryNotes
    });
  };

  const exportSelectedCategoryCSV = () => {
    if (!selectedCategory) return;

    let csv = `${selectedCategory.type.toUpperCase()} FOLIO INVESTIGATION\n`;
    csv += `Category,${selectedCategory.name}\n`;
    csv += `Folio,${selectedCategory.folio || 'N/A'}\n`;
    csv += `Period,${startDate} to ${endDate}\n\n`;
    csv += `Date,Reference,Member/Vendor,Payment Mode,Status,Narration,Amount\n`;

    selectedCategory.data.forEach((tx) => {
      const statusText = tx.isReversed
        ? 'REVERSED'
        : tx.category === 'REVERSAL'
        ? 'REVERSAL_COUNTER'
        : 'ACTIVE';

      csv += [
        csvEscape(formatDate(tx.transactionDate || tx.createdAt)),
        csvEscape(getReference(tx)),
        csvEscape(getPartyName(tx)),
        csvEscape(tx.paymentMode || 'AUTO'),
        csvEscape(statusText),
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

  const MetricCard = ({ title, value, subtitle, variant = 'dark', badgeText }) => (
    <div className="bg-white rounded shadow-sm border p-3 h-100 position-relative">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <div className="text-xs text-muted fw-bold text-uppercase">{title}</div>
        {badgeText && (
          <span className={`badge bg-${variant} text-xs`}>{badgeText}</span>
        )}
      </div>
      <div className={`fs-4 fw-bold text-${variant}`}>{value}</div>
      {subtitle && <div className="text-xs text-muted mt-1">{subtitle}</div>}
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

          .reversed-row {
            text-decoration: line-through;
            opacity: 0.65;
            background-color: #fff5f5;
          }
        `}
      </style>

      <div className="container-fluid pb-5 position-relative">
        {/* HEADER & FILTERS BAR */}
        <div className="d-print-none mb-4 bg-white p-4 rounded shadow-sm border">
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3 border-bottom pb-3">
            <div>
              <h2 className="text-xl fw-bold text-dark m-0">
                Master Cashbook & Financial Statement
              </h2>
              <div className="text-muted text-sm">
                Auditor T-account ledger with 3-tier balance reconciliation (Gross, Reversed, Effective)
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                onClick={fetchCashbookData}
                className="btn btn-primary fw-bold px-4"
                disabled={loading}
              >
                {loading ? 'Refreshing...' : '🔄 Reload Cashbook'}
              </button>
            </div>
          </div>

          {/* FILTER CONTROLS GRID */}
          <div className="row g-3 align-items-end">
            <div className="col-12 col-sm-6 col-md-3 col-xl-2">
              <label className="text-xs fw-bold text-muted text-uppercase d-block mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-control fw-bold bg-light"
              />
            </div>

            <div className="col-12 col-sm-6 col-md-3 col-xl-2">
              <label className="text-xs fw-bold text-muted text-uppercase d-block mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-control fw-bold bg-light"
              />
            </div>

            <div className="col-12 col-sm-6 col-md-3 col-xl-3">
              <label className="text-xs fw-bold text-muted text-uppercase d-block mb-1">
                Payment Mode Filter
              </label>
              <select
                value={paymentModeFilter}
                onChange={(e) => setPaymentModeFilter(e.target.value)}
                className="form-select fw-bold bg-light"
              >
                <option value="ALL">All Modes (Cash + Bank + Transfers)</option>
                <option value="CASH">Cash Only</option>
                <option value="BANK">Bank Only</option>
                <option value="ONLINE">Online / UPI</option>
                <option value="INTERNAL_TRANSFER">Internal Transfers</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-md-3 col-xl-5">
              <label className="text-xs fw-bold text-muted text-uppercase d-block mb-1">
                Reversal Audit View Mode
              </label>
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  onClick={() => setReversalFilter('EFFECTIVE')}
                  className={`btn btn-sm fw-bold ${
                    reversalFilter === 'EFFECTIVE'
                      ? 'btn-dark'
                      : 'btn-outline-secondary'
                  }`}
                >
                  ✅ Effective Only
                </button>

                <button
                  type="button"
                  onClick={() => setReversalFilter('ALL_WITH_REVERSALS')}
                  className={`btn btn-sm fw-bold ${
                    reversalFilter === 'ALL_WITH_REVERSALS'
                      ? 'btn-dark'
                      : 'btn-outline-secondary'
                  }`}
                >
                  👁️ Include Reversals
                </button>

                <button
                  type="button"
                  onClick={() => setReversalFilter('REVERSALS_ONLY')}
                  className={`btn btn-sm fw-bold ${
                    reversalFilter === 'REVERSALS_ONLY'
                      ? 'btn-dark'
                      : 'btn-outline-secondary'
                  }`}
                >
                  ⚠️ Reversals Only
                </button>
              </div>
            </div>
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

        {/* 3-TIER BALANCE SUMMARY SECTION */}
        <div className="d-print-none mb-4">
          <div className="text-xs fw-bold text-muted text-uppercase mb-2 tracking-wider">
            Reconciliation Tiers (Gross · Reversed · Effective)
          </div>

          <div className="row g-3">
            {/* TIER 1: GROSS POSTED */}
            <div className="col-12 col-md-4">
              <div className="bg-white p-3 rounded border shadow-sm h-100 border-start border-4 border-info">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-bold text-uppercase text-xs text-info">
                    1. Gross Posted (Total)
                  </span>
                  <span className="badge bg-info">All Logs</span>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Gross Receipts:</span>
                  <strong className="text-success">
                    {formatCurrency(analytics.grossReceipts)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Gross Payments:</span>
                  <strong className="text-danger">
                    {formatCurrency(analytics.grossPayments)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between border-top pt-2 mt-2">
                  <span className="text-xs text-muted">Total Posted:</span>
                  <span className="text-xs fw-bold text-info">
                    {analytics.grossTransactionsCount} items
                  </span>
                </div>
              </div>
            </div>

            {/* TIER 2: REVERSALS */}
            <div className="col-12 col-md-4">
              <div className="bg-white p-3 rounded border shadow-sm h-100 border-start border-4 border-warning">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-bold text-uppercase text-xs text-warning">
                    2. Reversed / Cancelled
                  </span>
                  <span className="badge bg-warning text-dark">Audit Trail</span>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Reversed Receipts:</span>
                  <strong className="text-warning">
                    {formatCurrency(analytics.reversedReceipts)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Reversed Payments:</span>
                  <strong className="text-warning">
                    {formatCurrency(analytics.reversedPayments)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between border-top pt-2 mt-2">
                  <span className="text-xs text-muted">Reversed Count:</span>
                  <span className="text-xs fw-bold text-danger">
                    {analytics.reversedTransactionsCount} reversed
                  </span>
                </div>
              </div>
            </div>

            {/* TIER 3: EFFECTIVE BALANCE */}
            <div className="col-12 col-md-4">
              <div className="bg-white p-3 rounded border shadow-sm h-100 border-start border-4 border-success">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-bold text-uppercase text-xs text-success">
                    3. Effective (Active Cash)
                  </span>
                  <span className="badge bg-success">Net Active</span>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Effective Receipts:</span>
                  <strong className="text-success fw-bold">
                    {formatCurrency(analytics.effectiveReceipts)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between mb-1">
                  <span className="text-sm text-muted">Effective Payments:</span>
                  <strong className="text-danger fw-bold">
                    {formatCurrency(analytics.effectivePayments)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between border-top pt-2 mt-2">
                  <span className="text-xs text-muted">Closing Balance:</span>
                  <strong className="fs-6 text-primary">
                    {formatCurrency(analytics.calculatedClosingBalance)}
                  </strong>
                </div>

                <div className="d-flex justify-content-between mt-1">
                  <span className="text-xs text-muted">Active Cash Items:</span>
                  <span className="text-xs fw-bold text-success">
                    {analytics.effectiveTransactionsCount} active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AUDIT WARNINGS */}
        {(analytics.largeTransactions.length > 0 ||
          analytics.negativeTransactions.length > 0 ||
          analytics.possibleDuplicates.length > 0 ||
          analytics.reversedTransactionsList.length > 0) && (
          <div className="d-print-none alert alert-warning border-warning shadow-sm mb-4">
            <div className="fw-bold mb-1 d-flex align-items-center gap-2">
              <span>⚠️ Auditor Attention Required</span>
              <span className="badge bg-dark">
                {analytics.largeTransactions.length +
                  analytics.negativeTransactions.length +
                  analytics.possibleDuplicates.length +
                  analytics.reversedTransactionsList.length}{' '}
                flags
              </span>
            </div>

            <div className="small">
              {analytics.reversedTransactionsList.length > 0 && (
                <div>
                  • <strong>Reversals Detected:</strong> {analytics.reversedTransactionsList.length} reversed transaction(s) tracked.
                </div>
              )}

              {analytics.largeTransactions.length > 0 && (
                <div>
                  • <strong>Large Amounts:</strong> {analytics.largeTransactions.length} transaction(s) exceed 5x average transaction size.
                </div>
              )}

              {analytics.negativeTransactions.length > 0 && (
                <div>
                  • <strong>Negative Values:</strong> {analytics.negativeTransactions.length} negative entry detected.
                </div>
              )}

              {analytics.possibleDuplicates.length > 0 && (
                <div>
                  • <strong>Duplicates:</strong> {analytics.possibleDuplicates.length} possible duplicate group(s) detected.
                </div>
              )}
            </div>
          </div>
        )}

        {/* MAIN T-ACCOUNT CASHBOOK */}
        <div className="bg-white p-4 p-md-5 rounded shadow-sm border animate-fade-in print:p-0 print:border-0 print-shadow-none">
          <div className="text-center mb-4 border-bottom border-dark pb-3 border-3">
            <h2 className="fw-bold text-uppercase tracking-wider text-dark mb-1">
              General Cashbook (T-Account)
            </h2>

            <div className="text-muted mb-0 small">
              For period:{' '}
              <strong>
                {formatDate(startDate)} to {formatDate(endDate)}
              </strong>{' '}
              · Mode: <strong>{paymentModeFilter}</strong> · View:{' '}
              <strong>{reversalFilter}</strong>
            </div>
          </div>

          <div className="row g-0 border border-dark border-2">
            {/* LEFT SIDE: RECEIPTS DR. */}
            <div className="col-12 col-lg-6 border-end border-dark border-2">
              <div className="bg-dark text-white text-center fw-bold py-2 tracking-wider d-flex justify-content-between px-3 align-items-center">
                <span>RECEIPTS Dr.</span>
                <span className="text-xs text-light font-monospace">
                  Folio Debit Leg
                </span>
              </div>

              <table className="table table-borderless t-account-table mb-0 w-100">
                <thead className="border-bottom border-dark bg-light">
                  <tr>
                    <th className="py-2 px-2" style={{ width: '70px' }}>
                      L.F.
                    </th>
                    <th className="py-2 px-2">Particulars / Category</th>
                    <th className="py-2 px-2 text-center" style={{ width: '60px' }}>
                      Txns
                    </th>
                    <th className="py-2 px-2 text-center" style={{ width: '60px' }}>
                      %
                    </th>
                    <th className="py-2 px-2 text-end" style={{ width: '130px' }}>
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td className="py-2 px-2 font-monospace text-xs text-muted">
                      100
                    </td>
                    <td className="py-2 px-2 fw-bold text-primary">
                      To Balance b/d Opening
                    </td>
                    <td className="py-2 px-2 text-center text-muted">—</td>
                    <td className="py-2 px-2 text-center text-muted">—</td>
                    <td className="py-2 px-2 text-end fw-bold text-primary">
                      {formatCurrency(cashbookData.openingBalance)}
                    </td>
                  </tr>

                  {analytics.receiptEntries.map(([key, group]) => (
                    <tr
                      key={`rec-${key}`}
                      onClick={() => {
                        setSelectedCategory({
                          name: group.categoryName,
                          folio: group.folio,
                          type: 'Receipts',
                          data: group.items
                        });
                        setModalSearch('');
                      }}
                      className="clickable-row"
                    >
                      <td className="py-2 px-2 font-monospace text-xs text-muted">
                        {group.folio}
                      </td>

                      <td className="py-2 px-2">
                        <span className="text-muted me-2">To</span>
                        <strong>{group.categoryName}</strong>
                      </td>

                      <td className="py-2 px-2 text-center">{group.count}</td>

                      <td className="py-2 px-2 text-center text-xs">
                        {receiptPercent(group.total)}%
                      </td>

                      <td className="py-2 px-2 text-end fw-bold text-success">
                        {formatCurrency(group.total)}
                      </td>
                    </tr>
                  ))}

                  {analytics.receiptEntries.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-4 text-center text-muted">
                        No receipts found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* RIGHT SIDE: PAYMENTS CR. */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark text-white text-center fw-bold py-2 tracking-wider d-flex justify-content-between px-3 align-items-center">
                <span>PAYMENTS Cr.</span>
                <span className="text-xs text-light font-monospace">
                  Folio Credit Leg
                </span>
              </div>

              <table className="table table-borderless t-account-table mb-0 w-100">
                <thead className="border-bottom border-dark bg-light">
                  <tr>
                    <th className="py-2 px-2" style={{ width: '70px' }}>
                      L.F.
                    </th>
                    <th className="py-2 px-2">Particulars / Category</th>
                    <th className="py-2 px-2 text-center" style={{ width: '60px' }}>
                      Txns
                    </th>
                    <th className="py-2 px-2 text-center" style={{ width: '60px' }}>
                      %
                    </th>
                    <th className="py-2 px-2 text-end" style={{ width: '130px' }}>
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {analytics.paymentEntries.map(([key, group]) => (
                    <tr
                      key={`pay-${key}`}
                      onClick={() => {
                        setSelectedCategory({
                          name: group.categoryName,
                          folio: group.folio,
                          type: 'Payments',
                          data: group.items
                        });
                        setModalSearch('');
                      }}
                      className="clickable-row"
                    >
                      <td className="py-2 px-2 font-monospace text-xs text-muted">
                        {group.folio}
                      </td>

                      <td className="py-2 px-2">
                        <span className="text-muted me-2">By</span>
                        <strong>{group.categoryName}</strong>
                      </td>

                      <td className="py-2 px-2 text-center">{group.count}</td>

                      <td className="py-2 px-2 text-center text-xs">
                        {paymentPercent(group.total)}%
                      </td>

                      <td className="py-2 px-2 text-end fw-bold text-danger">
                        {formatCurrency(group.total)}
                      </td>
                    </tr>
                  ))}

                  {analytics.paymentEntries.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-4 text-center text-muted">
                        No payments found for this selection.
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td colSpan="5" className="py-2">
                      <br />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-2 font-monospace text-xs text-muted">
                      100
                    </td>
                    <td className="py-2 px-2 fw-bold text-danger">
                      By Balance c/d Closing
                    </td>
                    <td className="py-2 px-2 text-center text-muted">—</td>
                    <td className="py-2 px-2 text-center text-muted">—</td>
                    <td className="py-2 px-2 text-end fw-bold text-danger">
                      {formatCurrency(analytics.calculatedClosingBalance)}
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
                Total Receipts Side (Opening + Receipts)
              </strong>
              <strong className="fs-5 border-bottom border-top border-dark border-2 px-2 py-1 text-success">
                {formatCurrency(analytics.balancedTotal)}
              </strong>
            </div>

            <div className="col-12 col-lg-6 p-3 d-flex justify-content-between align-items-center">
              <strong className="text-uppercase tracking-wider">
                Total Payments Side (Payments + Closing)
              </strong>
              <strong className="fs-5 border-bottom border-top border-dark border-2 px-2 py-1 text-danger">
                {formatCurrency(analytics.balancedTotal)}
              </strong>
            </div>
          </div>

          {/* EXPORT ACTION BUTTONS */}
          <div className="d-print-none mt-4 d-flex justify-content-end gap-2 border-top pt-4 flex-wrap">
            <button
              onClick={exportSummaryCSV}
              className="btn btn-outline-dark fw-bold"
            >
              📊 Export Summary CSV
            </button>

            <button
              onClick={exportDetailedCSV}
              className="btn btn-outline-success fw-bold"
            >
              📋 Export Detailed CSV
            </button>

            <button
              onClick={exportPDFReport}
              className="btn btn-outline-danger fw-bold"
            >
              📄 Download PDF Report
            </button>

            <button
              onClick={() => window.print()}
              className="btn btn-dark fw-bold px-4"
            >
              🖨️ Print Cashbook
            </button>
          </div>
        </div>

        {/* DRILL-DOWN MODAL */}
        {selectedCategory && (
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center d-print-none modal-backdrop-custom">
            <div
              className="bg-white rounded shadow-lg w-100 m-4 d-flex flex-column"
              style={{ maxWidth: '1100px', maxHeight: '88vh' }}
            >
              <div className="p-4 border-bottom d-flex justify-content-between align-items-start bg-light rounded-top gap-3">
                <div>
                  <h3 className="m-0 fw-bold text-dark d-flex align-items-center gap-2">
                    <span>Folio Investigation: {selectedCategory.name}</span>
                    <span className="badge bg-secondary font-monospace">
                      L.F. {selectedCategory.folio || 'N/A'}
                    </span>
                  </h3>
                  <p className="text-muted m-0 text-sm mt-1">
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
                      placeholder="Search reference, member, vendor, narration, mode, or status..."
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
                      <th>L.F.</th>
                      <th>Member / Vendor</th>
                      <th>Mode</th>
                      <th>Status</th>
                      <th>Narration</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredModalData.map((tx, idx) => {
                      const isRev = tx.isReversed || tx.status === 'REVERSED';
                      const isCounter = tx.isReversalCounter || tx.category === 'REVERSAL';

                      return (
                        <tr
                          key={tx._id || tx.transactionId || idx}
                          className={isRev ? 'reversed-row' : ''}
                        >
                          <td className="align-middle text-nowrap">
                            {formatDate(tx.transactionDate || tx.createdAt)}
                          </td>

                          <td className="align-middle font-monospace text-xs">
                            {getReference(tx)}
                          </td>

                          <td className="align-middle font-monospace text-xs">
                            {tx.ledgerFolio || '100'}
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
                            {isRev ? (
                              <span className="badge bg-danger">REVERSED</span>
                            ) : isCounter ? (
                              <span className="badge bg-warning text-dark">
                                REVERSAL_COUNTER
                              </span>
                            ) : (
                              <span className="badge bg-success">ACTIVE</span>
                            )}
                          </td>

                          <td className="align-middle">
                            <div className="text-sm">{getNarration(tx)}</div>
                          </td>

                          <td
                            className={`align-middle text-end fw-bold ${
                              isRev
                                ? 'text-muted'
                                : selectedCategory.type === 'Receipts'
                                ? 'text-success'
                                : 'text-danger'
                            }`}
                          >
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      );
                    })}

                    {filteredModalData.length === 0 && (
                      <tr>
                        <td colSpan="8" className="text-center text-muted py-4">
                          No matching transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot className="table-light fw-bold">
                    <tr>
                      <td colSpan="7" className="text-end py-3">
                        TOTAL SHOWN:
                      </td>
                      <td className="text-end py-3 text-dark">
                        {formatCurrency(
                          filteredModalData.reduce(
                            (sum, item) =>
                              sum +
                              (item.isReversed || item.category === 'REVERSAL'
                                ? 0
                                : cleanAmount(item.amount)),
                            0
                          )
                        )}
                      </td>
                    </tr>
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
