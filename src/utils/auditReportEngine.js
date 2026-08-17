import * as XLSX from 'xlsx';
import { generatePDF } from './pdfGenerator';

// ==========================================
// LOAN RECOVERY REPORT (Folio 152 & 153)
// ==========================================

export const generateLoanReport = (transactions, timeframeType, selectedMonth, selectedYear, selectedFY) => {
  let startDate, endDate;
  if (timeframeType === 'MONTHLY') {
    startDate = new Date(selectedYear, selectedMonth - 1, 1);
    endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
  } else {
    const [startYr, endYr] = selectedFY.split('-');
    startDate = new Date(`${startYr}-04-01T00:00:00`);
    endDate = new Date(`${endYr}-03-31T23:59:59`);
  }

  const memberData = {};
  const initMember = (vendorNo, name) => {
    if (!memberData[vendorNo]) {
      memberData[vendorNo] = {
        vendorNo, name: name || 'Unknown',
        openingLoan: 0, newLoanDebit: 0, interestChargedDebit: 0,
        principalPaidCredit: 0, interestPaidCredit: 0, rdAdjustedCredit: 0, closingLoan: 0,
        monthlyData: {}
      };
    }
  };

  transactions.forEach(tx => {
    if (!tx.vendorNo) return;
    const txDate = new Date(tx.transactionDate || tx.createdAt);
    const isBeforeStart = txDate < startDate;
    const isWithinRange = txDate >= startDate && txDate <= endDate;
    const monthKey = txDate.toLocaleString('default', { month: 'short', year: 'numeric' });

    if (tx.ledgerFolio === '152' || tx.ledgerFolio === '153') {
      initMember(tx.vendorNo, tx.memberName);
      const m = memberData[tx.vendorNo];
      
      if (isWithinRange && !m.monthlyData[monthKey]) {
        m.monthlyData[monthKey] = { newLoanDebit: 0, principalPaidCredit: 0, rdAdjustedCredit: 0, interestPaidCredit: 0, openingAtMonthStart: m.openingLoan };
      }

      if (tx.ledgerFolio === '152') {
        if (tx.entryType === 'DEBIT') {
          if (isBeforeStart) m.openingLoan += tx.amount;
          else if (isWithinRange) {
            m.newLoanDebit += tx.amount;
            m.monthlyData[monthKey].newLoanDebit += tx.amount;
          }
        } else if (tx.entryType === 'CREDIT') {
          if (isBeforeStart) m.openingLoan -= tx.amount;
          else if (isWithinRange) {
            if (tx.paymentMode === 'INTERNAL_TRANSFER' || (tx.description && tx.description.toUpperCase().includes('RD'))) {
              m.rdAdjustedCredit += tx.amount;
              m.monthlyData[monthKey].rdAdjustedCredit += tx.amount;
            } else {
              m.principalPaidCredit += tx.amount;
              m.monthlyData[monthKey].principalPaidCredit += tx.amount;
            }
          }
        }
      }

      if (tx.ledgerFolio === '153' && tx.entryType === 'CREDIT') {
        if (isWithinRange) {
          m.interestPaidCredit += tx.amount;
          m.monthlyData[monthKey].interestPaidCredit += tx.amount;
        }
      }
    }
  });

  const finalRows = Object.values(memberData).map(m => {
    const effectivePrincipal = m.openingLoan + m.newLoanDebit;
    m.interestChargedDebit = timeframeType === 'MONTHLY' ? Math.round((effectivePrincipal * 0.10) / 12) : Math.round(effectivePrincipal * 0.10);
    m.closingLoan = m.openingLoan + m.newLoanDebit - m.principalPaidCredit - m.rdAdjustedCredit;
    return m;
  }).filter(m => m.openingLoan > 0 || m.newLoanDebit > 0 || m.closingLoan > 0 || m.interestPaidCredit > 0);

  return { finalRows, startDate, endDate };
};

