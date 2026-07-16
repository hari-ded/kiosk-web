import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConsumables } from '../api';
import { Layout } from '../components/Layout';
import { QrCode, Keyboard } from 'lucide-react';
import { playSound } from '../utils/audio';

export function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thankYouFlag = sessionStorage.getItem('arox_returning_home_audio');
    if (thankYouFlag === 'thank_you') {
      sessionStorage.removeItem('arox_returning_home_audio');
      playSound('thankYou', 0.8);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    fetchConsumables()
      .then((data) => {
        if (!mounted) return;
        if (data.paper_remaining <= 0 || data.toner_remaining <= 0) {
          navigate('/low-supply', {
            state: {
              source: 'home',
              consumables: data
            },
            replace: true
          });
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-16 h-16 border-8 rounded-full kiosk-spinner-sky"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="mb-5 text-center">
          <h2 className="text-3xl font-bold kiosk-heading">
            Print anything <span
              style={{
                backgroundImage: 'linear-gradient(90deg, #0284c7 0%, #facc15 33%, #f97316 66%, #ec4899 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              in seconds
            </span>
          </h2>
        </div>

        <h3 className="text-3xl font-bold mb-16 text-center max-w-2xl kiosk-heading">
          How would you like to retrieve your print job?
        </h3>

        <div className="flex gap-10 w-full max-w-4xl">
          <button
            type="button"
            onClick={() => navigate('/scan')}
            className="flex-1 h-64 border-2 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-panel kiosk-soft-sky"
          >
            <div className="w-24 h-24 text-white rounded-full flex items-center justify-center shadow-lg kiosk-circle-sky">
              <QrCode size={48} strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-bold kiosk-text-sky">Scan QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/code')}
            className="flex-1 h-64 border-2 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-panel kiosk-soft-rose"
          >
            <div className="w-24 h-24 text-white rounded-full flex items-center justify-center shadow-lg kiosk-circle-rose">
              <Keyboard size={48} strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-bold kiosk-text-rose">Enter Code</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}
