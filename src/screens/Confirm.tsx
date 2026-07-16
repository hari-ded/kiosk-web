import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchConsumables, requestOtp, verifyOtp, releaseJob, sendAlert } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { ArrowLeft, Delete, FileText, Lock } from 'lucide-react';

export function Confirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = location.state?.job as PrintJob | undefined;

  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestedRef = useRef(false);
  
  useEffect(() => {
    if (!job) {
      navigate('/', { replace: true });
    }
  }, [job, navigate]);

  useEffect(() => {
    if (job && job.email && !requestedRef.current) {
      requestedRef.current = true;
      handleInitialAction();
    }
  }, [job]);

  if (!job) return null;

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
    } catch (err) {
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
        } else {
          // fallback to direct print attempt if request fails? 
          // "If OTP request fails, the app falls back to the direct print release attempt."
          const releaseSuccess = await releaseJob(job.pickup_code);
          if (releaseSuccess) {
            navigate(`/status/${job.id}`, { state: { job } });
          } else {
            setError('Failed to release job.');
          }
        }
        setLoading(false);
      } else {
        const releaseSuccess = await releaseJob(job.pickup_code);
        if (releaseSuccess) {
          navigate(`/status/${job.id}`, { state: { job } });
        } else {
          setError('Failed to release job.');
          setLoading(false);
        }
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

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto pb-8">
        <div className="flex items-center mb-8 relative">
          <button
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-6 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft size={28} />
            Cancel
          </button>
          <h2 className="text-3xl font-bold text-gray-900 w-full text-center">
            {otpMode ? 'Verify Identity' : 'Confirm Print Job'}
          </h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="w-full bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 bg-rose-50 text-rose-600 rounded-full">
                <FileText size={32} />
              </div>
              <div className="flex flex-col">
                <h3 className="text-2xl font-bold text-gray-900 truncate max-w-lg">
                  {job.filename}
                </h3>
                <p className="text-gray-500 text-lg">
                  {job.pages} Pages - {job.copies} Copies - {job.color ? 'Color' : 'Black & White'} - {job.pages * job.copies} Total
                </p>
              </div>
            </div>
          </div>

          {!otpMode ? (
            <div className="w-full flex flex-col items-center mt-8">
              {error && (
                <div className="mb-6 text-xl font-bold text-red-600">
                  {error}
                </div>
              )}

              <button
                onClick={handleInitialAction}
                disabled={loading}
                className="w-full max-w-2xl h-20 bg-gradient-to-r from-rose-500 to-orange-500 border-0 text-white text-2xl font-bold rounded-xl shadow-md active:opacity-80 transition-colors flex items-center justify-center gap-4"
              >
                {loading ? (
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    {job.email ? <Lock size={28} /> : null}
                    {job.email ? 'Send Verification Code' : 'Print Now'}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full flex gap-12 items-start justify-center mt-4">
              <div className="w-96 flex flex-col">
                <div className="mb-6">
                  <p className="text-xl text-gray-600 mb-2">Code sent to:</p>
                  <p className="text-2xl font-bold text-gray-900">{maskEmail(job.email!)}</p>
                </div>

                <div className={`h-24 bg-white border-4 rounded-2xl flex items-center justify-center shadow-inner mb-4 transition-colors ${error ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
                  <span className="text-5xl font-mono font-bold tracking-[0.5em] ml-[0.25em] text-gray-900">
                    {otp.padEnd(6, '_')}
                  </span>
                </div>
                
                <div className="h-12 mb-4">
                  {error && (
                    <span className="text-xl font-bold text-red-600">{error}</span>
                  )}
                </div>

                <button
                  onClick={handleVerifyOtpAndPrint}
                  disabled={otp.length !== 6 || loading}
                  className={`h-16 w-full rounded-xl text-xl font-bold flex items-center justify-center shadow-md transition-opacity ${
                    otp.length === 6 && !loading 
                      ? 'bg-gradient-to-r from-rose-500 to-orange-500 border-0 text-white active:opacity-80' 
                      : 'bg-gray-300 text-gray-500 opacity-70'
                  }`}
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
                    onClick={() => handlePadClick(num.toString())}
                    className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100 flex items-center justify-center"
                >
                  Clear
                </button>
                <button
                  onClick={() => handlePadClick('0')}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-700 active:bg-gray-100 flex items-center justify-center"
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
