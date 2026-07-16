import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateJobCode } from '../api';
import { Layout } from '../components/Layout';
import { ArrowLeft, Delete, Sparkles } from 'lucide-react';
import { playSound } from '../utils/audio';

const buttonBase =
  'h-20 rounded-xl border-2 shadow-sm flex items-center justify-center transition-all select-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:scale-[0.98] kiosk-key';

export function ManualCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const hasPlayedEnterRef = useRef(false);
  const previousErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasPlayedEnterRef.current) {
      hasPlayedEnterRef.current = true;
      playSound('enterPickupCode', 0.8);
    }
  }, []);

  useEffect(() => {
    const nextError = error;
    if (nextError && nextError !== previousErrorRef.current) {
      playSound('invalidCode', 0.8);
    }
    previousErrorRef.current = nextError;
  }, [error]);

  const handlePadClick = (val: string) => {
    if (validating) return;
    setError(null);
    if (code.length < 6) {
      setCode(prev => prev + val);
    }
  };

  const handleDelete = () => {
    if (validating) return;
    setError(null);
    setCode(prev => prev.slice(0, -1));
  };

  const handleConfirm = async () => {
    if (code.length !== 6 || validating) return;
    setValidating(true);
    setError(null);

    const result = await validateJobCode(code);

    if (result.job) {
      sessionStorage.setItem('arox_current_job', JSON.stringify(result.job));
      navigate(`/confirm/${result.job.id}`, { state: { job: result.job } });
    } else {
      setError(result.error || 'Invalid pickup code. Please try again.');
      setCode('');
      setValidating(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-7xl mx-auto pb-2 md:pb-6">
        <div className="w-full flex items-center justify-center mb-10 relative">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-8 flex items-center gap-3 rounded-xl shadow-sm text-xl font-bold focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-muted-button"
          >
            <ArrowLeft size={28} />
            Back
          </button>
          <h2 className="text-4xl md:text-5xl font-extrabold text-center tracking-tight kiosk-heading">
            Enter Pickup Code
          </h2>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-[minmax(0,24rem)_minmax(0,24rem)] gap-10 items-center justify-center place-items-center">
          <div className="w-full max-w-[24rem] flex flex-col items-stretch">
            <div className="flex items-end justify-center gap-3 mb-4">
              <span className="text-4xl md:text-5xl font-mono font-bold kiosk-heading leading-none pb-3">
                ARX-
              </span>
              <div className={`h-24 flex-1 rounded-3xl flex items-center justify-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition-colors kiosk-panel ${error ? 'kiosk-soft-red' : 'kiosk-input'}`}>
                <span className="text-4xl md:text-5xl font-mono font-bold tracking-[0.32em] pl-[0.32em] kiosk-heading">
                  {code.padEnd(6, '_')}
                </span>
              </div>
            </div>

            <div className="min-h-8 mb-8 text-center">
              {error ? (
                <span className="text-xl font-bold kiosk-text-red">{error}</span>
              ) : (
                <span className="text-xl kiosk-copy">Enter the 6-digit code from your email</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={code.length !== 6 || validating}
              className="h-16 w-full rounded-xl text-xl font-bold flex items-center justify-center gap-3 shadow-md border-2 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-75 kiosk-primary-rose"
            >
              {validating ? (
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin kiosk-spinner-white" />
              ) : (
                <>
                  <Sparkles size={24} />
                  Confirm Code
                </>
              )}
            </button>
          </div>

          <div className="w-full max-w-[24rem] grid grid-cols-3 gap-4 place-items-stretch">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handlePadClick(num.toString())}
                className={`${buttonBase} text-3xl font-extrabold kiosk-heading`}
              >
                {num}
              </button>
            ))}
            <div className="h-20" />
            <button
              type="button"
              onClick={() => handlePadClick('0')}
              className={`${buttonBase} text-3xl font-extrabold kiosk-heading`}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className={`${buttonBase} kiosk-copy`}
            >
              <Delete size={36} />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
