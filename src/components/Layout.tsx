import { ReactNode } from 'react';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { HelpCircle, Clock3, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSupport } from '../contexts/SupportContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const inactivity = useInactivityTimeout();
  const location = useLocation();
  const onHelp = useSupport();

  const showHelp = location.pathname !== '/agent' && onHelp;

  return (
    <div className="w-full h-full p-6 md:p-8 flex flex-col relative bg-gray-50 overflow-hidden">
      <header className="h-16 flex items-center justify-end shrink-0 mb-6 md:mb-8">
        {showHelp && (
          <button
            type="button"
            onClick={onHelp}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 active:bg-gray-100 focus:outline-none focus-visible:outline-none"
          >
            <HelpCircle size={32} />
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col relative min-h-0">
        {children}
      </main>

      {inactivity.warningVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-6">
          <div className="w-full max-w-2xl rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-900/20 p-8 md:p-10 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-200">
              <Clock3 size={40} />
            </div>
            <h3 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">
              Need more time?
            </h3>
            <p className="text-xl text-gray-600 mb-8">
              Returning to home in {inactivity.warningSecondsRemaining} seconds.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                type="button"
                onClick={inactivity.extendSession}
                className="h-16 px-8 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xl font-bold shadow-md shadow-sky-200 flex items-center justify-center gap-3 focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:brightness-95"
              >
                <ArrowRight size={24} />
                Yes, keep going
              </button>
              <button
                type="button"
                onClick={inactivity.goHome}
                className="h-16 px-8 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-xl font-bold shadow-sm flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:bg-gray-100"
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