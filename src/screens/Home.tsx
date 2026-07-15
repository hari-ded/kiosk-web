import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConsumables } from '../api';
import { Layout } from '../components/Layout';
import { QrCode, Keyboard } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

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
        // If it fails, treat machine as ready
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
          <div className="animate-spin w-16 h-16 border-8 border-gray-200 border-t-blue-600 rounded-full"></div>
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
            onClick={() => navigate('/scan')}
            className="flex-1 h-64 bg-white border-2 border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 active:bg-gray-50 active:border-rose-300 transition-colors"
          >
            <div className="w-24 h-24 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
              <QrCode size={48} />
            </div>
            <span className="text-2xl font-bold text-gray-900">Scan QR Code</span>
          </button>
          
          <button
            onClick={() => navigate('/code')}
            className="flex-1 h-64 bg-white border-2 border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-6 active:bg-gray-50 active:border-rose-300 transition-colors"
          >
            <div className="w-24 h-24 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
              <Keyboard size={48} />
            </div>
            <span className="text-2xl font-bold text-gray-900">Enter Code</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}
