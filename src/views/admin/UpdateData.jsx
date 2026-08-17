import React, { useState } from 'react'
import {
  CCard, CCardHeader, CCardBody, CRow, CCol, CButton,
  CFormInput, CFormLabel, CAlert, CSpinner, CInputGroup, CInputGroupText,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CBadge, CFormSelect
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCloudUpload, cilFile, cilDescription, cilCheckCircle, cilWarning, cilLightbulb, cilArrowRight, cilExternalLink } from '@coreui/icons'
import * as xlsx from 'xlsx'
import { runDuplicateDetection } from '../../utils/duplicateDetector'

const SCHEMAS = {
  master: {
    Vendor_No: "Unique Employee ID / Vendor No (Required)",
    Society_Account_No: "Society Account Number",
    Full_Name: "Full Name of Member",
    Designation: "Job Title",
    Phone: "Contact Number",
    Email: "Email Address",
    Circle: "Work Circle",
    Division: "Work Division",
    Sub_Division: "Work Sub-Division",
    Section: "Work Section",
    Aadhar_Number: "Aadhar or National ID Number",
    PAN_Number: "PAN Card Number (For Tax Returns)",
    Bank_Name: "Name of the Bank for Payouts",
    Bank_Account_Number: "Bank Account Number",
    IFSC_Code: "Bank IFSC Code",
    Nominee_Name: "Name of the Nominee / Next of Kin",
    Nominee_Relationship: "Relationship with Nominee",
    Nominee_Phone: "Nominee Contact Number",
    UPI_ID: "UPI ID for Loan/Withdrawal Disbursals",
    Opening_Share_Balance: "Total Share Capital Amount",
    Opening_RD_Balance: "Total Recurring Deposit Amount",
    Monthly_RD_Amount: "Monthly RD Deduction",
    Active_Loan_ID: "Current Loan Account Number",
    Opening_Principal_Pending: "Remaining Loan Principal",
    Opening_Interest_Pending: "Remaining Loan Interest",
    Current_EMI_Amount: "Monthly EMI Deduction"
  },
  shares: {
    Vendor_No: "Unique Employee ID / Vendor No (Required)",
    Member_Name: "Full Name of Member",
    Share_Deduction: "Monthly Share Amount Deducted",
    RD_Deduction: "Monthly RD Amount Deducted",
    Transaction_Date: "Date of Transaction (YYYY-MM-DD)",
    Batch_ID: "Salary Batch ID (e.g. SAL-JULY)"
  },
  loans: {
    Vendor_No: "Unique Employee ID / Vendor No (Required)",
    Member_Name: "Full Name of Member",
    Loan_ID: "System Loan ID (e.g. LN-1045)",
    Total_EMI_Amount: "EMI Amount Deducted",
    Transaction_Date: "Date of Transaction (YYYY-MM-DD)",
    Batch_ID: "EMI Batch ID (e.g. EMI-JULY)"
  },
  historicalLoans: {
    vendorNo: "Unique Employee ID / Vendor No (Required)",
    loanAmount: "Total Loan Amount Sanctioned",
    interestRate: "Interest Rate (e.g. 10)",
    tenure: "Tenure in Months (e.g. 12)",
    issueDate: "Date of Issue (YYYY-MM-DD)",
    currentOutstanding: "Remaining Principal Outstanding"
  }
};

