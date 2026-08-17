/**
 * InactivityTimer Component
 *
 * Renders a full-screen warning modal when the session is about to expire.
 * Connects with the useAutoLogout hook via callback props.
 */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CModal, CModalBody, CButton } from '@coreui/react';
import { useAutoLogout } from '../utils/useAutoLogout'

const InactivityTimer = () => {
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Load inactivity duration from settings (default 5 minutes)
  const savedMs = parseInt(localStorage.getItem('sacco_inactivity_timeout') || '300000', 10);

  const handleWarning = useCallback((remaining) => {
    setShowWarning(true);
    setCountdown(remaining);
  }, []);

  const handleReset = useCallback(() => {
    setShowWarning(false);
    setCountdown(30);
  }, []);

  const { doLogout } = useAutoLogout(navigate, savedMs, handleWarning, handleReset);

  const handleStayLoggedIn = () => {
    // Firing a mousemove event resets the timer via the event listener
    window.dispatchEvent(new MouseEvent('mousemove'));
  };

  return (
    <CModal
      visible={showWarning}
      alignment="center"
      backdrop="static"
      keyboard={false}
      size="sm"
    >
      <CModalBody className="text-center p-4">
        {/* Animated ring */}
        <div style={{
          width: 90, height: 90, borderRadius: '50%', margin: '0 auto 20px',
          background: countdown <= 10 ? '#fff0f0' : '#fff8e8',
          border: `6px solid ${countdown <= 10 ? '#dc3545' : '#f59e0b'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', fontWeight: 800,
          color: countdown <= 10 ? '#dc3545' : '#d97706',
          transition: 'all 0.5s ease',
          boxShadow: countdown <= 10
            ? '0 0 0 8px rgba(220,53,69,0.15)'
            : '0 0 0 8px rgba(245,158,11,0.15)'
        }}>
          {countdown}
        </div>
        <h5 className="fw-bold mb-2" style={{ color: '#1d2d3e' }}>Session Expiring Soon</h5>
        <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>
          You have been inactive for a while.<br />
          You will be automatically logged out in <strong style={{ color: countdown <= 10 ? '#dc3545' : '#d97706' }}>{countdown} second{countdown !== 1 ? 's' : ''}</strong>.
        </p>
        <div className="d-flex gap-2 justify-content-center">
          <CButton
            color="primary"
            onClick={handleStayLoggedIn}
            className="px-4 fw-semibold"
          >
            ✅ Stay Logged In
          </CButton>
          <CButton
            color="danger"
            variant="outline"
            onClick={doLogout}
            className="px-4"
          >
            Logout Now
          </CButton>
        </div>
      </CModalBody>
    </CModal>
  );
};

export default InactivityTimer;
