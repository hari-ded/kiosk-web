import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkJobStatus } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { Printer, CheckCircle2, XCircle, Home } from 'lucide-react';

const SUCCESS_STATES = ['printed', 'completed', 'complete', 'success', 'done', 'finished'];
const FAILURE_STATES = ['failed', 'failure', 'error', 'errored', 'aborted', 'cancelled', 'canceled'];

function readStoredJob() {
  try {
    const raw = sessionStorage.getItem('arox_current_job');
    return raw ? (JSON.parse(raw) as PrintJob) : undefined;
  } catch {
    return undefined;
  }
}

export function Status() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = (location.state?.job as PrintJob | undefined) || readStoredJob();

  const [status, setStatus] = useState<'processing' | 'printing' | 'completed' | 'failed'>('processing');
  const [progress, setProgress] = useState(0);

  const mountedRef = useRef(true);
  const statusRef = useRef(status);
  const pollTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const completionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!job) {
      navigate('/', { replace: true });
      return;
    }

    mountedRef.current = true;

    const clearTimers = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
    };

    const schedulePoll = (delay: number) => {
      if (!mountedRef.current) return;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = window.setTimeout(() => {
        void pollStatus();
      }, delay);
    };

    const pollStatus = async () => {
      try {
        const currentStatus = await checkJobStatus(job.id);
        const lowerStatus = currentStatus.toLowerCase();

        if (!mountedRef.current) return;

        if (SUCCESS_STATES.includes(lowerStatus)) {
          setStatus('completed');
          setProgress(100);
          clearTimers();
          completionTimeoutRef.current = window.setTimeout(() => {
            if (mountedRef.current) {
              navigate('/', { replace: true });
            }
          }, 5000);
          return;
        }

        if (FAILURE_STATES.includes(lowerStatus)) {
          setStatus('failed');
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return;
        }

        if (lowerStatus === 'printing') {
          setStatus('printing');
        } else {
          setStatus('processing');
        }

        schedulePoll(document.hidden ? 15000 : 3000);
      } catch {
        if (mountedRef.current) {
          schedulePoll(5000);
        }
      }
    };

    progressIntervalRef.current = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 90 || statusRef.current !== 'printing') return prev;
        return Math.min(90, prev + Math.floor(Math.random() * 10) + 5);
      });
    }, 1000);

    void pollStatus();

    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [job, navigate]);

  if (!job) {
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
      <div className="flex-1 flex flex-col items-center justify-center pb-16">
        {status === 'processing' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 rounded-full border-8 border-gray-200 border-t-rose-500 animate-spin"></div>
              <Printer size={48} className="relative z-10" />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Processing your job...
            </h2>
            <p className="text-2xl text-gray-600">
              Please wait while your document is being sent to the printer.
            </p>
          </div>
        )}

        {status === 'printing' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 rounded-full border-8 border-rose-200"></div>
              <div
                className="absolute inset-0 rounded-full border-8 border-rose-600 transition-all duration-500"
                style={{
                  clipPath: `inset(${100 - progress}% 0 0 0)`,
                  transition: 'clip-path 1s linear'
                }}
              ></div>
              <Printer size={64} className="animate-pulse relative z-10" />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Printing your job...
            </h2>
            <p className="text-2xl text-gray-600">
              Please wait while your document is being prepared.
            </p>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-8">
              <CheckCircle2 size={80} />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Print Complete!
            </h2>
            <p className="text-2xl text-gray-600 mb-12">
              Please collect your documents from the tray below.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full h-20 bg-green-600 text-white text-2xl font-bold rounded-xl shadow-md active:bg-green-700 flex items-center justify-center gap-4 transition-colors"
            >
              <Home size={32} />
              Return Home
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-8">
              <XCircle size={80} />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Printing Failed
            </h2>
            <p className="text-2xl text-gray-600 mb-12">
              There was a problem completing your print job. Please try again or request support.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full h-20 bg-red-600 text-white text-2xl font-bold rounded-xl shadow-md active:bg-red-700 flex items-center justify-center gap-4 transition-colors"
            >
              <Home size={32} />
              Return Home
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}