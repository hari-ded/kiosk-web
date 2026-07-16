import { ReactNode } from 'react';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { HelpCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSupport } from '../contexts/SupportContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  useInactivityTimeout();
  const location = useLocation();
  const onHelp = useSupport();

  const showHelp = location.pathname !== '/agent' && onHelp;

  return (
    <div className="w-full h-full p-6 md:p-8 flex flex-col relative bg-gray-50">
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
    </div>
  );
}
