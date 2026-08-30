import { ReactNode } from 'react';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { HelpCircle, Clock3, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSupport } from '../contexts/SupportContext';
import aroxLogo from '../../assets/arox_logo.png';
import collegeLogo from '../../assets/kvell.jpeg';

interface LayoutProps {
  children: ReactNode;
  disableInactivityWarning?: boolean;
}

export function Layout({ children, disableInactivityWarning = false }: LayoutProps) {
  // Pause the timer itself, not just the warning overlay, while a job is live.
  const inactivity = useInactivityTimeout(!disableInactivityWarning);
  const location = useLocation();
  const onHelp = useSupport();

  const showHelp = location.pathname !== '/agent' && onHelp;

  return (
    <div className="w-full h-full p-4 md:p-6 flex flex-col relative overflow-hidden kiosk-shell">
      <header className="shrink-0 mb-4 md:mb-6 rounded-[1.75rem] border kiosk-header-shell px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="kiosk-brand-logo">
              <img src={aroxLogo} alt="Arox" className="w-full h-full object-contain" />
            </div>
            <div className="hidden md:flex flex-col leading-tight min-w-0">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-slate-500">
                Arox
              </span>
              <span className="text-lg font-extrabold kiosk-heading whitespace-nowrap">
                Print Kiosk
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center min-w-0 px-2 md:px-4">
            <span className="kiosk-campus-label">Campus Partner</span>
            <span className="mt-1 text-sm md:text-xl font-extrabold kiosk-heading whitespace-nowrap">
              Karpaga Vinayaga
            </span>
            <span className="text-[0.7rem] md:text-sm font-semibold uppercase tracking-[0.28em] text-slate-500 whitespace-nowrap">
              Deemed to be University
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 min-w-0 flex-1">
            <div className="kiosk-brand-logo">
              <img src={collegeLogo} alt="Karpaga Vinayaga College" className="w-full h-full object-contain" />
            </div>
            {showHelp && (
              <button
                type="button"
                onClick={onHelp}
                className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center rounded-full shadow-sm border focus:outline-none focus-visible:outline-none kiosk-muted-button"
                aria-label="Get help"
              >
                <HelpCircle size={32} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative min-h-0">
        {children}
      </main>

      {!disableInactivityWarning && inactivity.warningVisible && (
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
