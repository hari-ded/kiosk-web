import React, { ReactNode, useRef, useState } from 'react';
import { StaffPanel } from './StaffPanel';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { HelpCircle, Clock3, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSupport } from '../contexts/SupportContext';
import aroxLogo from '../../assets/arox_logo.png';
import collegeLogo from '../../assets/kvell.png';

interface LayoutProps {
  children: ReactNode;
  disableInactivityWarning?: boolean;
  hideInactivityWarning?: boolean;
}

// Adjust these sizes to make the logos bigger or smaller.
const AROX_LOGO_SIZE = 'h-[3.00rem] md:h-[3.00rem] lg:h-[4.00rem]';
const COLLEGE_LOGO_SIZE = 'h-[5.00rem] md:h-[5.00rem] lg:h-[6.00rem]';
const STAFF_HOLD_MS = 2000;

export function Layout({ children, disableInactivityWarning = false, hideInactivityWarning = false }: LayoutProps) {
  // Pause the timer itself, not just the warning overlay, while a job is live.
  const inactivity = useInactivityTimeout(!disableInactivityWarning, !hideInactivityWarning);
  const location = useLocation();
  const onHelp = useSupport();

  const showHelp = location.pathname !== '/agent' && onHelp;
  // Staff mode: press and hold the AROX logo for 2 seconds. The touch is
  // captured, scrolling is disabled on the logo, and small finger movement is
  // ignored, so a slightly shaky hold still counts. A ring fills while holding.
  const [staffOpen, setStaffOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const endHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
    setHolding(false);
  };
  const startHold = (event: React.PointerEvent<HTMLElement>) => {
    endHold();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* older WebView */ }
    holdStart.current = { x: event.clientX, y: event.clientY };
    setHolding(true);
    holdTimer.current = window.setTimeout(() => { endHold(); setStaffOpen(true); }, STAFF_HOLD_MS);
  };
  const moveHold = (event: React.PointerEvent<HTMLElement>) => {
    const start = holdStart.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 40) endHold();
  };

  return (
    <div className="w-full h-full p-4 md:p-6 flex flex-col relative overflow-hidden kiosk-shell">
      <header className="shrink-0 mb-4 md:mb-6 flex items-center justify-between gap-4 md:gap-6 px-1 md:px-2">
        <span
          className="relative -m-4 p-4 shrink-0 select-none"
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
          onPointerDown={startHold}
          onPointerMove={moveHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onContextMenu={(event) => event.preventDefault()}
        >
          <img
            src={aroxLogo}
            alt="Arox"
            draggable={false}
            className={`${AROX_LOGO_SIZE} w-auto object-contain drop-shadow-sm pointer-events-none`}
          />
          {holding && (
            <svg aria-hidden="true" className="absolute left-full -ml-2 top-1/2 -translate-y-1/2 h-9 w-9" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="white" fillOpacity="0.85" stroke="#cbd5e1" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round"
                strokeDasharray="94.25" strokeDashoffset="94.25" transform="rotate(-90 18 18)"
                style={{ animation: `kiosk-hold-fill ${STAFF_HOLD_MS}ms linear forwards` }}
              />
            </svg>
          )}
        </span>

        <img
          src={collegeLogo}
          alt="Karpaga Vinayaga College"
          className={`${COLLEGE_LOGO_SIZE} w-auto object-contain shrink-0 drop-shadow-sm`}
        />
      </header>

      <main className="flex-1 flex flex-col relative min-h-0">
        {children}
      </main>

      {showHelp && (
        <button
          type="button"
          onClick={onHelp}
          className="absolute right-5 bottom-5 md:right-6 md:bottom-6 h-16 md:h-[4.5rem] pl-5 pr-7 flex items-center gap-3 rounded-full shadow-md border text-xl md:text-2xl font-bold focus:outline-none focus-visible:outline-none kiosk-muted-button z-40"
          aria-label="Need help? Call support"
        >
          <HelpCircle size={34} />
          Need help?
        </button>
      )}

      {staffOpen && <StaffPanel onClose={() => setStaffOpen(false)} />}

      {!disableInactivityWarning && !hideInactivityWarning && inactivity.warningVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 kiosk-overlay kiosk-blur">
          <div className="w-full max-w-2xl rounded-3xl border p-8 md:p-10 text-center flex flex-col items-center kiosk-panel-strong">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full text-white flex items-center justify-center kiosk-circle-amber">
              <Clock3 size={40} />
            </div>
            <h3 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">
              Need more time?
            </h3>
            <p className="text-xl text-gray-600 mb-8">
              Returning to home in {inactivity.warningSecondsRemaining} seconds.
            </p>
            <div className="flex gap-6 justify-center">
              <button
                type="button"
                onClick={inactivity.extendSession}
                className="h-16 px-10 rounded-xl text-xl font-bold shadow-md flex items-center justify-center gap-3 focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-primary-sky"
              >
                &nbsp;&nbsp;&nbsp;<ArrowRight size={24} />&nbsp;&nbsp;Yes, keep going&nbsp;&nbsp;&nbsp;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

