import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';

const SLEEP_KEY = 'arox_sleep_hours';
const IDLE_BEFORE_SLEEP_MS = 2 * 60 * 1000;

export type SleepHours = { enabled: boolean; start: string; end: string };

export function readSleepHours(): SleepHours {
  try {
    const saved = JSON.parse(localStorage.getItem(SLEEP_KEY) || 'null') as SleepHours | null;
    if (saved && typeof saved.start === 'string' && typeof saved.end === 'string') return saved;
  } catch { /* use the default */ }
  return { enabled: true, start: '22:00', end: '06:00' };
}

export function saveSleepHours(hours: SleepHours) {
  try { localStorage.setItem(SLEEP_KEY, JSON.stringify(hours)); } catch { /* private mode */ }
}

function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inSleepHours(hours: SleepHours, now = new Date()) {
  if (!hours.enabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(hours.start);
  const end = minutes(hours.end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Night sleep and the offline screen, for every page.
 * Sleep: only on the home screen, after 2 idle minutes, during the sleep hours.
 * In the AROX Tab app the tablet dims itself; in a browser a black cover is shown.
 * Any touch wakes the screen.
 */
export function SleepGuard() {
  const location = useLocation();
  const [asleep, setAsleep] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const lastTouchRef = useRef(Date.now());
  const homeRef = useRef(location.pathname === '/');
  homeRef.current = location.pathname === '/';

  useEffect(() => {
    const touch = () => { lastTouchRef.current = Date.now(); };
    const wake = () => { lastTouchRef.current = Date.now(); setAsleep(false); };
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('arox-tab-wake', wake);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const timer = window.setInterval(() => {
      const shouldSleep = homeRef.current && inSleepHours(readSleepHours()) && Date.now() - lastTouchRef.current > IDLE_BEFORE_SLEEP_MS;
      setAsleep((current) => (current === shouldSleep ? current : shouldSleep));
    }, 30_000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('arox-tab-wake', wake);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    window.AroxTab?.setSleeping?.(asleep);
  }, [asleep]);

  return (
    <>
      {asleep && !window.AroxTab?.setSleeping && (
        <button type="button" aria-label="Wake the kiosk" onClick={() => { lastTouchRef.current = Date.now(); setAsleep(false); }} className="fixed inset-0 z-[90] bg-black" />
      )}
      {!online && (
        <div role="alert" className="fixed inset-0 z-[80] flex items-center justify-center p-8 kiosk-offline-backdrop">
          <div className="w-full max-w-2xl rounded-[2rem] px-10 py-12 text-center flex flex-col items-center gap-6 kiosk-panel-strong">
            <div className="w-28 h-28 rounded-full flex items-center justify-center text-white kiosk-circle-amber"><WifiOff size={56} /></div>
            <h1 className="text-5xl font-extrabold kiosk-heading">This kiosk is offline</h1>
            <p className="text-2xl leading-relaxed kiosk-copy">It will start again by itself when the internet is back. Your files and payments are safe; try again in a few minutes.</p>
            <p className="flex items-center gap-3 text-xl font-semibold kiosk-copy">
              <span className="h-6 w-6 rounded-full border-4 border-slate-300 border-t-amber-500 animate-spin" aria-hidden="true" />
              Reconnecting…
            </p>
          </div>
        </div>
      )}
    </>
  );
}
