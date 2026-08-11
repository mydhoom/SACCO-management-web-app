import React, { useState } from 'react';
import { CCard, CCardBody, CFormInput, CButton, CFormSelect } from '@coreui/react';
import CIcon from '@coreui/icons-react';
import { cilSend, cilBank } from '@coreui/icons';

const AdminDisbursalAction = ({ memberName, approvedAmount, onDisburse }) => {
  const [transferMode, setTransferMode] = useState('CHEQUE');
  const [referenceNo, setReferenceNo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDisbursal = () => {
    if (!referenceNo) return alert("You must provide the Cheque Number or UPI UTR.");
    setIsProcessing(true);
    
    // Pass back to parent component to trigger the backend Ledger Double-Entry
    onDisburse({ transferMode, referenceNo });
    setIsProcessing(false);
  };

  return (
    <CCard className="shadow-sm border-top-danger border-top-3">
      <CCardBody className="p-4">
        <h5 className="fw-bold text-dark mb-2"><CIcon icon={cilBank} className="me-2"/>Execute Fund Transfer</h5>
        <p className="small text-muted mb-4">
          Transfer <strong>₹{Number(approvedAmount).toLocaleString('en-IN')}</strong> to {memberName} manually via Cheque or UPI, then record the reference below to update the Master Journal.
        </p>
        
        <div className="mb-3">
          <label className="form-label small fw-bold">Transfer Mode</label>
          <CFormSelect value={transferMode} onChange={(e) => setTransferMode(e.target.value)}>
            <option value="CHEQUE">Physical Cheque</option>
            <option value="UPI">Manual UPI Transfer</option>
          </CFormSelect>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-bold">
            {transferMode === 'CHEQUE' ? 'Cheque Number *' : 'Bank UTR / Ref Number *'}
          </label>
          <CFormInput 
            type="text" 
            placeholder={transferMode === 'CHEQUE' ? "e.g. 000123" : "e.g. 319283..."}
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            className="fw-bold font-monospace"
          />
        </div>

        <CButton 
          color="danger" 
          className="w-100 fw-bold text-white shadow-sm mt-2"
          onClick={handleDisbursal}
          disabled={isProcessing || !referenceNo}
        >
          <CIcon icon={cilSend} className="me-2"/>
          Record Disbursal & Update Ledger
        </CButton>
      </CCardBody>
    </CCard>
  );
};

export default AdminDisbursalAction;