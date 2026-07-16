import { ReactNode } from 'react';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { HelpCircle, Clock3, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSupport } from '../contexts/SupportContext';

interface LayoutProps {
  children: ReactNode;
  disableInactivityWarning?: boolean;
}

export function Layout({ children, disableInactivityWarning = false }: LayoutProps) {
  const inactivity = useInactivityTimeout();
  const location = useLocation();
  const onHelp = useSupport();

  const showHelp = location.pathname !== '/agent' && onHelp;

  return (
    <div className="w-full h-full p-6 md:p-8 flex flex-col relative overflow-hidden kiosk-shell">
      <header className="h-16 flex items-center justify-end shrink-0 mb-6 md:mb-8">
        {showHelp && (
          <button
            type="button"
            onClick={onHelp}
            className="w-16 h-16 flex items-center justify-center rounded-full shadow-sm border focus:outline-none focus-visible:outline-none kiosk-muted-button"
          >
            <HelpCircle size={32} />
          </button>
        )}
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
                <ArrowRight size={24} />
                Yes, keep going
              </button>
              <button
                type="button"
                onClick={inactivity.goHome}
                className="h-16 px-10 rounded-xl text-xl font-bold shadow-sm flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-muted-button"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
