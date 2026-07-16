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
          <div className="animate-spin w-16 h-16 border-8 border-gray-200 border-t-sky-600 rounded-full"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-16 text-center max-w-2xl">
          How would you like to retrieve your print job?
        </h2>

        <div className="flex gap-8 w-full max-w-4xl">
          <button
            type="button"
            onClick={() => navigate('/scan')}
            className="flex-1 h-64 bg-gradient-to-br from-sky-50 to-cyan-50 border-2 border-sky-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 active:bg-sky-100 active:border-sky-300 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <div className="w-24 h-24 bg-gradient-to-br from-sky-500 to-cyan-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-sky-200">
              <QrCode size={48} strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-bold text-sky-900">Scan QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/code')}
            className="flex-1 h-64 bg-gradient-to-br from-rose-50 to-orange-50 border-2 border-rose-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 active:bg-rose-100 active:border-rose-300 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <div className="w-24 h-24 bg-gradient-to-br from-rose-500 to-orange-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
              <Keyboard size={48} strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-bold text-rose-900">Enter Code</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}