export const exportLoanExcel = (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const workbook = XLSX.utils.book_new();
  const periodString = timeframeType === 'MONTHLY' ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : `FY ${selectedFY}`;

  const createFormattedSheet = (rows, sheetPeriod, isMonthWise = false) => {
    const totals = {
      "[Dr] Opening Principal": 0, "[Dr] New Loan": 0, "[Dr] Interest Charged": 0, "[Dr] Total Debit": 0,
      "[Cr] Principal Paid": 0, "[Cr] Interest Paid": 0, "[Cr] Adjusted by RD": 0, "[Cr] Total Credit": 0,
      "Closing Principal": 0
    };

    rows.forEach(r => {
      if(!isMonthWise) totals["[Dr] Opening Principal"] += (r["[Dr] Opening Principal"] || 0);
      totals["[Dr] New Loan"] += (r["[Dr] New Loan"] || 0);
      totals["[Dr] Interest Charged"] += (r["[Dr] Interest Charged"] || 0);
      totals["[Dr] Total Debit"] += (r["[Dr] Total Debit"] || 0);
      totals["[Cr] Principal Paid"] += (r["[Cr] Principal Paid"] || 0);
      totals["[Cr] Interest Paid"] += (r["[Cr] Interest Paid"] || 0);
      totals["[Cr] Adjusted by RD"] += (r["[Cr] Adjusted by RD"] || 0);
      totals["[Cr] Total Credit"] += (r["[Cr] Total Credit"] || 0);
      if(!isMonthWise) totals["Closing Principal"] += (r["Closing Principal"] || 0);
    });

    const totalRow = { "S.No.": "Total", "Vendor No.": "", "Member Name": "", ...totals };
    if (isMonthWise) { delete totalRow["[Dr] Opening Principal"]; delete totalRow["Closing Principal"]; }

    const worksheet = XLSX.utils.json_to_sheet([...rows, totalRow], { origin: "A4" });
    
    const headerRows = [
      ["Report Name: 1. Loan Recovery Report"],
      [`Period: ${sheetPeriod}`],
      ["", "", "", "DEBIT SIDE", "", "", "", "CREDIT SIDE", "", "", "", ""] 
    ];
    if (isMonthWise) headerRows[2] = ["", "", "", "DEBIT SIDE", "", "", "CREDIT SIDE", "", "", ""]; 

    XLSX.utils.sheet_add_aoa(worksheet, headerRows, { origin: "A1" });
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    if (!isMonthWise) {
      worksheet['!merges'].push({ s: { r: 2, c: 3 }, e: { r: 2, c: 6 } }); // Debit
      worksheet['!merges'].push({ s: { r: 2, c: 7 }, e: { r: 2, c: 10 } }); // Credit
    } else {
      worksheet['!merges'].push({ s: { r: 2, c: 3 }, e: { r: 2, c: 5 } }); // Debit
      worksheet['!merges'].push({ s: { r: 2, c: 6 }, e: { r: 2, c: 8 } }); // Credit
    }
    return worksheet;
  };

  const generateSheetData = (rData) => rData.map((m, i) => ({
    "S.No.": i + 1, "Vendor No.": m.vendorNo, "Member Name": m.name,
    "[Dr] Opening Principal": m.openingLoan, "[Dr] New Loan": m.newLoanDebit, "[Dr] Interest Charged": m.interestChargedDebit,
    "[Dr] Total Debit": m.openingLoan + m.newLoanDebit + m.interestChargedDebit,
    "[Cr] Principal Paid": m.principalPaidCredit, "[Cr] Interest Paid": m.interestPaidCredit, "[Cr] Adjusted by RD": m.rdAdjustedCredit,
    "[Cr] Total Credit": m.principalPaidCredit + m.interestPaidCredit + m.rdAdjustedCredit,
    "Closing Principal": m.closingLoan
  }));

  if (timeframeType === 'MONTHLY') {
    XLSX.utils.book_append_sheet(workbook, createFormattedSheet(generateSheetData(reportData), periodString, false), `${selectedMonth}-${selectedYear}`);
  } else {
    XLSX.utils.book_append_sheet(workbook, createFormattedSheet(generateSheetData(reportData), `FY ${selectedFY}`, false), "CONSOLIDATED");
  }

  XLSX.writeFile(workbook, `Loan_Recovery_Audit_${timeframeType}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportLoanPDF = async (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const periodString = timeframeType === 'MONTHLY' ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : `FY ${selectedFY}`;
  
  const tableColumn = [
    "S.No.", "Vendor", "Name", 
    "[Dr] Open", "[Dr] New", "[Dr] Int", "[Dr] Total", 
    "[Cr] Princ", "[Cr] Int", "[Cr] RD Adj", "[Cr] Total", 
    "Closing"
  ];
  
  const totals = {
    open: 0, new: 0, int: 0, drTotal: 0,
    princ: 0, intPaid: 0, rdAdj: 0, crTotal: 0,
    closing: 0
  };
  
  const tableRows = reportData.map((m, i) => {
    totals.open += m.openingLoan;
    totals.new += m.newLoanDebit;
    totals.int += m.interestChargedDebit;
    totals.drTotal += (m.openingLoan + m.newLoanDebit + m.interestChargedDebit);
    totals.princ += m.principalPaidCredit;
    totals.intPaid += m.interestPaidCredit;
    totals.rdAdj += m.rdAdjustedCredit;
    totals.crTotal += (m.principalPaidCredit + m.interestPaidCredit + m.rdAdjustedCredit);
    totals.closing += m.closingLoan;

    return [
      i + 1, m.vendorNo, m.name,
      m.openingLoan.toLocaleString('en-IN'), m.newLoanDebit.toLocaleString('en-IN'), m.interestChargedDebit.toLocaleString('en-IN'), (m.openingLoan + m.newLoanDebit + m.interestChargedDebit).toLocaleString('en-IN'),
      m.principalPaidCredit.toLocaleString('en-IN'), m.interestPaidCredit.toLocaleString('en-IN'), m.rdAdjustedCredit.toLocaleString('en-IN'), (m.principalPaidCredit + m.interestPaidCredit + m.rdAdjustedCredit).toLocaleString('en-IN'),
      m.closingLoan.toLocaleString('en-IN')
    ];
  });

  tableRows.push([
    "Total", "", "",
    totals.open.toLocaleString('en-IN'), totals.new.toLocaleString('en-IN'), totals.int.toLocaleString('en-IN'), totals.drTotal.toLocaleString('en-IN'),
    totals.princ.toLocaleString('en-IN'), totals.intPaid.toLocaleString('en-IN'), totals.rdAdj.toLocaleString('en-IN'), totals.crTotal.toLocaleString('en-IN'),
    totals.closing.toLocaleString('en-IN')
  ]);

  await generatePDF({
    title: 'Loan Recovery Audit Report',
    subtitle: `Period: ${periodString}`,
    filename: `Loan_Recovery_${new Date().toISOString().split('T')[0]}.pdf`,
    columns: tableColumn,
    data: tableRows,
    orientation: 'landscape'
  });
};

// ==========================================
// RD RECOVERY REPORT (Folio 154)
// ==========================================

export const generateRDReport = (transactions, timeframeType, selectedMonth, selectedYear, selectedFY) => {
  let startDate, endDate;
  if (timeframeType === 'MONTHLY') {
    startDate = new Date(selectedYear, selectedMonth - 1, 1);
    endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
  } else {
    const [startYr, endYr] = selectedFY.split('-');
    startDate = new Date(`${startYr}-04-01T00:00:00`);
    endDate = new Date(`${endYr}-03-31T23:59:59`);
  }

  const memberData = {};
  const initMember = (vendorNo, name) => {
    if (!memberData[vendorNo]) {
      memberData[vendorNo] = {
        vendorNo, name: name || 'Unknown',
        openingRD: 0, newRDDepositedCredit: 0, adjustedToLoanDebit: 0, refundedDebit: 0, closingRD: 0
      };
    }
  };

  transactions.forEach(tx => {
    if (!tx.vendorNo) return;
    const txDate = new Date(tx.transactionDate || tx.createdAt);
    const isBeforeStart = txDate < startDate;
    const isWithinRange = txDate >= startDate && txDate <= endDate;

    if (tx.ledgerFolio === '154') {
      initMember(tx.vendorNo, tx.memberName);
      const m = memberData[tx.vendorNo];
      
      if (tx.entryType === 'CREDIT') { // RD Deposit
        if (isBeforeStart) m.openingRD += tx.amount;
        else if (isWithinRange) m.newRDDepositedCredit += tx.amount;
      } else if (tx.entryType === 'DEBIT') { // RD Adjustment or Refund
        if (isBeforeStart) m.openingRD -= tx.amount;
        else if (isWithinRange) {
          if (tx.paymentMode === 'INTERNAL_TRANSFER' || (tx.description && tx.description.toUpperCase().includes('LOAN'))) {
            m.adjustedToLoanDebit += tx.amount;
          } else {
            m.refundedDebit += tx.amount;
          }
        }
      }
    }
  });

  const finalRows = Object.values(memberData).map(m => {
    m.closingRD = m.openingRD + m.newRDDepositedCredit - m.adjustedToLoanDebit - m.refundedDebit;
    return m;
  }).filter(m => m.openingRD > 0 || m.newRDDepositedCredit > 0 || m.closingRD > 0 || m.adjustedToLoanDebit > 0 || m.refundedDebit > 0);

  return { finalRows, startDate, endDate };
};

export const exportRDExcel = (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const workbook = XLSX.utils.book_new();
  const periodString = timeframeType === 'MONTHLY' ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : `FY ${selectedFY}`;

  const totals = {
    "[Cr] Opening RD": 0, "[Cr] New Deposits": 0, "[Cr] Total Credit": 0,
    "[Dr] Adjusted to Loan": 0, "[Dr] Refunded": 0, "[Dr] Total Debit": 0,
    "Closing RD": 0
  };

  reportData.forEach(r => {
    totals["[Cr] Opening RD"] += (r.openingRD || 0);
    totals["[Cr] New Deposits"] += (r.newRDDepositedCredit || 0);
    totals["[Cr] Total Credit"] += ((r.openingRD + r.newRDDepositedCredit) || 0);
    totals["[Dr] Adjusted to Loan"] += (r.adjustedToLoanDebit || 0);
    totals["[Dr] Refunded"] += (r.refundedDebit || 0);
    totals["[Dr] Total Debit"] += ((r.adjustedToLoanDebit + r.refundedDebit) || 0);
    totals["Closing RD"] += (r.closingRD || 0);
  });

  const dataToExport = [
    ...reportData.map((m, i) => ({
      "S.No.": i + 1, "Vendor No.": m.vendorNo, "Member Name": m.name,
      "[Cr] Opening RD": m.openingRD, "[Cr] New Deposits": m.newRDDepositedCredit, "[Cr] Total Credit": m.openingRD + m.newRDDepositedCredit,
      "[Dr] Adjusted to Loan": m.adjustedToLoanDebit, "[Dr] Refunded": m.refundedDebit, "[Dr] Total Debit": m.adjustedToLoanDebit + m.refundedDebit,
      "Closing RD": m.closingRD
    })),
    { "S.No.": "Total", "Vendor No.": "", "Member Name": "", ...totals }
  ];

  const worksheet = XLSX.utils.json_to_sheet(dataToExport, { origin: "A4" });
  
  const headerRows = [
    ["Report Name: 2. RD Recovery Report"],
    [`Period: ${periodString}`],
    ["", "", "", "CREDIT SIDE (Liabilities)", "", "", "DEBIT SIDE (Payouts)", "", "", ""] 
  ];

  XLSX.utils.sheet_add_aoa(worksheet, headerRows, { origin: "A1" });
  if (!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 2, c: 3 }, e: { r: 2, c: 5 } }); // Credit
  worksheet['!merges'].push({ s: { r: 2, c: 6 }, e: { r: 2, c: 8 } }); // Debit

  XLSX.utils.book_append_sheet(workbook, worksheet, timeframeType === 'MONTHLY' ? `${selectedMonth}-${selectedYear}` : "CONSOLIDATED");
  XLSX.writeFile(workbook, `RD_Recovery_Audit_${timeframeType}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportRDPDF = async (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const periodString = timeframeType === 'MONTHLY' ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : `FY ${selectedFY}`;
  
  const tableColumn = [
    "S.No.", "Vendor", "Name", 
    "[Cr] Open RD", "[Cr] New Dep.", "[Cr] Total", 
    "[Dr] Adj. Loan", "[Dr] Refunded", "[Dr] Total", 
    "Closing RD"
  ];
  
  const totals = {
    open: 0, newDep: 0, crTotal: 0,
    adjLoan: 0, refunded: 0, drTotal: 0,
    closing: 0
  };
  
  const tableRows = reportData.map((m, i) => {
    totals.open += m.openingRD;
    totals.newDep += m.newRDDepositedCredit;
    totals.crTotal += (m.openingRD + m.newRDDepositedCredit);
    totals.adjLoan += m.adjustedToLoanDebit;
    totals.refunded += m.refundedDebit;
    totals.drTotal += (m.adjustedToLoanDebit + m.refundedDebit);
    totals.closing += m.closingRD;

    return [
      i + 1, m.vendorNo, m.name,
      m.openingRD.toLocaleString('en-IN'), m.newRDDepositedCredit.toLocaleString('en-IN'), (m.openingRD + m.newRDDepositedCredit).toLocaleString('en-IN'),
      m.adjustedToLoanDebit.toLocaleString('en-IN'), m.refundedDebit.toLocaleString('en-IN'), (m.adjustedToLoanDebit + m.refundedDebit).toLocaleString('en-IN'),
      m.closingRD.toLocaleString('en-IN')
    ];
  });

  tableRows.push([
    "Total", "", "",
    totals.open.toLocaleString('en-IN'), totals.newDep.toLocaleString('en-IN'), totals.crTotal.toLocaleString('en-IN'),
    totals.adjLoan.toLocaleString('en-IN'), totals.refunded.toLocaleString('en-IN'), totals.drTotal.toLocaleString('en-IN'),
    totals.closing.toLocaleString('en-IN')
  ]);

  await generatePDF({
    title: 'RD Recovery Audit Report',
    subtitle: `Period: ${periodString}`,
    filename: `RD_Recovery_${new Date().toISOString().split('T')[0]}.pdf`,
    columns: tableColumn,
    data: tableRows,
    orientation: 'landscape'
  });
};

// ==========================================
// TRIAL BALANCE GENERATOR
// ==========================================

const FOLIO_NAMES = {
  '101': 'Bank / Cash Book',
  '152': 'Loan Assets',
  '153': 'Interest Income',
  '154': 'Recurring Deposit Liability',
  '155': 'Share Capital',
  '156': 'Monthly Thrift',
  '157': 'Income & Expenses (Misc/P&L)',
  '158': 'Dividend Payable',
  '159': 'Reserve & Education Funds',
  '160': 'Welfare Fund',
  '999': 'Suspense / Unallocated'
};

export const generateTrialBalance = (transactions, timeframeType, selectedMonth, selectedYear, selectedFY) => {
  // 1. Determine Date Range
  let startDate, endDate;
  if (timeframeType === 'MONTHLY') {
    startDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
    endDate = new Date(Date.UTC(selectedYear, selectedMonth, 0, 23, 59, 59, 999));
  } else {
    const [startYr, endYr] = selectedFY.split('-');
    startDate = new Date(Date.UTC(parseInt(startYr), 3, 1)); // April 1st
    endDate = new Date(Date.UTC(parseInt(endYr), 2, 31, 23, 59, 59, 999)); // March 31st
  }

  const balances = {}; // keyed by folio

  const initFolio = (folio) => {
    if (!balances[folio]) {
      balances[folio] = {
        folio,
        name: FOLIO_NAMES[folio] || `Folio ${folio}`,
        openingNet: 0,
        periodDebit: 0,
        periodCredit: 0
      };
    }
  };

  transactions.forEach(tx => {
    const folio = tx.ledgerFolio;
    if (!folio) return; 

    initFolio(folio);
    
    const txDate = new Date(tx.transactionDate);
    const amt = Number(tx.amount);
    
    if (txDate < startDate) {
      if (tx.entryType === 'DEBIT') {
        balances[folio].openingNet += amt;
      } else if (tx.entryType === 'CREDIT') {
        balances[folio].openingNet -= amt;
      }
    } else if (txDate >= startDate && txDate <= endDate) {
      if (tx.entryType === 'DEBIT') {
        balances[folio].periodDebit += amt;
      } else if (tx.entryType === 'CREDIT') {
        balances[folio].periodCredit += amt;
      }
    }
  });

  const finalRows = Object.values(balances).map(b => {
    const closingNet = b.openingNet + b.periodDebit - b.periodCredit;
    return {
      folio: b.folio,
      name: b.name,
      openingDr: b.openingNet > 0 ? b.openingNet : 0,
      openingCr: b.openingNet < 0 ? Math.abs(b.openingNet) : 0,
      periodDr: b.periodDebit,
      periodCr: b.periodCredit,
      closingDr: closingNet > 0 ? closingNet : 0,
      closingCr: closingNet < 0 ? Math.abs(closingNet) : 0,
    };
  }).filter(b => b.openingDr > 0 || b.openingCr > 0 || b.periodDr > 0 || b.periodCr > 0 || b.closingDr > 0 || b.closingCr > 0)
    .sort((a, b) => parseInt(a.folio) - parseInt(b.folio));

  return { finalRows, startDate, endDate };
};

export const exportTrialBalanceExcel = (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const workbook = XLSX.utils.book_new();
  const periodString = timeframeType === 'MONTHLY' 
    ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    : `FY ${selectedFY}`;

  const debitRows = reportData.filter(r => r.closingDr > 0);
  const creditRows = reportData.filter(r => r.closingCr > 0);

  let totalDebit = 0;
  debitRows.forEach(r => totalDebit += r.closingDr);

  let totalCredit = 0;
  creditRows.forEach(r => totalCredit += r.closingCr);

  const aoa = [
    ["Report Name: Consolidated Trial Balance"],
    [`Period: ${periodString}`],
    [],
    ["L.F.", "DEBIT BALANCES", "Amount (₹)", "L.F.", "CREDIT BALANCES", "Amount (₹)"]
  ];

  const maxRows = Math.max(debitRows.length, creditRows.length);

  for (let i = 0; i < maxRows; i++) {
    const dr = debitRows[i];
    const cr = creditRows[i];
    
    aoa.push([
      dr ? dr.folio : "", 
      dr ? dr.name : "", 
      dr ? dr.closingDr : "", 
      cr ? cr.folio : "", 
      cr ? cr.name : "", 
      cr ? cr.closingCr : ""
    ]);
  }

  aoa.push([]);
  aoa.push([
    "TOTAL", "", totalDebit, 
    "TOTAL", "", totalCredit
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Trial Balance");
  const fileName = `Trial_Balance_SideBySide_${timeframeType}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const exportTrialBalancePDF = async (reportData, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const periodString = timeframeType === 'MONTHLY' 
    ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    : `FY ${selectedFY}`;

  const debitRows = reportData.filter(r => r.closingDr > 0);
  const creditRows = reportData.filter(r => r.closingCr > 0);

  let totalDebit = 0;
  debitRows.forEach(r => totalDebit += r.closingDr);

  let totalCredit = 0;
  creditRows.forEach(r => totalCredit += r.closingCr);

  const tableColumn = ["L.F.", "DEBIT BALANCES", "Amount (Rs.)", "L.F.", "CREDIT BALANCES", "Amount (Rs.)"];
  
  const tableRows = [];
  const maxRows = Math.max(debitRows.length, creditRows.length);

  for (let i = 0; i < maxRows; i++) {
    const dr = debitRows[i];
    const cr = creditRows[i];
    
    tableRows.push([
      dr ? dr.folio : "", 
      dr ? dr.name : "", 
      dr ? dr.closingDr.toLocaleString('en-IN') : "", 
      cr ? cr.folio : "", 
      cr ? cr.name : "", 
      cr ? cr.closingCr.toLocaleString('en-IN') : ""
    ]);
  }

  // Adding empty row for spacing
  tableRows.push([{ content: '', colSpan: 6, styles: { fillColor: [255, 255, 255] } }]);

  // Totals row
  tableRows.push([
    { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: totalDebit.toLocaleString('en-IN'), styles: { fontStyle: 'bold' } },
    { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: totalCredit.toLocaleString('en-IN'), styles: { fontStyle: 'bold' } }
  ]);

  await generatePDF({
    title: 'Consolidated Trial Balance',
    subtitle: `Period: ${periodString}`,
    filename: `Trial_Balance_SideBySide_${timeframeType}_${new Date().toISOString().split('T')[0]}.pdf`,
    columns: tableColumn,
    data: tableRows,
    orientation: 'landscape' // Switched back to landscape to fit 6 columns nicely
  });
};


// ==========================================
// PROFIT & LOSS (P&L) REPORT
// Co-operative Compliant with Statutory Appropriations
// ==========================================

/**
 * generatePnLReport - Builds a comprehensive Profit & Loss account from transactions.
 */
export const generatePnLReport = (transactions, timeframeType, selectedMonth, selectedYear, selectedFY) => {
  let startDate, endDate;
  if (timeframeType === 'MONTHLY') {
    startDate = new Date(selectedYear, selectedMonth - 1, 1);
    endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
  } else {
    const [startYr, endYr] = selectedFY.split('-');
    startDate = new Date(`${startYr}-04-01T00:00:00`);
    endDate = new Date(`${endYr}-03-31T23:59:59`);
  }

  // Income line items
  const income = {
    loanInterest: 0,
    admissionFees: 0,
    bankInterest: 0,
    penalCharges: 0,
    miscIncome: 0,
  };

  // Expenditure line items
  const expense = {
    savingsInterest: 0,
    bankCharges: 0,
    auditFees: 0,
    officeExpense: 0,
    itExpense: 0,
    honorarium: 0,
    badDebtProvision: 0,
  };

  let totalNewLoans = 0;

  // Monthly breakdown map (for monthly-wise trend in P&L)
  const monthlyBreakdown = {};

  (transactions || []).forEach(tx => {
    // Skip reversed transactions
    if (tx.status === 'REVERSED' || tx.category === 'REVERSAL') return;

    const txDate = new Date(tx.transactionDate || tx.createdAt);
    if (isNaN(txDate) || txDate < startDate || txDate > endDate) return;
    const monthKey = txDate.toLocaleString('default', { month: 'short', year: 'numeric' });

    if (!monthlyBreakdown[monthKey]) {
      monthlyBreakdown[monthKey] = { income: 0, expense: 0, surplus: 0 };
    }

    const cat = String(tx.category || tx.description || '').toUpperCase();
    const amount = Math.abs(Number(tx.amount) || 0);
    const folio = String(tx.ledgerFolio || '').trim();
    const isCredit = tx.entryType === 'CREDIT';
    const isDebit = tx.entryType === 'DEBIT';

    // ── INCOME (Credit Side) ──
    if (cat.includes('ADMISSION') || cat.includes('ADMISSION_FEE') || cat.includes('ENTRY_FEE')) {
      income.admissionFees += amount;
      monthlyBreakdown[monthKey].income += amount;
    } else if (cat.includes('BANK_INTEREST') || cat.includes('FD_INTEREST') || cat.includes('SAVINGS_INTEREST_RECEIVED')) {
      income.bankInterest += amount;
      monthlyBreakdown[monthKey].income += amount;
    } else if (cat.includes('PENAL') || cat.includes('PENALTY') || cat.includes('LATE_FEE')) {
      income.penalCharges += amount;
      monthlyBreakdown[monthKey].income += amount;
    } else if (folio === '153' || cat === 'INTEREST_INCOME' || cat.includes('LOAN_INTEREST') || cat.includes('INTEREST ON LOAN')) {
      income.loanInterest += amount;
      monthlyBreakdown[monthKey].income += amount;
    } else if (cat.includes('MISC_INCOME') || cat.includes('DIVIDEND_INCOME')) {
      income.miscIncome += amount;
      monthlyBreakdown[monthKey].income += amount;
    }

    // New loan disbursement tracking (for 5% statutory bad debt provision)
    if (folio === '152' && isDebit) {
      totalNewLoans += amount;
    } else if (cat === 'LOAN_DISBURSEMENT') {
      totalNewLoans += amount;
    }

    // ── EXPENDITURE (Debit Side) ──
    if (folio === '154' || cat.includes('RD_INTEREST') || cat.includes('MEMBER_INTEREST') || cat.includes('DIVIDEND_PAYOUT')) {
      expense.savingsInterest += amount;
      monthlyBreakdown[monthKey].expense += amount;
    } else if (cat.includes('BANK_CHARGE') || cat.includes('BANK CHARGE') || cat.includes('BANK_CHARGES') || cat.includes('UPI_CHARGE')) {
      expense.bankCharges += amount;
      monthlyBreakdown[monthKey].expense += amount;
    } else if (cat.includes('AUDIT') || cat.includes('AUDIT_FEE') || cat.includes('LEGAL')) {
      expense.auditFees += amount;
      monthlyBreakdown[monthKey].expense += amount;
    } else if (cat.includes('OFFICE') || cat.includes('STATIONERY') || cat.includes('STATIONARY_MISC') || cat.includes('PRINTING')) {
      expense.officeExpense += amount;
      monthlyBreakdown[monthKey].expense += amount;
    } else if (cat.includes('IT') || cat.includes('SOFTWARE') || cat.includes('HOSTING') || cat.includes('DOMAIN') || cat.includes('CLOUD')) {
      expense.itExpense += amount;
      monthlyBreakdown[monthKey].expense += amount;
    } else if (cat.includes('HONORARIUM') || cat.includes('SALARY') || cat.includes('ALLOWANCE')) {
      expense.honorarium += amount;
      monthlyBreakdown[monthKey].expense += amount;
    }
  });

  // Statutory Bad Debt Provision: 5% of new loans disbursed in period
  expense.badDebtProvision = Math.round(totalNewLoans * 0.05);

  const totalIncome = Object.values(income).reduce((a, b) => a + b, 0);
  const totalExpense = Object.values(expense).reduce((a, b) => a + b, 0);
  const grossSurplus = totalIncome - totalExpense;

  // Statutory Appropriations (Indian Co-operative Societies Act)
  const appropriations = {
    statutoryReserve: grossSurplus > 0 ? Math.round(grossSurplus * 0.25) : 0,
    dividendEqualization: grossSurplus > 0 ? Math.round(grossSurplus * 0.10) : 0,
    commonGoodFund: grossSurplus > 0 ? Math.round(grossSurplus * 0.05) : 0,
  };
  appropriations.distributableSurplus = grossSurplus > 0
    ? grossSurplus - appropriations.statutoryReserve - appropriations.dividendEqualization - appropriations.commonGoodFund
    : grossSurplus;

  // Build monthly surplus
  Object.keys(monthlyBreakdown).forEach(key => {
    monthlyBreakdown[key].surplus = monthlyBreakdown[key].income - monthlyBreakdown[key].expense;
  });

  const periodString = timeframeType === 'MONTHLY'
    ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    : `FY ${selectedFY}`;

  return {
    income, expense, appropriations, grossSurplus,
    totalIncome, totalExpense, monthlyBreakdown, periodString,
    timeframeType, startDate, endDate,
  };
};

export const exportPnLExcel = (pnl, timeframeType, selectedFY, selectedMonth, selectedYear) => {
  const wb = XLSX.utils.book_new();
  const fmt = (n) => Math.round(n || 0);

  // ---- Sheet 1: P&L Summary ----
  const summaryData = [
    ['MAHADEV CO-OPERATIVE THRIFT & CREDIT SOCIETY LTD.'],
    ['HPSEBL SHIMLA CITY ELECTRICAL DIVISION'],
    ['PROFIT & LOSS ACCOUNT'],
    [`Period: ${pnl.periodString}`],
    [],
    ['INCOME HEADS', 'AMOUNT (Rs.)'],
    ['Interest on Loans (Folio 153)', fmt(pnl.income.loanInterest)],
    ['Admission & Membership Fees', fmt(pnl.income.admissionFees)],
    ['Bank & FD Interest Receipts', fmt(pnl.income.bankInterest)],
    ['Penal Charges & Late Fees', fmt(pnl.income.penalCharges)],
    ['Miscellaneous Income', fmt(pnl.income.miscIncome)],
    ['TOTAL INCOME (A)', fmt(pnl.totalIncome)],
    [],
    ['EXPENDITURE HEADS', 'AMOUNT (Rs.)'],
    ['Interest on RD & Member Savings (Folio 154)', fmt(pnl.expense.savingsInterest)],
    ['Bank, UPI & Gateway Charges', fmt(pnl.expense.bankCharges)],
    ['Audit & Legal Professional Fees', fmt(pnl.expense.auditFees)],
    ['Office, Printing & Stationery Expenses', fmt(pnl.expense.officeExpense)],
    ['IT, Cloud & Software Maintenance', fmt(pnl.expense.itExpense)],
    ['Staff Honorarium & Allowances', fmt(pnl.expense.honorarium)],
    ['Bad Debt Provision (5% of Disbursed Loans)', fmt(pnl.expense.badDebtProvision)],
    ['TOTAL EXPENDITURE (B)', fmt(pnl.totalExpense)],
    [],
    ['GROSS SURPLUS / (DEFICIT) (A - B)', fmt(pnl.grossSurplus)],
    [],
    ['STATUTORY APPROPRIATIONS (Indian Co-operative Act)', 'AMOUNT (Rs.)'],
    ['25% Statutory Reserve Fund', fmt(pnl.appropriations.statutoryReserve)],
    ['10% Dividend Equalization Fund', fmt(pnl.appropriations.dividendEqualization)],
    ['5% Common Good / Welfare Fund', fmt(pnl.appropriations.commonGoodFund)],
    ['NET DISTRIBUTABLE SURPLUS', fmt(pnl.appropriations.distributableSurplus)],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 48 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'P&L Statement');

  // ---- Sheet 2: Monthly Trend (for Yearly reports) ----
  if (timeframeType === 'YEARLY' && Object.keys(pnl.monthlyBreakdown).length > 0) {
    const monthlyData = [
      ['Month', 'Income (Rs.)', 'Expenditure (Rs.)', 'Net Surplus / (Deficit) (Rs.)'],
      ...Object.entries(pnl.monthlyBreakdown).map(([month, data]) => [
        month,
        fmt(data.income),
        fmt(data.expense),
        fmt(data.surplus),
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(monthlyData);
    ws2['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly Trend');
  }

  const filename = `PnL_Report_${pnl.periodString.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
};

export const exportPnLPDF = async (pnl) => {
  // Uses clean 'Rs.' prefix so jsPDF standard fonts render crisp currency without broken Unicode glyphs
  const fmt = (n) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

  const incomeRows = [
    ['Interest on Loans (Folio 153)', fmt(pnl.income.loanInterest)],
    ['Admission & Membership Fees', fmt(pnl.income.admissionFees)],
    ['Bank & FD Interest Receipts', fmt(pnl.income.bankInterest)],
    ['Penal Charges & Late Fees', fmt(pnl.income.penalCharges)],
    ['Miscellaneous Income', fmt(pnl.income.miscIncome)],
    [
      { content: 'TOTAL INCOME (A)', styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } },
      { content: fmt(pnl.totalIncome), styles: { fontStyle: 'bold', textColor: [16, 126, 62], fillColor: [240, 253, 244] } }
    ],
  ];

  const expenseRows = [
    ['Interest on RD & Member Savings (Folio 154)', fmt(pnl.expense.savingsInterest)],
    ['Bank, UPI & Gateway Charges', fmt(pnl.expense.bankCharges)],
    ['Audit & Legal Professional Fees', fmt(pnl.expense.auditFees)],
    ['Office, Printing & Stationery', fmt(pnl.expense.officeExpense)],
    ['IT, Cloud & Software Maintenance', fmt(pnl.expense.itExpense)],
    ['Staff Honorarium & Allowances', fmt(pnl.expense.honorarium)],
    ['Bad Debt Provision (5% of Disbursals)', fmt(pnl.expense.badDebtProvision)],
    [
      { content: 'TOTAL EXPENDITURE (B)', styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } },
      { content: fmt(pnl.totalExpense), styles: { fontStyle: 'bold', textColor: [185, 28, 28], fillColor: [254, 242, 242] } }
    ],
  ];

  const surplusRows = [
    [
      { content: 'GROSS SURPLUS / (DEFICIT) (A - B)', styles: { fontStyle: 'bold', fillColor: [239, 246, 255] } },
      { content: fmt(pnl.grossSurplus), styles: { fontStyle: 'bold', textColor: pnl.grossSurplus >= 0 ? [10, 110, 209] : [185, 28, 28], fillColor: [239, 246, 255] } }
    ],
    ['25% – Statutory Reserve Fund', fmt(pnl.appropriations.statutoryReserve)],
    ['10% – Dividend Equalization Fund', fmt(pnl.appropriations.dividendEqualization)],
    ['5% – Common Good / Welfare Fund', fmt(pnl.appropriations.commonGoodFund)],
    [
      { content: 'NET DISTRIBUTABLE SURPLUS', styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } },
      { content: fmt(pnl.appropriations.distributableSurplus), styles: { fontStyle: 'bold', textColor: [16, 126, 62], fillColor: [240, 253, 244] } }
    ],
  ];

  await generatePDF({
    title: 'Profit & Loss Account (P&L)',
    subtitle: `Period: ${pnl.periodString} | Co-operative Societies Format`,
    filename: `PnL_Report_${pnl.periodString.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
    sections: [
      { heading: '1. INCOME (CREDIT)', columns: ['Head of Account', 'Amount (Rs.)'], data: incomeRows },
      { heading: '2. EXPENDITURE (DEBIT)', columns: ['Head of Account', 'Amount (Rs.)'], data: expenseRows },
      { heading: '3. SURPLUS & STATUTORY APPROPRIATIONS', columns: ['Item Description', 'Amount (Rs.)'], data: surplusRows },
    ],
  });
};

