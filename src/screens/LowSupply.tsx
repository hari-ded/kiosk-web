import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchConsumables, sendAlert } from '../api';
import { Consumables } from '../types';
import { Layout } from '../components/Layout';
import { AlertTriangle, Home, MailWarning } from 'lucide-react';

export function LowSupply() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as any;

  const [consumables, setConsumables] = useState<Consumables | null>(state?.consumables || null);
  const [loading, setLoading] = useState(!state?.consumables);
  const [alertSent, setAlertSent] = useState(false);
  const [alertSending, setAlertSending] = useState(false);
  const [alertError, setAlertError] = useState(false);

  const source = state?.source || 'home';
  const requiredUnits = state?.requiredUnits;

  useEffect(() => {
    let mounted = true;
    if (!consumables) {
      fetchConsumables()
        .then(data => {
          if (mounted) {
            setConsumables(data);
            setLoading(false);
          }
        })
        .catch(() => {
          if (mounted) {
            // Error loading consumables, redirect to home to let error boundary or retry handle it
            navigate('/', { replace: true });
          }
        });
    }
    return () => { mounted = false; };
  }, [consumables, navigate]);

  if (loading || !consumables) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-16 h-16 border-8 border-gray-200 border-t-blue-600 rounded-full"></div>
        </div>
      </Layout>
    );
  }

  const isPaperLow = requiredUnits 
    ? consumables.paper_remaining < requiredUnits 
    : consumables.paper_remaining <= 0;
    
  const isTonerLow = requiredUnits 
    ? consumables.toner_remaining < requiredUnits 
    : consumables.toner_remaining <= 0;

  const handleSendAlert = async () => {
    if (alertSending || alertSent) return;
    setAlertSending(true);
    setAlertError(false);

    try {
      let type = 'general_low';
      if (isPaperLow && !isTonerLow) type = 'paper_low';
      if (!isPaperLow && isTonerLow) type = 'toner_low';

      const success = await sendAlert(
        type, 
        source, 
        state?.message || 'Supplies are running low.', 
        { 
          remaining_paper: consumables.paper_remaining, 
          remaining_toner: consumables.toner_remaining,
          required_units: requiredUnits
        }
      );

      if (success) {
        setAlertSent(true);
      } else {
        setAlertError(true);
      }
    } catch (e) {
      setAlertError(true);
    } finally {
      setAlertSending(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center max-w-4xl w-full mx-auto pb-16">
        
        <div className="w-32 h-32 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-8">
          <AlertTriangle size={80} />
        </div>
        
        <h2 className="text-4xl font-bold text-gray-900 mb-6 text-center">
          {source === 'print' ? 'Printing Paused' : 'Service Required'}
        </h2>
        
        <p className="text-2xl text-gray-600 mb-12 text-center max-w-2xl">
          {source === 'print' 
            ? 'Your print job requires more supplies than are currently available in the machine.' 
            : 'This kiosk is running low on supplies and needs to be serviced before printing.'}
        </p>

        <div className="grid grid-cols-2 gap-8 w-full max-w-2xl mb-12">
          <div className={`flex flex-col items-center p-6 border-2 rounded-2xl ${isPaperLow ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <span className="text-xl font-bold text-gray-700 mb-2">Paper Remaining</span>
            <span className={`text-4xl font-bold ${isPaperLow ? 'text-red-600' : 'text-gray-900'}`}>
              {consumables.paper_remaining}
            </span>
            <span className="text-gray-500 mt-2">/ {consumables.paper_capacity} max</span>
          </div>
          
          <div className={`flex flex-col items-center p-6 border-2 rounded-2xl ${isTonerLow ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <span className="text-xl font-bold text-gray-700 mb-2">Toner Remaining</span>
            <span className={`text-4xl font-bold ${isTonerLow ? 'text-red-600' : 'text-gray-900'}`}>
              {consumables.toner_remaining}
            </span>
            <span className="text-gray-500 mt-2">/ {consumables.toner_capacity} max</span>
          </div>
        </div>

        <div className="flex gap-6 w-full max-w-2xl">
          <button
            onClick={() => navigate('/')}
            className="flex-1 h-20 bg-white border-2 border-gray-200 text-gray-700 text-2xl font-bold rounded-xl shadow-sm active:bg-gray-50 flex items-center justify-center gap-3 transition-colors"
          >
            <Home size={32} />
            Return Home
          </button>
          
          <button
            onClick={handleSendAlert}
            disabled={alertSent || alertSending}
            className={`flex-1 h-20 text-white text-2xl font-bold rounded-xl shadow-md flex items-center justify-center gap-3 transition-colors ${
              alertSent ? 'bg-green-600' : 'bg-gradient-to-r from-rose-500 to-orange-500 border-0 active:opacity-80'
            }`}
          >
            {alertSending ? (
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : alertSent ? (
              <>Alert Sent</>
            ) : (
              <>
                <MailWarning size={32} />
                Notify Support
              </>
            )}
          </button>
        </div>

        {alertError && (
          <p className="mt-6 text-xl font-bold text-red-600">
            Failed to send alert. Please try again later.
          </p>
        )}

      </div>
    </Layout>
  );
}
