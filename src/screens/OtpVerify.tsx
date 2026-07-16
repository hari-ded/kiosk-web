import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { releaseJob, verifyOtp } from '../api';
import { Layout } from '../components/Layout';
import { ArrowLeft, Delete, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { playSound } from '../utils/audio';
import { PrintJob } from '../types';

function readStoredJob() {
  try {
    const raw = sessionStorage.getItem('arox_current_job');
    return raw ? (JSON.parse(raw) as PrintJob) : undefined;
  } catch {
    return undefined;
  }
}

const buttonBase =
  'h-20 rounded-xl border-2 shadow-sm flex items-center justify-center transition-all select-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:scale-[0.98] kiosk-key';

export function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = (location.state?.job as PrintJob | undefined) || readStoredJob();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!job) {
      navigate('/', { replace: true });
    }
  }, [job, navigate]);

  useEffect(() => {
    const nextError = error;
    if (nextError && nextError !== previousErrorRef.current) {
      playSound('invalidCode', 0.8);
    }
    previousErrorRef.current = nextError;
  }, [error]);

  if (!job) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-16 h-16 border-8 rounded-full kiosk-spinner-rose"></div>
        </div>
      </Layout>
    );
  }

  const maskEmail = (email: string) => {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    if (user.length <= 3) return `***@${domain}`;
    return `${user.charAt(0)}***${user.slice(-2)}@${domain}`;
  };

  const handlePadClick = (value: string) => {
    if (loading) return;
    setError(null);
    if (otp.length < 6) {
      setOtp(prev => prev + value);
    }
  };

  const handleDelete = () => {
    if (loading) return;
    setError(null);
    setOtp(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    setError(null);
    setOtp('');
  };

  const handleVerify = async () => {
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    setError(null);

    try {
      const valid = await verifyOtp(job.pickup_code, otp);
      if (!valid) {
        setError('Invalid OTP code. Please try again.');
        setLoading(false);
        return;
      }

      const releaseSuccess = await releaseJob(job.pickup_code);
      if (releaseSuccess) {
        navigate(`/status/${job.id}`, { state: { job } });
      } else {
        setError('OTP verified, but printing failed to start.');
        setLoading(false);
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-6xl mx-auto pb-2 md:pb-6">
        <div className="w-full flex items-center justify-center mb-10 relative">
          <button
            type="button"
            onClick={() => navigate(`/confirm/${job.id}`, { state: { job } })}
            className="absolute left-0 h-16 px-8 flex items-center gap-3 rounded-xl shadow-sm text-xl font-bold focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-muted-button"
          >
            <ArrowLeft size={28} />
            Back
          </button>
          <h2 className="text-4xl md:text-5xl font-extrabold text-center tracking-tight kiosk-heading">
            Verify Identity
          </h2>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-[minmax(0,24rem)_minmax(0,24rem)] gap-12 items-start justify-center place-items-center">
          <div className="w-full max-w-[24rem] flex flex-col items-stretch">
            <div className="w-28 h-28 mx-auto mb-6 rounded-full flex items-center justify-center text-white kiosk-circle-sky shadow-lg">
              <Lock size={56} />
            </div>

            <div className="text-center mb-6">
              <p className="text-xl kiosk-text-sky mb-2 font-medium">Code sent to:</p>
              <p className="text-2xl font-bold kiosk-heading break-words">{maskEmail(job.email!)}</p>
            </div>

            <div className={`h-24 rounded-3xl flex items-center justify-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] mb-4 transition-colors kiosk-panel ${error ? 'kiosk-soft-red' : 'kiosk-input'}`}>
              <span className="text-5xl font-mono font-bold tracking-[0.5em] ml-[0.25em] kiosk-heading">
                {otp.padEnd(6, '_')}
              </span>
            </div>

            <div className="min-h-12 mb-4 text-center">
              {error && (
                <span className="text-xl font-bold kiosk-text-red inline-flex items-center gap-2 justify-center">
                  <ShieldCheck size={20} />
                  {error}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={otp.length !== 6 || loading}
              className={`h-16 w-full rounded-xl text-xl font-bold flex items-center justify-center gap-3 shadow-md border-2 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-75 ${loading ? 'kiosk-action-disabled' : 'kiosk-primary-rose'}`}
            >
              {loading ? (
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin kiosk-spinner-white"></div>
              ) : (
                <>
                  <Sparkles size={24} />
                  Verify & Print
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
            <button
              type="button"
              onClick={handleClear}
              className={`${buttonBase} text-xl font-bold kiosk-text-rose`}
            >
              Clear
            </button>
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
