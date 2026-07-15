import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const INACTIVITY_TIMEOUT = 55000;

export function useInactivityTimeout() {
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Don't timeout on agent route or home route
    if (location.pathname === '/agent' || location.pathname === '/') {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        navigate('/');
      }, INACTIVITY_TIMEOUT);
    };

    resetTimer();

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [navigate, location.pathname]);
}
