/**
 * useAutoLogout - Custom React Hook
 *
 * Automatically logs out the user after a configurable period of inactivity.
 * Tracks: mousemove, mousedown, keydown, touchstart, scroll, click.
 * Shows a 30-second countdown warning modal before logout.
 *
 * Usage: call useAutoLogout(navigate, timeoutMs) in DefaultLayout.
 */
import { useEffect, useRef, useCallback } from 'react';

const WARNING_SECONDS = 30; // Seconds of pre-logout warning

/**
 * @param {Function} navigate - react-router-dom navigate function
 * @param {number} timeoutMs - Inactivity timeout in milliseconds (default: 5 minutes)
 * @param {Function} onWarning - Callback to show warning modal (receives remaining seconds)
 * @param {Function} onReset - Callback to hide warning modal
 */
export const useAutoLogout = (navigate, timeoutMs = 5 * 60 * 1000, onWarning, onReset) => {
  const logoutTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const doLogout = useCallback(() => {
    clearTimeout(logoutTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownIntervalRef.current);

    localStorage.removeItem('adminToken');
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userAvatar');

    navigate('/login?reason=timeout', { replace: true });
  }, [navigate]);

  const resetTimers = useCallback(() => {
    clearTimeout(logoutTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownIntervalRef.current);

    if (onReset) onReset();

    const warningMs = timeoutMs - WARNING_SECONDS * 1000;

    // Schedule warning
    warningTimerRef.current = setTimeout(() => {
      let remaining = WARNING_SECONDS;
      if (onWarning) onWarning(remaining);

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (onWarning) onWarning(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current);
        }
      }, 1000);
    }, warningMs > 0 ? warningMs : 0);

    // Schedule logout
    logoutTimerRef.current = setTimeout(() => {
      doLogout();
    }, timeoutMs);
  }, [timeoutMs, doLogout, onWarning, onReset]);

  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
    if (!token) return; // Only track if logged in

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => resetTimers();

    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimers(); // Start the timer on mount

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearTimeout(logoutTimerRef.current);
      clearTimeout(warningTimerRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, [resetTimers]);

  return { doLogout };
};
