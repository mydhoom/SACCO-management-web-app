import UPITransferGateway from '../../components/UPITransferGateway';
import React, { useState } from 'react';
import { CCard, CCardBody, CRow, CCol, CFormInput, CButton, CAlert, CSpinner } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilScreenSmartphone, cilCloudUpload, cilInfo } from '@coreui/icons';
import { QRCodeSVG } from 'qrcode.react'; // You may need to run: npm install qrcode.react

const UPITransferGateway = ({ amount, transactionType, referenceId, onPaymentComplete }) => {
  const [utrNumber, setUtrNumber] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // YOUR SOCIETY'S OFFICIAL UPI ID
  const SOCIETY_UPI_ID = "mahadevsociety@sbi"; // Update this!
  const SOCIETY_NAME = "Mahadev Nagar Society";

  const upiIntentUrl = `upi://pay?pa=${SOCIETY_UPI_ID}&pn=${encodeURIComponent(SOCIETY_NAME)}&am=${amount}&cu=INR&tn=${transactionType}-${referenceId}`;

  const handleSubmit = async () => {
    if (!utrNumber) return alert("Please enter the UTR/Reference Number");
    setIsSubmitting(true);
    
    // Pass the data back up to the parent component (MyPassbooks.jsx)
    // to handle the actual Cloudinary upload and backend API call
    await onPaymentComplete(utrNumber, receipt);
    setIsSubmitting(false);
  };

  return (
    <CCard className="shadow-sm border-top-primary border-top-3">
      <CCardBody className="p-4">
        <CRow className="g-4">
          
          {/* Left Column: QR Code */}
          <CCol md={6} className="text-center border-end">
            <h6 className="text-muted fw-bold text-uppercase mb-3">Scan & Pay (Zero Fees)</h6>
            <div className="d-inline-block bg-white p-3 border rounded shadow-sm mb-3">
              <QRCodeSVG value={upiIntentUrl} size={150} level="H" />
            </div>
            <h3 className="fw-bold text-dark mb-1">₹{Number(amount).toLocaleString('en-IN')}</h3>
            <p className="text-muted small">{transactionType} - {referenceId}</p>

            {/* Deep link for mobile users */}
            <CButton color="dark" className="w-100 fw-bold d-md-none mt-2" href={upiIntentUrl}>
              <CIcon icon={cilScreenSmartphone} className="me-2"/> Open UPI App
            </CButton>
          </CCol>

          {/* Right Column: UTR & Proof Upload */}
          <CCol md={6} className="d-flex flex-column justify-content-center">
            <CAlert color="info" className="d-flex align-items-start py-2 px-3 small">
              <CIcon icon={cilInfo} className="me-2 mt-1 shrink-0"/>
              After transferring, enter the 12-digit UPI Ref/UTR number below for Admin clearance.
            </CAlert>

            <div className="mb-3">
              <label className="form-label small fw-bold text-dark">UPI Ref / UTR Number *</label>
              <CFormInput 
                type="text" 
                placeholder="e.g. 319283746510"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                className="fw-bold"
              />
            </div>

            <div className="mb-4">
              <label className="form-label small fw-bold text-dark">Upload Screenshot (Optional)</label>
              <CFormInput 
                type="file" 
                accept="image/*,application/pdf"
                onChange={(e) => setReceipt(e.target.files[0])}
              />
            </div>

            <CButton 
              color="success" 
              className="w-100 fw-bold text-white shadow-sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !utrNumber}
            >
              {isSubmitting ? <><CSpinner size="sm" className="me-2"/>Processing...</> : <><CIcon icon={cilCloudUpload} className="me-2"/>Submit Payment Proof</>}
            </CButton>
          </CCol>

        </CRow>
      </CCardBody>
    </CCard>
  );
};

export default UPITransferGateway;