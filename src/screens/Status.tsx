import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkJobStatus } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { Printer, CheckCircle2, XCircle, Home } from 'lucide-react';
import { playSound } from '../utils/audio';
import { createPrinterSocket, type PrinterSocket } from '../utils/printerTransport';
import { summarizePrintJob } from '../utils/printJob';

const SUCCESS_STATES = ['printed', 'completed', 'complete', 'success', 'done', 'finished'];
const FAILURE_STATES = ['failed', 'failure', 'error', 'errored', 'aborted', 'cancelled', 'canceled'];
const PRINTING_STATES = ['printing', 'onkiosk'];

function readStoredJob() {
  try {
    const raw = sessionStorage.getItem('arox_current_job');
    return raw ? (JSON.parse(raw) as PrintJob) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function Status() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = (location.state?.job as PrintJob | undefined) || readStoredJob();

  const [status, setStatus] = useState<'processing' | 'printing' | 'completed' | 'failed'>('processing');
  const [progress, setProgress] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const statusRef = useRef(status);
  const playedPrintingRef = useRef(false);
  const playedCompleteRef = useRef(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const completionDelayRef = useRef<number | null>(null);
  const completionReturnRef = useRef<number | null>(null);
  const completionScheduledRef = useRef(false);
  const realtimeConnectedRef = useRef(false);
  const jobRoomJoinedRef = useRef(false);
  const socketRef = useRef<PrinterSocket | null>(null);
  const printingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === 'printing' && !playedPrintingRef.current) {
      playedPrintingRef.current = true;
      playSound('printingWait', 0.8);
    }

    if (status === 'completed' && !playedCompleteRef.current) {
      playedCompleteRef.current = true;
      playSound('printComplete', 0.85);
    }
  }, [status]);

  useEffect(() => {
    if (!job) {
      if (sessionStorage.getItem('arox_pickup_order_code')) navigate('/files', { replace: true });
      else navigate('/', { replace: true });
      return;
    }

    if (!job.id || String(job.id).trim() === 'undefined') {
      sessionStorage.removeItem('arox_current_job');
      if (sessionStorage.getItem('arox_pickup_order_code')) navigate('/files', { replace: true });
      else navigate('/', { replace: true });
      return;
    }

    mountedRef.current = true;
    // The engine marks the job printed once the file is handed to the printer,
    // long before the paper comes out. Pace the printing screen to the real
    // printer: the clock starts when the printing screen first shows.
    const printDurationMs = summarizePrintJob(job).totalWaitSeconds * 1000;

    const enterPrinting = () => {
      if (printingStartedAtRef.current === null) {
        printingStartedAtRef.current = Date.now();
        setSecondsLeft(Math.ceil(printDurationMs / 1000));
      }
      setStatus('printing');
    };

    const clearTimers = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (completionDelayRef.current) {
        clearTimeout(completionDelayRef.current);
        completionDelayRef.current = null;
      }
      if (completionReturnRef.current) {
        clearTimeout(completionReturnRef.current);
        completionReturnRef.current = null;
      }
    };

    const returnHome = () => {
      sessionStorage.setItem('arox_returning_home_audio', 'thank_you');
      if (sessionStorage.getItem('arox_pickup_order_code')) navigate('/files', { replace: true });
      else navigate('/', { replace: true });
    };

    const schedulePoll = (delay: number) => {
      if (!mountedRef.current) return;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = window.setTimeout(() => {
        void pollStatus();
      }, delay);
    };

    const scheduleCompletion = () => {
      if (completionScheduledRef.current) return;
      completionScheduledRef.current = true;

      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }

      enterPrinting();
      const startedAt = printingStartedAtRef.current ?? Date.now();
      const remainingPrintTime = Math.max(0, printDurationMs - (Date.now() - startedAt));
      completionDelayRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setProgress(100);
        setSecondsLeft(0);
        setStatus('completed');
        completionReturnRef.current = window.setTimeout(() => {
          if (mountedRef.current) returnHome();
        }, 5000);
      }, remainingPrintTime);
    };

    const applyBackendStatus = (rawStatus: unknown) => {
      if (!mountedRef.current || completionScheduledRef.current) return;

      const lowerStatus = normalizeStatus(rawStatus);
      if (!lowerStatus) return;

      if (SUCCESS_STATES.includes(lowerStatus)) {
        scheduleCompletion();
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

      if (PRINTING_STATES.includes(lowerStatus)) {
        enterPrinting();
        return;
      }

      // Once printing has started, never fall back to the processing screen.
      if (printingStartedAtRef.current !== null) return;

      setStatus('processing');
    };

    const attachJobRoom = () => {
      const socket = socketRef.current;
      if (!socket || !socket.connected || jobRoomJoinedRef.current) {
        return;
      }

      socket.emit('printer:job-join', {
        upload_id: job.id,
        job_id: job.id,
      });
      jobRoomJoinedRef.current = true;
    };

    const connectRealtime = () => {
      const socket = createPrinterSocket();
      socketRef.current = socket;

      socket.on('connect', () => {
        realtimeConnectedRef.current = true;
        jobRoomJoinedRef.current = false;
        attachJobRoom();
      });

      socket.on('disconnect', () => {
        realtimeConnectedRef.current = false;
        jobRoomJoinedRef.current = false;
      });

      socket.on('printer:job-joined', payload => {
        if (String((payload as { upload_id?: string | number } | null | undefined)?.upload_id ?? '') !== String(job.id)) {
          return;
        }
        jobRoomJoinedRef.current = true;
      });

      socket.on('printer:job-status', payload => {
        const uploadId = String((payload as { upload_id?: string | number } | null | undefined)?.upload_id ?? '');
        if (uploadId !== String(job.id)) {
          return;
        }

        applyBackendStatus(
          (payload as { status?: string; job_status?: string; state?: string } | null | undefined)?.status
          ?? (payload as { status?: string; job_status?: string; state?: string } | null | undefined)?.job_status
          ?? (payload as { status?: string; job_status?: string; state?: string } | null | undefined)?.state
        );
      });

      socket.connect();
    };

    const pollStatus = async () => {
      try {
        const currentStatus = await checkJobStatus(job.id);
        const lowerStatus = normalizeStatus(currentStatus);

        if (!mountedRef.current || completionScheduledRef.current) return;

        applyBackendStatus(lowerStatus);
        if (SUCCESS_STATES.includes(lowerStatus) || FAILURE_STATES.includes(lowerStatus)) return;
        schedulePoll(realtimeConnectedRef.current ? (document.hidden ? 30000 : 15000) : (document.hidden ? 15000 : 3000));
      } catch {
        if (mountedRef.current && !completionScheduledRef.current) {
          schedulePoll(realtimeConnectedRef.current ? 10000 : 5000);
        }
      }
    };

    connectRealtime();
    void pollStatus();

    // Progress follows the paced print time; it holds at 99% until the
    // engine has also confirmed the job, then the completion timer sets 100%.
    progressIntervalRef.current = window.setInterval(() => {
      const startedAt = printingStartedAtRef.current;
      if (startedAt === null || statusRef.current !== 'printing') return;
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(99, (elapsed / printDurationMs) * 100));
      setSecondsLeft(Math.max(0, Math.ceil((printDurationMs - elapsed) / 1000)));
    }, 250);

    return () => {
      mountedRef.current = false;
      clearTimers();
      realtimeConnectedRef.current = false;
      jobRoomJoinedRef.current = false;
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [job, navigate]);

  if (!job) {
    return (
      <Layout disableInactivityWarning={status === 'processing' || status === 'printing'}>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-16 h-16 border-8 rounded-full kiosk-spinner-rose"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout disableInactivityWarning={status === 'processing' || status === 'printing'}>
      <div className="flex-1 flex flex-col items-center justify-center pb-16">
        {status === 'processing' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 text-white rounded-full flex items-center justify-center mb-8 relative shadow-lg kiosk-circle-sky">
              <div className="absolute inset-0 rounded-full border-8 animate-spin kiosk-ring-sky"></div>
              <Printer size={48} className="relative z-10" />
            </div>
            <h2 className="text-4xl font-bold mb-4 kiosk-heading">
              Processing your job...
            </h2>
            <p className="text-2xl kiosk-copy">
              Please wait while your document is being sent to the printer.
            </p>
          </div>
        )}

        {status === 'printing' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 text-white rounded-full flex items-center justify-center mb-8 relative shadow-lg kiosk-circle-rose">
              <div className="absolute inset-0 rounded-full border-8 animate-spin kiosk-ring-rose"></div>
              <Printer size={64} className="animate-pulse relative z-10" />
            </div>
            <h2 className="text-4xl font-bold mb-4 kiosk-heading">
              Printing your job...
            </h2>
            <p className="text-2xl kiosk-copy">
              Please wait while your document is being printed.
            </p>
            <div className="w-full max-w-md mt-10">
              <div className="h-4 w-full rounded-full overflow-hidden bg-rose-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #e11d48 0%, #f97316 100%)',
                    transition: 'width 250ms linear'
                  }}
                ></div>
              </div>
              <div className="flex justify-between mt-3 text-xl font-semibold kiosk-copy">
                <span>{Math.floor(progress)}%</span>
                {secondsLeft !== null && <span>{secondsLeft > 0 ? `About ${secondsLeft}s left` : 'Finishing up...'}</span>}
              </div>
            </div>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 text-white rounded-full flex items-center justify-center mb-8 shadow-lg kiosk-circle-emerald">
              <CheckCircle2 size={80} />
            </div>
            <h2 className="text-4xl font-bold mb-4 kiosk-heading">
              Print Complete!
            </h2>
            <p className="text-2xl text-gray-600 mb-12">
              Please collect your documents from the tray below.
            </p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('arox_returning_home_audio', 'thank_you');
                sessionStorage.getItem('arox_pickup_order_code') ? navigate('/files') : navigate('/');
              }}
              className="w-full h-20 text-white text-2xl font-bold rounded-xl shadow-md flex items-center justify-center gap-4 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-primary-emerald"
            >
              <Home size={32} />
              Return Home
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex flex-col items-center max-w-2xl text-center">
            <div className="w-32 h-32 text-white rounded-full flex items-center justify-center mb-8 shadow-lg kiosk-circle-red">
              <XCircle size={80} />
            </div>
            <h2 className="text-4xl font-bold mb-4 kiosk-heading">
              Printing Failed
            </h2>
            <p className="text-2xl text-gray-600 mb-12">
              There was a problem completing your print job. Please try again or request support.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full h-20 text-white text-2xl font-bold rounded-xl shadow-md flex items-center justify-center gap-4 transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-primary-red"
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