const UpdateData = () => {
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000'
  
  const [activeType, setActiveType] = useState(null); // 'master', 'shares', 'loans'
  const [stage, setStage] = useState('SELECT') // SELECT -> MAPPING -> VERIFY -> DONE
  
  const [alerts, setAlerts] = useState({ master: null, shares: null, loans: null })
  
  const [initForm, setInitForm] = useState({
    asOfDate: '',
    bankBalance: '',
    cashInHand: ''
  })
  
  const [rawHeaders, setRawHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [columnMapping, setColumnMapping] = useState({}) 
  const [isAiMapping, setIsAiMapping] = useState(false)
  const [processedData, setProcessedData] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  // Duplicate detection state
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false)
  const [duplicateFlags, setDuplicateFlags] = useState([])

  // --- TEMPLATE GENERATOR ---
  const downloadTemplate = (type, templateName) => {
    let csvContent = "data:text/csv;charset=utf-8,\n"
    let headers = Object.keys(SCHEMAS[type]).join(",")
    let sampleRow = ""

    if (type === 'master') {
      sampleRow = "1045,S-1045,Amit Kumar,Foreman,9876543210,amit@test.com,Shimla,City Electrical,Lakkar Bazar,Sec-A,123412341234,ABCDE1234F,SBI,1122334455,SBIN0001234,Priya Kumar,Spouse,9876543211,amit@upi,25000,12500,2000,LN-1045-A,15000,1200,2500"
    } else if (type === 'shares') {
      sampleRow = "1045,Amit Kumar,1000,2000,2026-07-31,SAL-JULY-2026"
    } else if (type === 'loans') {
      sampleRow = "1045,Amit Kumar,LN-1045-A,4614,2026-07-31,EMI-JULY-2026"
    } else if (type === 'historicalLoans') {
      sampleRow = "1045,50000,10,12,2023-04-01,25000"
    }

    csvContent += headers + "\n" + sampleRow + "\n"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${templateName}_Template.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // --- 1. FILE PARSING & AI CALL ---
  const handleFileParse = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'master' && !initForm.asOfDate) {
      setAlerts({ ...alerts, master: { type: 'warning', text: 'Please set the As Of Date first.' } })
      e.target.value = null; // Reset input
      return;
    }

    setActiveType(type);
    setStage('MAPPING');
    setIsAiMapping(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = xlsx.read(data, { type: 'array' });
        let allRows = [];
        let primaryHeaders = [];
        
        workbook.SheetNames.forEach(sheetName => {
          const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
          if (sheetRows.length > 0) {
            // Tag each row with its month/sheet source
            sheetRows.forEach(r => r._sourceSheet = sheetName);
            allRows = allRows.concat(sheetRows);
            // Grab headers from the first sheet that has data
            if (primaryHeaders.length === 0) {
              primaryHeaders = Object.keys(sheetRows[0]).filter(k => k !== '_sourceSheet');
            }
          }
        });

        if (allRows.length === 0) {
          throw new Error("The Excel file has no readable data rows across any sheets.");
        }

        setRawHeaders(primaryHeaders);
        setRawRows(allRows);

        // ── Stage 1: JavaScript fuzzy-match (always runs first as baseline) ──
        const fuzzyMatch = (targetKey, excelHeaders) => {
          // Normalize: lowercase, remove underscores/spaces/special chars
          const norm = s => s.toLowerCase().replace(/[_\s\-\.\/]/g, '');
          const tNorm = norm(targetKey);
          
          // Aliases for common field names so we can catch variations
          const aliases = {
            vendor_no: ['vendorno', 'vendorid', 'empno', 'empid', 'employeeno', 'employeeid', 'memberid', 'memberno', 'id', 'code'],
            society_account_no: ['societyaccountno', 'societyaccount', 'accountno', 'saccono', 'societyid'],
            full_name: ['fullname', 'name', 'membername', 'employeename', 'empname'],
            member_name: ['membername', 'name', 'fullname', 'employeename'],
            loan_id: ['loanid', 'loanno', 'loannumber', 'accountno', 'accountnumber'],
            total_emi_amount: ['emiamount', 'emi', 'totalemi', 'emideducted', 'emiamt'],
            share_deduction: ['sharededuction', 'shares', 'shareamt', 'shareamount', 'sharecapital'],
            rd_deduction: ['rddeduction', 'rd', 'rdamt', 'rdamount', 'recurringdeposit'],
            transaction_date: ['date', 'transactiondate', 'txdate', 'salarydate'],
            batch_id: ['batchid', 'batch', 'salarymonth', 'month', 'period'],
            opening_share_balance: ['sharecapital', 'sharebalance', 'shareamount', 'totalshares', 'shares'],
            opening_rd_balance: ['rdbalance', 'rdamount', 'recurringdeposit', 'rdtotal'],
            monthly_rd_amount: ['monthlyrd', 'rdmonthly', 'rddeduction', 'rdamt'],
            opening_principal_pending: ['principalpending', 'loanbalance', 'loanpending', 'principaloutstanding', 'outstanding'],
            opening_interest_pending: ['interestpending', 'interestoutstanding', 'interest'],
            current_emi_amount: ['emiamount', 'emi', 'currentemi', 'monthlyemi'],
            designation: ['designation', 'jobtitle', 'post', 'position', 'rank'],
            phone: ['phone', 'mobile', 'contact', 'phoneno', 'mobileno'],
            email: ['email', 'emailid', 'emailaddress'],
            circle: ['circle', 'zone'],
            division: ['division', 'dept', 'department'],
            sub_division: ['subdivision', 'subzone', 'subdept'],
            section: ['section', 'unit'],
            aadhar_number: ['aadhar', 'aadharno', 'aadharnumber', 'uidai', 'nationalid'],
            pan_number: ['pan', 'panno', 'pannumber', 'pancard', 'taxid'],
            bank_name: ['bank', 'bankname', 'bankaccount'],
            bank_account_number: ['accountnumber', 'acctno', 'bankacct', 'accountno', 'bankaccountnumber'],
            ifsc_code: ['ifsc', 'ifsccode', 'branchcode', 'routingnumber'],
            nominee_name: ['nominee', 'nomineename', 'nextofkin'],
            nominee_relationship: ['nomineerelation', 'nomineerelationship', 'relation', 'relationship'],
            nominee_phone: ['nomineephone', 'nomineecontact', 'nomineemobile'],
            upi_id: ['upi', 'upiid', 'upivpa', 'vpa', 'paymentid'],
          };
          
          const tAliases = aliases[tNorm] || [];
          
          // First try exact normalized match
          for (const h of excelHeaders) {
            if (norm(h) === tNorm) return h;
          }
          // Then try alias match
          for (const h of excelHeaders) {
            const hNorm = norm(h);
            if (tAliases.includes(hNorm)) return h;
          }
          // Then try contains match (target contains header or header contains target)
          for (const h of excelHeaders) {
            const hNorm = norm(h);
            if (tNorm.includes(hNorm) || hNorm.includes(tNorm)) return h;
          }
          return null;
        };

        // Build baseline mapping using JS fuzzy match
        const baselineMapping = {};
        Object.keys(SCHEMAS[type]).forEach(targetKey => {
          const match = fuzzyMatch(targetKey, primaryHeaders);
          if (match) baselineMapping[targetKey] = match;
        });

        // ── Stage 2: AI mapping to override/confirm baseline ──
        const token = localStorage.getItem('adminToken');
        const sampleRows = allRows.slice(0, 3);
        
        try {
          const response = await fetch(`${apiBase}/api/ai/map-excel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ headers: primaryHeaders, sampleRows, targetSchema: SCHEMAS[type] })
          });

          if (response.ok) {
            const result = await response.json();
            const aiMapping = result.mapping || {};
            // Merge: start with baseline, override with AI suggestions (only non-null values)
            const mergedMapping = { ...baselineMapping };
            Object.entries(aiMapping).forEach(([key, val]) => {
              if (val && val !== 'null' && val !== 'undefined' && primaryHeaders.includes(val)) {
                mergedMapping[key] = val;
              }
            });
            setColumnMapping(mergedMapping);
          } else {
            // AI failed — use JS baseline
            console.warn("AI Mapping failed. Using JavaScript fuzzy match baseline.");
            setColumnMapping(baselineMapping);
          }
        } catch (fetchErr) {
          console.warn("Backend unreachable for AI mapping. Using JS fuzzy match baseline.", fetchErr);
          setColumnMapping(baselineMapping);
        }

      } catch (err) {
        console.error(err);
        setAlerts({ ...alerts, [type]: { type: 'danger', text: err.message || 'Failed to parse Excel file.' } });
        setStage('SELECT');
        setActiveType(null);
      } finally {
        setIsAiMapping(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- 2. PROCESS MAPPED DATA FOR VERIFICATION ---
  const processMappedData = async () => {
    const type = activeType;
    const targetSchema = SCHEMAS[type];
    const processed = rawRows.map((row, index) => {
      let newRow = { _id: index, _selected: true, _isValid: true, _errors: [] };
      
      Object.keys(targetSchema).forEach(targetKey => {
        const mappedHeader = columnMapping[targetKey];
        newRow[targetKey] = mappedHeader ? row[mappedHeader] : "";
      });

      if (!newRow.Vendor_No) {
        newRow._isValid = false;
        newRow._selected = false;
        newRow._errors.push("Missing Vendor No");
      }
      
      // Java-style algorithmic cleaning for numbers
      const numericFields = ['Opening_Share_Balance', 'Opening_RD_Balance', 'Monthly_RD_Amount', 'Opening_Principal_Pending', 'Opening_Interest_Pending', 'Current_EMI_Amount', 'Share_Deduction', 'RD_Deduction', 'Total_EMI_Amount'];
      numericFields.forEach(field => {
        if (newRow[field] !== undefined) {
          let val = String(newRow[field]);
          // Strip out commas, currency symbols, and whitespace
          val = val.replace(/₹|,|\s/g, '');
          newRow[field] = Number(val) || 0;
        }
      });
      
      // Preserve the source sheet
      newRow._sourceSheet = row._sourceSheet;

      return newRow;
    });

    setProcessedData(processed);
    setStage('VERIFY');

    // ── Run duplicate detection after data is ready ──
    setIsDuplicateChecking(true);
    setDuplicateFlags([]);
    try {
      const flags = await runDuplicateDetection(processed, type, apiBase);
      setDuplicateFlags(flags);
    } catch (err) {
      console.warn('Duplicate detection error (non-blocking):', err);
    } finally {
      setIsDuplicateChecking(false);
    }
  }

  // --- 3. FINAL UPLOAD ---
  const handleFinalUpload = async () => {
    const dataToUpload = processedData.filter(r => r._selected);
    if (dataToUpload.length === 0) {
      setAlerts({ ...alerts, [activeType]: { type: 'warning', text: 'No valid rows selected for upload.' } });
      return;
    }

    setIsUploading(true);
    try {
      let endpoint = '';
      let payload = {};

      if (activeType === 'master') {
        endpoint = `${apiBase}/api/auth/system-init`;
        payload = {
          asOfDate: initForm.asOfDate,
          bankBalance: initForm.bankBalance || 0,
          cashInHand: initForm.cashInHand || 0,
          rows: dataToUpload
        };
      } else {
        // Mock endpoints for Shares and Loans for now
        // Normally you'd hit `/api/transactions/bulk-shares` etc.
        setTimeout(() => {
          setAlerts({ ...alerts, [activeType]: { type: 'success', text: `Success: Processed ${dataToUpload.length} rows.` } });
          setStage('DONE');
          setIsUploading(false);
        }, 1500);
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (response.ok) {
        setAlerts({ ...alerts, [activeType]: { type: 'success', text: result.message || 'Upload Successful.' } });
        setStage('DONE');
      } else {
        setAlerts({ ...alerts, [activeType]: { type: 'danger', text: result.message || 'Upload failed.' } });
      }
    } catch (err) {
      setAlerts({ ...alerts, [activeType]: { type: 'danger', text: 'Server error during upload.' } });
    } finally {
      if (activeType === 'master') setIsUploading(false);
    }
  }

  // --- UI RENDERERS ---
  const renderMappingUI = () => (
    <CCard className="mb-4 shadow-sm border-0 border-top border-3 border-info">
      <CCardHeader className="bg-white pt-3 pb-3">
        <h5 className="mb-0 fw-bold d-flex align-items-center">
          <CIcon icon={cilLightbulb} className="me-2 text-info" size="lg" />
          AI Smart Column Mapping ({activeType.toUpperCase()})
        </h5>
      </CCardHeader>
      <CCardBody>
        {isAiMapping ? (
          <div className="text-center py-5">
            <CSpinner color="info" />
            <div className="mt-3 text-muted fw-bold">AI is analyzing your Excel headers...</div>
          </div>
        ) : (
          <>
            <CAlert color="info" className="mb-4 shadow-sm">
              The AI + Smart Match has auto-mapped your Excel columns. 
              <strong> {Object.values(columnMapping).filter(Boolean).length} of {Object.keys(SCHEMAS[activeType]).length} fields mapped.</strong> Please review and adjust any unmatched fields before proceeding.
            </CAlert>
            <div className="table-responsive" style={{ maxHeight: '450px' }}>
              <CTable bordered align="middle" small hover>
                <CTableHead color="light">
                  <CTableRow>
                    <CTableHeaderCell>System Required Field</CTableHeaderCell>
                    <CTableHeaderCell className="text-center" style={{width:'80px'}}>Status</CTableHeaderCell>
                    <CTableHeaderCell>Your Excel Column</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {Object.entries(SCHEMAS[activeType]).map(([key, desc]) => {
                    const isMapped = !!columnMapping[key];
                    return (
                      <CTableRow key={key} className={isMapped ? '' : 'table-warning'}>
                        <CTableDataCell>
                          <div className="fw-bold">{key}</div>
                          <div className="small text-muted">{desc}</div>
                        </CTableDataCell>
                        <CTableDataCell className="text-center">
                          {isMapped
                            ? <CBadge color="success" className="px-2">✓ Mapped</CBadge>
                            : <CBadge color="warning" className="px-2 text-dark">⚠ Manual</CBadge>
                          }
                        </CTableDataCell>
                        <CTableDataCell>
                          <CFormSelect 
                            size="sm" 
                            value={columnMapping[key] || ""}
                            style={{ borderColor: isMapped ? '#2eb85c' : '#f9b115' }}
                            onChange={(e) => setColumnMapping({...columnMapping, [key]: e.target.value || undefined})}
                          >
                            <option value="">-- Ignore / Not Provided --</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </CFormSelect>
                        </CTableDataCell>
                      </CTableRow>
                    );
                  })}
                </CTableBody>
              </CTable>
            </div>
            <div className="d-flex justify-content-between mt-4">
              <CButton color="secondary" variant="ghost" onClick={() => { setStage('SELECT'); setActiveType(null); }}>Cancel</CButton>
              <CButton color="info" className="text-white px-4" onClick={processMappedData}>
                Verify Data <CIcon icon={cilArrowRight} className="ms-2" />
              </CButton>
            </div>
          </>
        )}
      </CCardBody>
    </CCard>
  );


  const renderVerifyUI = () => {
    const selectedCount = processedData.filter(r => r._selected).length;
    
    // Dynamic Totals based on type
    let totalShares = 0, totalRD = 0, totalLoans = 0, totalEMI = 0;
    if (activeType === 'master') {
      totalShares = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.Opening_Share_Balance || 0), 0);
      totalRD = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.Opening_RD_Balance || 0), 0);
      totalLoans = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.Opening_Principal_Pending || 0), 0);
    } else if (activeType === 'shares') {
      totalShares = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.Share_Deduction || 0), 0);
      totalRD = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.RD_Deduction || 0), 0);
    } else if (activeType === 'loans') {
      totalEMI = processedData.filter(r => r._selected).reduce((acc, curr) => acc + (curr.Total_EMI_Amount || 0), 0);
    }

    return (
      <CCard className="mb-4 shadow-sm border-0 border-top border-3 border-success">
        <CCardHeader className="bg-white pt-3 pb-3 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">Data Verification ({activeType.toUpperCase()})</h5>
          <CBadge color="success" shape="rounded-pill" className="px-3 py-2 fs-6">
            {selectedCount} / {processedData.length} Rows Accepted
          </CBadge>
        </CCardHeader>
        <CCardBody>
          <CRow className="mb-4 text-center">
            {activeType !== 'loans' && (
              <>
                <CCol>
                  <div className="text-muted small fw-bold text-uppercase">Total Shares</div>
                  <h4 className="text-success mb-0">₹{totalShares.toLocaleString('en-IN')}</h4>
                </CCol>
                <CCol>
                  <div className="text-muted small fw-bold text-uppercase">Total RD</div>
                  <h4 className="text-info mb-0">₹{totalRD.toLocaleString('en-IN')}</h4>
                </CCol>
              </>
            )}
            {activeType === 'master' && (
              <CCol>
                <div className="text-muted small fw-bold text-uppercase">Total Loans Pending</div>
                <h4 className="text-warning mb-0">₹{totalLoans.toLocaleString('en-IN')}</h4>
              </CCol>
            )}
            {activeType === 'loans' && (
              <CCol>
                <div className="text-muted small fw-bold text-uppercase">Total EMI Collections</div>
                <h4 className="text-primary mb-0">₹{totalEMI.toLocaleString('en-IN')}</h4>
              </CCol>
            )}
          </CRow>

          {/* ── Duplicate Detection Banner ────────────────────────────── */}
          {isDuplicateChecking && (
            <CAlert color="info" className="py-2 mb-3 d-flex align-items-center gap-2">
              <CSpinner size="sm" />
              <span>Scanning for duplicate entries...</span>
            </CAlert>
          )}
          {!isDuplicateChecking && duplicateFlags.length > 0 && (
            <CAlert color="warning" className="py-3 mb-3">
              <div className="d-flex align-items-start gap-3">
                <CIcon icon={cilWarning} size="xl" className="text-warning flex-shrink-0 mt-1" />
                <div className="flex-grow-1">
                  <div className="fw-bold mb-1">
                    ⚠️ {duplicateFlags.length} Potential Duplicate{duplicateFlags.length > 1 ? 's' : ''} Detected
                  </div>
                  <div className="small text-muted mb-2">
                    The system has flagged {duplicateFlags.length} row{duplicateFlags.length > 1 ? 's' : ''} that 
                    may already exist in the database or appear more than once in this file. 
                    The system will <strong>NOT</strong> auto-reject them — you must review each one.
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    {duplicateFlags.filter(f => f.type === 'INTRA_BATCH').length > 0 && (
                      <CBadge color="danger" className="px-2 py-1">
                        📄 {duplicateFlags.filter(f => f.type === 'INTRA_BATCH').length} within-file duplicates
                      </CBadge>
                    )}
                    {duplicateFlags.filter(f => f.type === 'EXISTING_RECORD').length > 0 && (
                      <CBadge color="warning" textColor="dark" className="px-2 py-1">
                        🗄️ {duplicateFlags.filter(f => f.type === 'EXISTING_RECORD').length} already in database
                      </CBadge>
                    )}
                  </div>
                </div>
                <CButton
                  color="warning"
                  className="fw-bold text-dark flex-shrink-0"
                  href="#/admin/duplicate-review"
                  target="_blank"
                  rel="noreferrer"
                >
                  <CIcon icon={cilExternalLink} className="me-2" />
                  Review Duplicates
                </CButton>
              </div>
            </CAlert>
          )}
          {!isDuplicateChecking && duplicateFlags.length === 0 && processedData.length > 0 && (
            <CAlert color="success" className="py-2 mb-3">
              <CIcon icon={cilCheckCircle} className="me-2" />
              <strong>No duplicates detected.</strong> All rows in this file appear to be unique.
            </CAlert>
          )}

          <div className="table-responsive" style={{ maxHeight: '500px', overflowX: 'auto' }}>
            <CTable bordered align="middle" hover small striped>
              <CTableHead color="light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <CTableRow>
                  <CTableHeaderCell className="text-center" style={{ minWidth: '60px' }}>Upload</CTableHeaderCell>
                  <CTableHeaderCell style={{ minWidth: '100px' }}>Source / Month</CTableHeaderCell>
                  <CTableHeaderCell style={{ minWidth: '100px' }}>Status</CTableHeaderCell>
                  {/* DYNAMIC HEADERS FROM SCHEMA */}
                  {Object.keys(SCHEMAS[activeType]).map(key => (
                    <CTableHeaderCell key={key} style={{ minWidth: '150px' }}>
                      {key.replace(/_/g, ' ')}
                    </CTableHeaderCell>
                  ))}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {processedData.map((row, idx) => (
                  <CTableRow key={row._id} color={!row._isValid ? 'danger' : row._selected ? '' : 'light'}>
                    <CTableDataCell className="text-center">
                      <input 
                        type="checkbox" 
                        className="form-check-input" 
                        checked={row._selected}
                        onChange={(e) => {
                          const newData = [...processedData];
                          newData[idx]._selected = e.target.checked;
                          setProcessedData(newData);
                        }}
                      />
                    </CTableDataCell>
                    <CTableDataCell><CBadge color="info">{row._sourceSheet}</CBadge></CTableDataCell>
                    <CTableDataCell>
                      {!row._isValid ? (
                        <CBadge color="danger" title={row._errors.join(', ')}>Error</CBadge>
                      ) : row._selected ? (
                        <CBadge color="success">Valid</CBadge>
                      ) : (
                        <CBadge color="secondary">Ignored</CBadge>
                      )}
                    </CTableDataCell>
                    
                    {/* DYNAMIC DATA CELLS */}
                    {Object.keys(SCHEMAS[activeType]).map(key => {
                      const val = row[key];
                      // Format currency fields
                      const isNumeric = ['Opening_Share_Balance', 'Opening_RD_Balance', 'Monthly_RD_Amount', 'Opening_Principal_Pending', 'Opening_Interest_Pending', 'Current_EMI_Amount', 'Share_Deduction', 'RD_Deduction', 'Total_EMI_Amount'].includes(key);
                      return (
                        <CTableDataCell key={key}>
                          {isNumeric ? `₹${val.toLocaleString('en-IN')}` : val}
                        </CTableDataCell>
                      );
                    })}
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>

          <div className="d-flex justify-content-between mt-4">
            <CButton color="secondary" variant="ghost" onClick={() => setStage('MAPPING')}>Back</CButton>
            <CButton color="success" className="text-white px-5 shadow-sm fw-bold" onClick={handleFinalUpload} disabled={isUploading || selectedCount === 0}>
              {isUploading ? <CSpinner size="sm" className="me-2"/> : <CIcon icon={cilCloudUpload} className="me-2"/>}
              Confirm & Upload
            </CButton>
          </div>
        </CCardBody>
      </CCard>
    )
  };

  const renderDoneUI = () => (
    <CCard className="mb-4 shadow-sm border-0 border-top border-3 border-success text-center py-5">
      <CCardBody>
        <CIcon icon={cilCheckCircle} size="3xl" className="text-success mb-3" />
        <h3 className="fw-bold">Upload Successful!</h3>
        <p className="text-medium-emphasis">Data for {activeType} has been processed and logged.</p>
        <CButton color="success" className="text-white mt-3" onClick={() => {
          setInitForm({ asOfDate: '', bankBalance: '', cashInHand: '' });
          setActiveType(null);
          setStage('SELECT');
        }}>
          Upload Another File
        </CButton>
      </CCardBody>
    </CCard>
  );

  return (
    <>
      <div className="mb-4">
        <h4 className="mb-0 text-dark fw-bold">Smart Data Management</h4>
        <div className="small text-medium-emphasis">AI-powered bulk data initialization and processing.</div>
      </div>

      {stage === 'MAPPING' && renderMappingUI()}
      {stage === 'VERIFY' && renderVerifyUI()}
      {stage === 'DONE' && renderDoneUI()}

      {/* DEFAULT SELECT UI - HIDES IF IN MAPPING/VERIFY STAGE */}
      <CRow className={`align-items-stretch ${stage !== 'SELECT' ? 'd-none' : ''}`}>
        
        {/* 1. MASTER INIT CARD */}
        <CCol lg={4} className="mb-4">
          <CCard className="shadow-sm border-0 h-100 border-top border-3 border-dark">
            <CCardHeader className="bg-white pt-3 pb-3">
              <h5 className="mb-0 text-dark fw-bold">1. System Initialization</h5>
            </CCardHeader>
            <CCardBody className="p-4 d-flex flex-column">
              <p className="text-medium-emphasis mb-3 small">Upload master historical sheet.</p>
              
              {alerts.master && (
                <CAlert color={alerts.master.type} className="py-2 mb-3 shadow-sm d-flex align-items-center" dismissible onClose={() => setAlerts({...alerts, master: null})}>
                  <CIcon icon={alerts.master.type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
                  <div>{alerts.master.text}</div>
                </CAlert>
              )}

              <div className="mb-3">
                <CFormLabel className="small fw-bold mb-1">Migration "As Of" Date</CFormLabel>
                <CFormInput type="date" size="sm" value={initForm.asOfDate} onChange={(e) => setInitForm({...initForm, asOfDate: e.target.value})} />
              </div>
              
              <CRow className="mb-3 g-2">
                <CCol xs={6}>
                  <CFormLabel className="small fw-bold mb-1">Bank Balance</CFormLabel>
                  <CInputGroup size="sm"><CInputGroupText>₹</CInputGroupText><CFormInput type="number" placeholder="0" value={initForm.bankBalance} onChange={(e) => setInitForm({...initForm, bankBalance: e.target.value})} /></CInputGroup>
                </CCol>
                <CCol xs={6}>
                  <CFormLabel className="small fw-bold mb-1">Cash in Hand</CFormLabel>
                  <CInputGroup size="sm"><CInputGroupText>₹</CInputGroupText><CFormInput type="number" placeholder="0" value={initForm.cashInHand} onChange={(e) => setInitForm({...initForm, cashInHand: e.target.value})} /></CInputGroup>
                </CCol>
              </CRow>
              
              <div className="mb-4 bg-light p-3 rounded text-center flex-grow-1" style={{ border: '2px dashed #c4c9d0' }}>
                <CIcon icon={cilFile} size="xl" className="mb-2 text-secondary" />
                <div className="small text-muted mb-2">Select Master Data</div>
                <CFormInput type="file" size="sm" accept=".csv, .xlsx, .xls" onChange={(e) => handleFileParse(e, 'master')} />
              </div>

              <CButton color="secondary" variant="ghost" size="sm" className="mt-auto" onClick={() => downloadTemplate('master', 'Master_Init')}>
                <CIcon icon={cilDescription} className="me-2" /> Template
              </CButton>
            </CCardBody>
          </CCard>
        </CCol>

        {/* 2. SHARES CARD */}
        <CCol lg={4} className="mb-4">
          <CCard className="shadow-sm border-0 h-100 border-top border-3 border-success">
            <CCardHeader className="bg-white pt-3 pb-3">
              <h5 className="mb-0 text-dark fw-bold">2. Monthly Shares</h5>
            </CCardHeader>
            <CCardBody className="p-4 d-flex flex-column">
              <p className="text-medium-emphasis mb-4 small">Upload monthly payroll deduction sheet for shares and RD.</p>
              
              {alerts.shares && (
                <CAlert color={alerts.shares.type} className="py-2 mb-3 shadow-sm d-flex align-items-center" dismissible onClose={() => setAlerts({...alerts, shares: null})}>
                  <CIcon icon={alerts.shares.type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
                  <div>{alerts.shares.text}</div>
                </CAlert>
              )}

              <div className="mb-4 bg-light p-4 rounded text-center flex-grow-1 d-flex flex-column justify-content-center align-items-center" style={{ border: '2px dashed #c4c9d0' }}>
                <CIcon icon={cilFile} size="3xl" className="mb-3 text-secondary" />
                <div className="small text-muted mb-3">Select Shares Data</div>
                <CFormInput type="file" accept=".csv, .xlsx, .xls" size="sm" className="w-75 mx-auto" onChange={(e) => handleFileParse(e, 'shares')} />
              </div>

              <CButton color="secondary" variant="ghost" size="sm" className="mt-auto" onClick={() => downloadTemplate('shares', 'Monthly_Shares')}>
                <CIcon icon={cilDescription} className="me-2" /> Template
              </CButton>
            </CCardBody>
          </CCard>
        </CCol>

        {/* 3. LOANS CARD */}
        <CCol lg={4} className="mb-4">
          <CCard className="shadow-sm border-0 h-100 border-top border-3 border-primary">
            <CCardHeader className="bg-white pt-3 pb-3">
              <h5 className="mb-0 text-dark fw-bold">3. Monthly Loan EMIs</h5>
            </CCardHeader>
            <CCardBody className="p-4 d-flex flex-column">
              <p className="text-medium-emphasis mb-4 small">Upload loan recovery sheet to process EMIs.</p>

              {alerts.loans && (
                <CAlert color={alerts.loans.type} className="py-2 mb-3 shadow-sm d-flex align-items-center" dismissible onClose={() => setAlerts({...alerts, loans: null})}>
                  <CIcon icon={alerts.loans.type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
                  <div>{alerts.loans.text}</div>
                </CAlert>
              )}

              <div className="mb-4 bg-light p-4 rounded text-center flex-grow-1 d-flex flex-column justify-content-center align-items-center" style={{ border: '2px dashed #c4c9d0' }}>
                <CIcon icon={cilFile} size="3xl" className="mb-3 text-secondary" />
                <div className="small text-muted mb-3">Select EMI Data</div>
                <CFormInput type="file" accept=".csv, .xlsx, .xls" size="sm" className="w-75 mx-auto" onChange={(e) => handleFileParse(e, 'loans')} />
              </div>

              <CButton color="secondary" variant="ghost" size="sm" className="mt-auto" onClick={() => downloadTemplate('loans', 'Monthly_Loan_EMIs')}>
                <CIcon icon={cilDescription} className="me-2" /> Template
              </CButton>
            </CCardBody>
          </CCard>
        </CCol>

      </CRow>

      {/* 4. HISTORICAL LOANS CARD (DIRECT FILE UPLOAD) */}
      <CRow className={`align-items-stretch ${stage !== 'SELECT' ? 'd-none' : ''}`}>
        <CCol lg={4} className="mb-4">
          <CCard className="shadow-sm border-0 h-100 border-top border-3 border-warning">
            <CCardHeader className="bg-white pt-3 pb-3">
              <h5 className="mb-0 text-dark fw-bold">4. Historical Loans (FY 23-24)</h5>
            </CCardHeader>
            <CCardBody className="p-4 d-flex flex-column">
              <p className="text-medium-emphasis mb-4 small">Bulk upload historical loans directly to the server.</p>

              {alerts.hist_loans && (
                <CAlert color={alerts.hist_loans.type} className="py-2 mb-3 shadow-sm d-flex align-items-center" dismissible onClose={() => setAlerts({...alerts, hist_loans: null})}>
                  <CIcon icon={alerts.hist_loans.type === 'success' ? cilCheckCircle : cilWarning} className="me-2" />
                  <div>{alerts.hist_loans.text}</div>
                </CAlert>
              )}

              <div className="mb-4 bg-light p-4 rounded text-center flex-grow-1 d-flex flex-column justify-content-center align-items-center" style={{ border: '2px dashed #c4c9d0' }}>
                <CIcon icon={cilFile} size="3xl" className="mb-3 text-secondary" />
                <div className="small text-muted mb-3">Select Excel File</div>
                <CFormInput type="file" accept=".csv, .xlsx, .xls" size="sm" className="w-75 mx-auto" onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  
                  const formData = new FormData();
                  formData.append('file', file);

                  setIsUploading(true);
                  try {
                    const response = await fetch(`${apiBase}/api/excel/upload-historical-loans`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                      },
                      body: formData
                    });
                    const result = await response.json();
                    if (response.ok) {
                      let msg = `Processed ${result.results?.successCount} loans.`;
                      if (result.results?.errorCount > 0) {
                        msg += ` Failed ${result.results.errorCount} rows. Reason: ${result.results.errors[0]}`;
                      }
                      setAlerts({ ...alerts, hist_loans: { type: result.results?.successCount > 0 ? 'success' : 'danger', text: msg } });
                    } else {
                      setAlerts({ ...alerts, hist_loans: { type: 'danger', text: result.message || 'Upload failed.' } });
                    }
                  } catch (err) {
                    setAlerts({ ...alerts, hist_loans: { type: 'danger', text: 'Server error during upload.' } });
                  } finally {
                    setIsUploading(false);
                    e.target.value = null; // reset input
                  }
                }} disabled={isUploading} />
              </div>
              {isUploading && <div className="text-center"><CSpinner size="sm"/> Uploading...</div>}
              
              <CButton color="secondary" variant="ghost" size="sm" className="mt-auto" onClick={() => downloadTemplate('historicalLoans', 'Historical_Loans')}>
                <CIcon icon={cilDescription} className="me-2" /> Template
              </CButton>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </>
  )
}

export default UpdateData
