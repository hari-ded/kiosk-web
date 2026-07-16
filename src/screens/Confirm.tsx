import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchConsumables, requestOtp, verifyOtp, releaseJob, sendAlert } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { ArrowLeft, Delete, FileText, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { playSound } from '../utils/audio';

function readStoredJob() {
  try {
    const raw = sessionStorage.getItem('arox_current_job');
    return raw ? (JSON.parse(raw) as PrintJob) : undefined;
  } catch {
    return undefined;
  }
}

export function Confirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = (location.state?.job as PrintJob | undefined) || readStoredJob();

  const [otpMode, setOtpMode] = useState(false);
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
          <div className="animate-spin w-16 h-16 border-8 border-gray-200 border-t-rose-600 rounded-full"></div>
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

  const handlePadClick = (val: string) => {
    setError(null);
    if (otp.length < 6) {
      setOtp(prev => prev + val);
    }
  };

  const handleDelete = () => {
    setError(null);
    setOtp(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError(null);
    setOtp('');
  };

  const checkConsumablesAndPrint = async (onSuccess: () => Promise<void>) => {
    setLoading(true);
    setError(null);

    try {
      const consumables = await fetchConsumables();
      const required = Math.max(1, job.pages) * Math.max(1, job.copies);

      let alertType = '';
      let message = '';

      if (consumables.paper_remaining < required) {
        alertType = 'paper_low';
        message = 'Not enough paper to print this job.';
      } else if (consumables.toner_remaining < required) {
        alertType = 'toner_low';
        message = 'Not enough toner to print this job.';
      }

      if (alertType) {
        await sendAlert(alertType, 'print', message, { required_units: required, remaining_paper: consumables.paper_remaining, remaining_toner: consumables.toner_remaining });
        navigate('/low-supply', {
          state: {
            source: 'print',
            message,
            alertType,
            consumables,
            requiredUnits: required
          },
          replace: true
        });
        return;
      }

      await onSuccess();
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleInitialAction = async () => {
    await checkConsumablesAndPrint(async () => {
      if (job.email) {
        const success = await requestOtp(job.pickup_code);
        if (success) {
          setOtpMode(true);
          setLoading(false);
        } else {
          const releaseSuccess = await releaseJob(job.pickup_code);
          if (releaseSuccess) {
            navigate(`/status/${job.id}`, { state: { job } });
          } else {
            setError('Failed to release job.');
          }
          setLoading(false);
        }
      } else {
        const releaseSuccess = await releaseJob(job.pickup_code);
        if (releaseSuccess) {
          navigate(`/status/${job.id}`, { state: { job } });
        } else {
          setError('Failed to release job.');
        }
        setLoading(false);
      }
    });
  };

  const handleVerifyOtpAndPrint = async () => {
    if (otp.length !== 6) return;

    await checkConsumablesAndPrint(async () => {
      const valid = await verifyOtp(job.pickup_code, otp);
      if (valid) {
        const releaseSuccess = await releaseJob(job.pickup_code);
        if (releaseSuccess) {
          navigate(`/status/${job.id}`, { state: { job } });
        } else {
          setError('OTP verified, but printing failed to start.');
          setLoading(false);
        }
      } else {
        setError('Invalid OTP code. Please try again.');
        setLoading(false);
      }
    });
  };

  const detailTone = otpMode ? 'text-rose-600' : 'text-sky-600';
  const actionButtonTone = loading
    ? 'bg-gray-300 text-gray-500 border-gray-300'
    : 'bg-gradient-to-r from-rose-500 to-orange-500 border-rose-600 text-white shadow-lg shadow-rose-200 active:brightness-95 disabled:opacity-75 disabled:cursor-not-allowed';
  const actionLabel = job.email ? 'Confirm Details & Send Code' : 'Confirm Details & Print';

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto pb-8">
        <div className="flex items-center mb-8 relative">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-6 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <ArrowLeft size={28} />
            Cancel
          </button>
          <h2 className={`text-3xl font-bold w-full text-center ${detailTone}`}>
            {otpMode ? 'Verify Identity' : 'Confirm Print Job'}
          </h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="w-full bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md">
                <FileText size={32} />
              </div>
              <div className="flex flex-col">
                <h3 className="text-2xl font-bold text-gray-900 truncate max-w-lg">
                  {job.filename}
                </h3>
                <p className="text-gray-600 text-lg font-medium">
                  <span className="text-sky-600">{job.pages} Pages</span>
                  {'  -  '}
                  <span className="text-rose-500">{job.copies} Copies</span>
                  {'  -  '}
                  <span className={job.color ? 'text-emerald-600' : 'text-gray-700'}>{job.color ? 'Color' : 'Black & White'}</span>
                  {'  -  '}
                  <span className="text-amber-600">{job.pages * job.copies} Total</span>
                </p>
              </div>
            </div>
          </div>

          {!otpMode ? (
            <div className="w-full flex flex-col items-center mt-8">
              {error && (
                <div className="mb-6 text-xl font-bold text-red-600 flex items-center gap-3">
                  <ShieldCheck size={24} />
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleInitialAction}
                disabled={loading}
                className={`w-full max-w-2xl h-20 border-2 text-2xl font-bold rounded-xl shadow-md active:opacity-80 transition-all flex items-center justify-center gap-4 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-75 ${actionButtonTone}`}
              >
                {loading ? (
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    {job.email ? <Lock size={28} /> : <Sparkles size={28} />}
                    {actionLabel}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full flex gap-12 items-start justify-center mt-4">
              <div className="w-96 flex flex-col">
                <div className="mb-6">
                  <p className="text-xl text-sky-600 mb-2 font-medium">Code sent to:</p>
                  <p className="text-2xl font-bold text-gray-900">{maskEmail(job.email!)}</p>
                </div>

                <div className={`h-24 bg-white border-4 rounded-2xl flex items-center justify-center shadow-inner mb-4 transition-colors ${error ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
                  <span className="text-5xl font-mono font-bold tracking-[0.5em] ml-[0.25em] text-gray-900">
                    {otp.padEnd(6, '_')}
                  </span>
                </div>

                <div className="h-12 mb-4">
                  {error && (
                    <span className="text-xl font-bold text-red-600 flex items-center gap-2"><ShieldCheck size={20} />{error}</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleVerifyOtpAndPrint}
                  disabled={otp.length !== 6 || loading}
                  className={`h-16 w-full rounded-xl text-xl font-bold flex items-center justify-center gap-3 shadow-md border-2 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-75 ${actionButtonTone}`}
                >
                  {loading ? (
                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Verify & Print'
                  )}
                </button>
              </div>

              <div className="w-80 grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handlePadClick(num.toString())}
                    className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-rose-500 active:bg-gray-100 flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handlePadClick('0')}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-sky-600 active:bg-gray-100 flex items-center justify-center focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                >
                  <Delete size={36} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}