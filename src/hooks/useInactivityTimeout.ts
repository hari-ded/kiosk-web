import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const INACTIVITY_TIMEOUT_MS = 30000;
const WARNING_TIMEOUT_SECONDS = 10;

export function useInactivityTimeout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningSecondsRemaining, setWarningSecondsRemaining] = useState(WARNING_TIMEOUT_SECONDS);
  const idleTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const warningVisibleRef = useRef(false);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearWarningTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearIdleTimer();
    clearWarningTimers();
  }, [clearIdleTimer, clearWarningTimers]);

  const goHome = useCallback(() => {
    clearAllTimers();
    warningVisibleRef.current = false;
    setWarningVisible(false);
    navigate('/', { replace: true });
  }, [clearAllTimers, navigate]);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      warningVisibleRef.current = true;
      setWarningVisible(true);
      setWarningSecondsRemaining(WARNING_TIMEOUT_SECONDS);

      clearWarningTimers();
      warningTimerRef.current = window.setTimeout(() => {
        goHome();
      }, WARNING_TIMEOUT_SECONDS * 1000);

      countdownIntervalRef.current = window.setInterval(() => {
        setWarningSecondsRemaining((current) => Math.max(0, current - 1));
      }, 1000);
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearIdleTimer, clearWarningTimers, goHome]);

  const extendSession = useCallback(() => {
    warningVisibleRef.current = false;
    setWarningVisible(false);
    setWarningSecondsRemaining(WARNING_TIMEOUT_SECONDS);
    clearWarningTimers();
    startIdleTimer();
  }, [clearWarningTimers, startIdleTimer]);

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/agent') {
      warningVisibleRef.current = false;
      setWarningVisible(false);
      clearAllTimers();
      return;
    }

    startIdleTimer();

    const resetTimer = () => {
      if (warningVisibleRef.current) {
        extendSession();
        return;
      }

      startIdleTimer();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((event) => document.addEventListener(event, resetTimer));

    return () => {
      clearAllTimers();
      events.forEach((event) => document.removeEventListener(event, resetTimer));
    };
  }, [clearAllTimers, extendSession, location.pathname, startIdleTimer]);

  return {
    warningVisible,
    warningSecondsRemaining,
    extendSession,
    goHome,
  };
}