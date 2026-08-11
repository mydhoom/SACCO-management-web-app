import React, { useState, useEffect } from 'react'
import {
  CCard, CCardHeader, CCardBody, CRow, CCol,
  CFormLabel, CFormRange, CAlert, CButton, CFormCheck,
  CForm, CFormSelect, CSpinner 
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCalculator, cilWarning, cilCheckCircle, cilInfo, cilBan, cilMoney, cilPrint, cilCloudDownload } from '@coreui/icons'
import { generatePDF } from '../../utils/pdfGenerator'

const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:5000';
const LoanCalculator = () => {
  
  // 1. LIVE Member Data State
  const [memberData, setMemberData] = useState({
    currentShareMoney: 0,
    activeLoansOutstanding: 0,
    monthsToRetirement: 36, // Default fallback
    rdBalance: 0
  })
  const [isDataLoading, setIsDataLoading] = useState(true)
 
  // 2. Core Constraints 
  const maxLeverageMultiplier = 10
  const absoluteMaxTenure = 36
  const absoluteMaxLoanCap = 400000 
  
  // DYNAMIC CONSTRAINT: Never exceed the true months remaining to retirement!
  const allowedMaxTenure = Math.min(absoluteMaxTenure, memberData.monthsToRetirement)

  // 3. Dynamic State
  const [requestedLoan, setRequestedLoan] = useState(50000)
  const [calcMode, setCalcMode] = useState('BY_TENURE') 
   // --- SCHEDULE PREVIEW STATE ---
  const [previewSchedule, setPreviewSchedule] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);
  
  const [requestedTenure, setRequestedTenure] = useState(24)
  const [targetEMI, setTargetEMI] = useState(2500)
  
  const [shortfall, setShortfall] = useState(0)
  const [estimatedEMI, setEstimatedEMI] = useState(0)
  const [calculatedTenure, setCalculatedTenure] = useState(0)
  
  const [tenureWarning, setTenureWarning] = useState(false)
  const [capWarning, setCapWarning] = useState(false)

  const [showApplication, setShowApplication] = useState(false)
  const [sharePaymentMethod, setSharePaymentMethod] = useState('DEDUCT_FROM_LOAN')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState(null)

  // --- FETCH LIVE MEMBER DATA ON LOAD ---
  useEffect(() => {
    const fetchUserIdentity = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
      if (!token) {
        setIsDataLoading(false);
        return;
      }

      try {
        // Fetch the profile securely using the token
        const response = await fetch(`${apiBase}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          const user = data.user || data;
          
          if (user.vendorNo) {
            // Save it to local storage so the rest of your calculator can use it
            localStorage.setItem('vendorNo', user.vendorNo);
            console.log("Vendor Number successfully retrieved:", user.vendorNo);
          }
          if (user._id || user.id) {
            localStorage.setItem('userId', user._id || user.id);
          }

          setMemberData({
            currentShareMoney: user.currentShareMoneyTotal || user.shareMoneyBalance || user.shareMoney || 0,
            activeLoansOutstanding: user.pendingLoanBalance || user.activeLoansOutstanding || user.loanBalance || 0,
            monthsToRetirement: user.monthsToRetirement || 36,
            rdBalance: user.rdBalance || user.currentRdBalance || 0
          });
        }
      } catch (error) {
        console.error("Failed to fetch user identity:", error);
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchUserIdentity();
  }, [apiBase]);

  // 4. Math Engine
  useEffect(() => {
    setShowApplication(false)
    setSubmitMessage(null)

    if (requestedLoan + memberData.activeLoansOutstanding > absoluteMaxLoanCap) {
      setCapWarning(true)
    } else {
      setCapWarning(false)
    }

    const theoreticalMaxLimit = memberData.currentShareMoney * maxLeverageMultiplier
    const availableCreditLimit = theoreticalMaxLimit - memberData.activeLoansOutstanding

    if (requestedLoan > availableCreditLimit) {
      setShortfall((requestedLoan - availableCreditLimit) / maxLeverageMultiplier)
    } else {
      setShortfall(0)
    }

    // --- TRUE AMORTIZATION VARIABLES ---
    const annualInterestRate = 10; // Change this if your society uses a different standard rate
    const monthlyRate = (annualInterestRate / 100) / 12;

    if (calcMode === 'BY_TENURE') {
      // Calculate true EMI based on Tenure
      let trueEmi = 0;
      if (monthlyRate > 0) {
        trueEmi = Math.round(
          (requestedLoan * monthlyRate * Math.pow(1 + monthlyRate, requestedTenure)) / 
          (Math.pow(1 + monthlyRate, requestedTenure) - 1)
        );
      } else {
        trueEmi = Math.round(requestedLoan / requestedTenure);
      }

      setEstimatedEMI(trueEmi)
      setCalculatedTenure(requestedTenure)
      
      if (requestedTenure > allowedMaxTenure) {
        setTenureWarning(true)
      } else {
        setTenureWarning(false)
      }
      
    } else if (calcMode === 'BY_EMI') {
      // Calculate true Tenure based on target EMI
      let rawMonths = 0;
      const minEmiToCoverInterest = requestedLoan * monthlyRate;

      // Safety Check: If the target EMI doesn't even cover the monthly interest, the loan will never be paid off!
      if (targetEMI <= minEmiToCoverInterest) {
         rawMonths = allowedMaxTenure + 99; // Artificially force a tenure warning
      } else {
         // Logarithmic formula to find required months for reducing balance
         rawMonths = Math.ceil(
           -Math.log(1 - (requestedLoan * monthlyRate) / targetEMI) / Math.log(1 + monthlyRate)
         );
      }

      setCalculatedTenure(rawMonths)
      setEstimatedEMI(targetEMI)
      
      if (rawMonths > allowedMaxTenure || targetEMI <= minEmiToCoverInterest) {
        setTenureWarning(true)
      } else {
        setTenureWarning(false)
      }
    }
  }, [requestedLoan, requestedTenure, targetEMI, calcMode, memberData, allowedMaxTenure])
  // --- 5. GENERATE PREVIEW SCHEDULE ---
  useEffect(() => {
    if (!requestedLoan || !calculatedTenure || !estimatedEMI) return;

    const annualInterestRate = 10; // Change if your society uses a different standard rate
    const monthlyRate = (annualInterestRate / 100) / 12;
    
    let balance = requestedLoan;
    let tempSchedule = [];
    let currentEmi = estimatedEMI;
    let startDate = new Date(); // Assumes the loan starts today for preview purposes

    for (let i = 1; i <= calculatedTenure; i++) {
      let expectedDate = new Date(startDate);
      expectedDate.setMonth(expectedDate.getMonth() + i);

      let interest = Math.round(balance * monthlyRate);
      let principal = currentEmi - interest;

      // Final month adjustment to perfectly zero out the balance
      if (i === calculatedTenure || principal > balance) {
        principal = balance;
        currentEmi = principal + interest;
      }

      balance -= principal;
      if (balance < 0) balance = 0;

      tempSchedule.push({
        month: i,
        date: expectedDate,
        emi: currentEmi,
        principal: principal,
        interest: interest,
        balance: balance
      });
    }
    setPreviewSchedule(tempSchedule);
  }, [requestedLoan, calculatedTenure, estimatedEMI]);

  const handleDownloadPDF = async () => {
    const columns = ['Month', 'Est. Date', 'EMI', 'Principal', 'Interest', 'Balance'];
    const data = previewSchedule.map(item => [
      item.month.toString(),
      item.date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      `Rs ${item.emi.toLocaleString('en-IN')}`,
      `Rs ${item.principal.toLocaleString('en-IN')}`,
      `Rs ${item.interest.toLocaleString('en-IN')}`,
      `Rs ${item.balance.toLocaleString('en-IN')}`
    ]);

    await generatePDF({
      title: 'Estimated Amortization Schedule',
      subtitle: `Requested Loan: Rs ${requestedLoan.toLocaleString('en-IN')} | Tenure: ${calculatedTenure} Months`,
      filename: `Amortization_Schedule_${requestedLoan}_${calculatedTenure}M.pdf`,
      columns,
      data,
      summaryData: [
        `Estimated Monthly EMI: Rs ${estimatedEMI.toLocaleString('en-IN')}`,
        `Total Interest Payable: Rs ${previewSchedule.reduce((sum, item) => sum + item.interest, 0).toLocaleString('en-IN')}`
      ]
    });
  };

  // 6. Submit Handler
  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    
    const vendorNo = localStorage.getItem('vendorNo');
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
    
    if (!vendorNo) {
      alert("Error: Vendor Number missing. Please log out and log back in.");
      return; // Stops the function and prevents the 500 Server Crash
    }

    if (sharePaymentMethod === 'RD_BALANCE' && shortfall > memberData.rdBalance) {
      setSubmitMessage({ 
        type: 'danger', 
        text: `Error: Your RD Balance (₹${memberData.rdBalance.toLocaleString()}) is insufficient to cover the shortfall (₹${Math.ceil(shortfall).toLocaleString()}).` 
      });
      return;
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${apiBase}/api/loans/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Safe token is now defined
        },
        body: JSON.stringify({
          vendorNo: vendorNo,
          requestedAmount: requestedLoan,
          tenure: calculatedTenure,
          sharePaymentMethod: sharePaymentMethod,
          memberId: localStorage.getItem('userId'), 
          memberName: localStorage.getItem('userName') || 'System User' 
        })
      })
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }
      
      setSubmitMessage({ type: 'success', text: 'Loan application submitted successfully! It is now pending Admin approval.' })
      setShowApplication(false) 
    } catch (error) {
      console.error("Fetch error:", error)
      setSubmitMessage({ type: 'danger', text: error.message || 'Error submitting application. Please contact admin.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDataLoading) {
    return <div className="text-center mt-5"><CSpinner color="primary" /></div>
  }

  return (
    <>
      <CCard className="mb-4 shadow-sm border-top-primary border-top-3">
        <CCardHeader className="py-3">
          <h4 className="mb-0 d-flex align-items-center gap-2">
            <CIcon icon={cilCalculator} className="text-primary" size="lg" />
            Loan Eligibility & Application
          </h4>
        </CCardHeader>
        
        <CCardBody className="p-4">
          <CRow className="mb-4 text-center border rounded py-3 bg-light">
            <CCol md={4} className="border-end border-end-md">
              <div className="text-medium-emphasis small">Current Share Money</div>
              <div className="fs-5 fw-bold text-success">₹{memberData.currentShareMoney.toLocaleString('en-IN')}</div>
            </CCol>
            <CCol md={4} className="border-end border-end-md">
              <div className="text-medium-emphasis small">Active Loans Outstanding</div>
              <div className="fs-5 fw-bold text-danger">₹{memberData.activeLoansOutstanding.toLocaleString('en-IN')}</div>
            </CCol>
            <CCol md={4}>
              <div className="text-medium-emphasis small">Service Remaining</div>
              {memberData.monthsToRetirement <= 0 ? (
                <div className="fs-5 fw-bold text-danger">RETIRED</div>
              ) : (
                <div className="fs-5 fw-bold">{memberData.monthsToRetirement} Months</div>
              )}
            </CCol>
          </CRow>

          {submitMessage && (
            <CAlert color={submitMessage.type} dismissible onClose={() => setSubmitMessage(null)}>
              {submitMessage.text}
            </CAlert>
          )}

          <CRow>
            <CCol lg={7} className="pe-lg-4">
              <div className="mb-4">
                <CFormLabel className="fw-semibold d-flex justify-content-between">
                  <span>Requested Loan Amount</span>
                  <span className="text-primary fs-5">₹{Number(requestedLoan).toLocaleString('en-IN')}</span>
                </CFormLabel>
                <CFormRange min="10000" max="400000" step="5000" value={requestedLoan} onChange={(e) => setRequestedLoan(Number(e.target.value))} disabled={showApplication} />
              </div>

              <div className="mb-4">
                <CFormLabel className="fw-semibold d-block mb-3">How would you like to calculate?</CFormLabel>
                <div className="d-flex gap-4">
                  <CFormCheck type="radio" name="calcMode" id="byTenure" label="By Number of Months" checked={calcMode === 'BY_TENURE'} onChange={() => setCalcMode('BY_TENURE')} disabled={showApplication} />
                  <CFormCheck type="radio" name="calcMode" id="byEmi" label="By Target EMI Amount" checked={calcMode === 'BY_EMI'} onChange={() => setCalcMode('BY_EMI')} disabled={showApplication} />
                </div>
              </div>

              {calcMode === 'BY_TENURE' ? (
                <div className="mb-4">
                  <CFormLabel className="fw-semibold d-flex justify-content-between">
                    <span>Repayment Tenure (Months)</span>
                    <span className="text-primary fs-5">{requestedTenure} Months</span>
                  </CFormLabel>
                  <CFormRange min="6" max={allowedMaxTenure} step="1" value={requestedTenure > allowedMaxTenure ? allowedMaxTenure : requestedTenure} onChange={(e) => setRequestedTenure(Number(e.target.value))} disabled={showApplication || allowedMaxTenure <= 0} />
                </div>
              ) : (
                <div className="mb-4">
                  <CFormLabel className="fw-semibold d-flex justify-content-between">
                    <span>Target EMI</span>
                    <span className="text-primary fs-5">₹{Number(targetEMI).toLocaleString('en-IN')}</span>
                  </CFormLabel>
                  <CFormRange min="1000" max="50000" step="100" value={targetEMI} onChange={(e) => setTargetEMI(Number(e.target.value))} disabled={showApplication || allowedMaxTenure <= 0} />
                </div>
              )}
            </CCol>

            <CCol lg={5}>
              <div className="p-4 border rounded shadow-sm h-100 d-flex flex-column justify-content-center bg-white">
                <div className="text-center mb-3">
                  <div className="text-medium-emphasis mb-1">Estimated Monthly EMI</div>
                  <h1 className="display-5 text-primary mb-0">₹{estimatedEMI.toLocaleString('en-IN')}</h1>
                  <div className="fw-bold mt-2 text-medium-emphasis">Requires: {calculatedTenure} Months</div>
                </div>

                <hr />

                {/* DYNAMIC WARNINGS */}
                <div className="d-flex flex-column gap-2">
                  {memberData.monthsToRetirement <= 0 && (
                    <CAlert color="danger" className="d-flex align-items-start mb-0">
                      <CIcon icon={cilBan} className="me-2 mt-1" />
                      <div>
                        <strong>Ineligible for Loan</strong>
                        <div className="small mt-1">You have reached retirement and cannot take new loans.</div>
                      </div>
                    </CAlert>
                  )}

                  {capWarning && memberData.monthsToRetirement > 0 && (
                    <CAlert color="danger" className="d-flex align-items-start mb-0">
                      <CIcon icon={cilBan} className="me-2 mt-1" />
                      <div>
                        <strong>Society Limit Exceeded</strong>
                        <div className="small mt-1">Total loan limit is ₹4,00,000.</div>
                      </div>
                    </CAlert>
                  )}

                  {tenureWarning && !capWarning && memberData.monthsToRetirement > 0 && (
                    <CAlert color="danger" className="d-flex align-items-start mb-0">
                      <CIcon icon={cilWarning} className="me-2 mt-1" />
                      <div>
                        <strong>Tenure Limit Exceeded</strong>
                        <div className="small mt-1">Due to retirement rules, max allowed is {allowedMaxTenure} months.</div>
                      </div>
                    </CAlert>
                  )}

                  {shortfall > 0 && !capWarning && memberData.monthsToRetirement > 0 && (
                    <CAlert color="warning" className="d-flex align-items-start mb-0">
                      <CIcon icon={cilInfo} className="me-2 mt-1" />
                      <div>
                        <strong>Share Money Shortfall</strong>
                        <div className="small mt-1">
                          Short by: <strong>₹{Math.ceil(shortfall).toLocaleString('en-IN')}</strong>
                        </div>
                      </div>
                    </CAlert>
                  )} 
                  
                  {!capWarning && !tenureWarning && shortfall === 0 && !showApplication && memberData.monthsToRetirement > 0 && (
                    <CAlert color="success" className="d-flex align-items-center mb-0">
                      <CIcon icon={cilCheckCircle} className="me-2" size="xl"/>
                      <div>
                        <strong>Pre-Approved</strong>
                        <div className="small mt-1">Share Money covers this amount!</div>
                      </div>
                    </CAlert>
                  )}
                </div>
                
                {!showApplication ? (
                  <CButton 
                    color="primary" size="lg" className="mt-4 w-100 fw-bold" 
                    disabled={tenureWarning || capWarning || memberData.monthsToRetirement <= 0}
                    onClick={() => setShowApplication(true)}
                  >
                    Proceed to Apply
                  </CButton>
                ) : (
                  <CButton 
                    color="secondary" className="mt-3 w-100 text-white fw-bold shadow-sm" 
                    onClick={() => setShowApplication(false)}
                  >
                    Reset
                  </CButton>
                )}
              </div>
            </CCol>
          </CRow>
            <div className="mt-4 text-center border-top pt-3 d-flex justify-content-center gap-3">
              <CButton 
                color="info" 
                variant="ghost" 
                className="fw-bold" 
                onClick={() => setShowSchedule(!showSchedule)}
                disabled={previewSchedule.length === 0}
              >
                <CIcon icon={cilPrint} className="me-2"/>
                {showSchedule ? 'Hide Estimated Schedule' : 'View Estimated Repayment Schedule'}
              </CButton>
              
              <CButton 
                color="primary" 
                variant="outline"
                className="fw-bold" 
                onClick={handleDownloadPDF}
                disabled={previewSchedule.length === 0}
              >
                <CIcon icon={cilCloudDownload} className="me-2"/>
                Download PDF Schedule
              </CButton>
            </div>

            {showSchedule && previewSchedule.length > 0 && (
              <div className="mt-3 table-responsive border rounded shadow-sm animate__animated animate__fadeIn">
                <table className="table table-hover table-striped mb-0 text-center bg-white small">
                  <thead className="table-dark">
                    <tr>
                      <th>Month</th>
                      <th>Est. Date</th>
                      <th>EMI</th>
                      <th className="text-info">Principal</th>
                      <th className="text-danger">Interest</th>
                      <th className="text-warning">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSchedule.map((item) => (
                      <tr key={item.month}>
                        <td className="text-muted fw-bold">{item.month}</td>
                        <td>{item.date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                        <td className="fw-bold">₹{item.emi.toLocaleString('en-IN')}</td>
                        <td className="text-info fw-bold">₹{item.principal.toLocaleString('en-IN')}</td>
                        <td className="text-danger fw-bold">₹{item.interest.toLocaleString('en-IN')}</td>
                        <td className="text-warning fw-bold bg-light">₹{item.balance.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}  
          {showApplication && (
            <div className="mt-4 pt-4 border-top">
              <h5 className="mb-4 text-primary fw-bold">Finalize Your Application</h5>
              
              <CForm onSubmit={handleSubmitApplication}>
                
                {shortfall > 0 && (
                  <div className="p-3 mb-4 rounded bg-light border border-info">
                    <p className="fw-bold text-info mb-2">
                      <CIcon icon={cilInfo} className="me-2" />
                      Share Money Shortfall Detected
                    </p>
                    <CFormSelect value={sharePaymentMethod} onChange={(e) => setSharePaymentMethod(e.target.value)}>
                      <option value="DEDUCT_FROM_LOAN">Deduct from Loan</option>
                      <option value="UPFRONT_PAYMENT">I will pay upfront via Cash/UPI</option>
                      <option value="RD_BALANCE">Deduct from my RD Balance</option>
                    </CFormSelect>
                  </div>
                )}

                <div className="d-flex justify-content-end gap-3 mt-2">
                  <CButton 
                    color="success" className="text-white fw-bold px-5" type="submit" size="lg" disabled={isSubmitting}
                  >
                    {isSubmitting ? <CSpinner size="sm" /> : 'Confirm & Submit Application'}
                  </CButton>
                </div>
              </CForm>
            </div>
          )}
        </CCardBody>
      </CCard>
    </>
  )
}

export default LoanCalculator
