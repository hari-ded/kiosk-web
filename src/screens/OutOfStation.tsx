import { Construction } from 'lucide-react';
import { Layout } from '../components/Layout';

export function OutOfStation() {
  return (
    <Layout disableInactivityWarning>
      <div className="flex-1 flex items-center justify-center p-6">
        <section role="status" className="w-full max-w-2xl rounded-3xl p-10 md:p-14 text-center kiosk-panel-strong">
          <div className="w-24 h-24 mx-auto mb-7 rounded-3xl flex items-center justify-center kiosk-circle-amber">
            <Construction size={48} />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold kiosk-heading">Kiosk out of station</h1>
          <p className="mt-5 text-xl md:text-2xl kiosk-copy">
            This kiosk is temporarily unavailable while maintenance is in progress. Please check back shortly.
          </p>
        </section>
      </div>
    </Layout>
  );
}
