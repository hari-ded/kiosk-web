import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkJobProgress, sendFeedback, type JobProgress } from '../api';
import { clearQueue, queuePosition, takeNext } from '../utils/printQueue';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { Printer, CheckCircle2, XCircle, Home, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
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

// Why a print failed, in words for the customer.
const FAILURE_TEXT: Record<string, string> = {
  'media-jam': 'The paper jammed in the printer.',
  'media-empty': 'The printer ran out of paper.',
  'door-open': 'A printer cover was left open.',
  'toner-empty': 'The printer ran out of toner.',
  offline: 'The printer stopped responding.',
  'short-print': 'Not all of your pages came out.',
};

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function Status() {
  const navigate = useNavigate();
  const location = useLocation();
  // One stable job object: re-reading storage on every render would restart
  // the polling effect each time (e.g. after a kiosk reload).
  const job = useMemo(() => (location.state?.job as PrintJob | undefined) || readStoredJob(), [location.state]);

  const [status, setStatus] = useState<'processing' | 'printing' | 'completed' | 'failed'>('processing');
  const [progress, setProgress] = useState(0);
  // Real pages-out from the printer, when the printer can report them.
  const [live, setLive] = useState<JobProgress | null>(null);
  const realProgressRef = useRef(false);
  const [position] = useState(() => (job ? queuePosition(job.id) : null));
  const [nextFile, setNextFile] = useState<PrintJob | null>(null);
  const [feedback, setFeedback] = useState<'none' | 'up' | 'down' | 'sent'>('none');

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
      // With real pages-out from the printer the job is already finished;
      // otherwise keep pacing to the estimated print time.
      const remainingPrintTime = realProgressRef.current ? 1200 : Math.max(0, printDurationMs - (Date.now() - startedAt));
      completionDelayRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setProgress(100);
        setStatus('completed');
        // "Print all": go straight on to the next file in this order.
        const next = takeNext(job.id);
        if (next) {
          setNextFile(next);
          completionReturnRef.current = window.setTimeout(() => {
            if (!mountedRef.current) return;
            sessionStorage.setItem('arox_current_job', JSON.stringify(next));
            navigate('/confirm/' + next.id, { replace: true, state: { job: next, orderMode: true } });
          }, 3000);
          return;
        }
        completionReturnRef.current = window.setTimeout(() => {
          if (mountedRef.current) returnHome();
        }, 12000);
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
        clearQueue();
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
        const { status: currentStatus, progress: liveProgress } = await checkJobProgress(job.id);
        const lowerStatus = normalizeStatus(currentStatus);

        if (!mountedRef.current || completionScheduledRef.current) return;

        if (liveProgress) {
          setLive(liveProgress);
          if (liveProgress.pages_done !== null && liveProgress.pages_total) {
            realProgressRef.current = true;
            setProgress((current) => Math.max(current, Math.min(99, (liveProgress.pages_done! / liveProgress.pages_total!) * 100)));
          }
          if (['printing', 'attention', 'waiting'].includes(liveProgress.phase)) enterPrinting();
        }
        applyBackendStatus(lowerStatus);
        if (SUCCESS_STATES.includes(lowerStatus) || FAILURE_STATES.includes(lowerStatus)) return;
        // Poll quickly while paper is coming out so the count keeps up.
        const printingNow = statusRef.current === 'printing';
        schedulePoll(document.hidden ? 15000 : printingNow ? 2000 : realtimeConnectedRef.current ? 15000 : 3000);
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
      if (startedAt === null || statusRef.current !== 'printing' || realProgressRef.current) return;
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(99, (elapsed / printDurationMs) * 100));
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
            {position && <p className="mb-2 text-2xl font-bold kiosk-copy">File {position.index} of {position.total}</p>}
            <h2 className="text-4xl font-bold mb-4 kiosk-heading">
              {live && (live.phase === 'attention' || live.phase === 'waiting') ? 'Printing paused' : 'Printing your job...'}
            </h2>
            {live && (live.phase === 'attention' || live.phase === 'waiting') ? (
              <div className="flex items-start gap-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-6 py-5 text-left">
                <AlertTriangle size={40} className="shrink-0 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold text-amber-900">{live.alert_text || 'The printer needs attention. Staff have been notified.'}</p>
                  <p className="mt-1 text-xl text-amber-800">Your print continues by itself once it is fixed. Please wait here.</p>
                </div>
              </div>
            ) : (
              <p className="text-2xl kiosk-copy">
                {live?.pages_done != null && live.pages_total
                  ? live.pages_done >= live.pages_total
                    ? 'All pages are out. Finishing up…'
                    : `Page ${live.pages_done + 1} of ${live.pages_total} is printing.`
                  : 'Please wait while your document is being printed.'}
              </p>
            )}
            <div className="w-full max-w-md mt-10">
              <div
                className="h-4 w-full rounded-full overflow-hidden"
                style={{ background: '#e5e7eb', boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.12)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #e11d48 0%, #f97316 100%)',
                    transition: 'width 250ms linear'
                  }}
                ></div>
              </div>
              <div className="mt-3 text-xl font-semibold text-center kiosk-copy">
                {live?.pages_done != null && live.pages_total ? `${Math.min(live.pages_done, live.pages_total)} of ${live.pages_total} out` : `${Math.floor(progress)}%`}
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
              {nextFile ? `File ${position ? position.index : ''} done` : 'Print Complete!'}
            </h2>
            <p className="text-2xl text-gray-600 mb-8">
              {nextFile ? `Starting the next file: ${nextFile.filename}…` : 'Please collect your documents from the tray below.'}
            </p>
            {!nextFile && feedback !== 'sent' && (
              <div className="mb-8 w-full rounded-2xl p-5 kiosk-panel">
                <p className="mb-4 text-xl font-bold kiosk-heading">{feedback === 'down' ? 'Sorry! What went wrong?' : 'How was printing today?'}</p>
                {feedback === 'none' && (
                  <div className="flex justify-center gap-4">
                    <button type="button" onClick={() => { setFeedback('sent'); void sendFeedback(job.id, 1); }} aria-label="Good" className="h-20 w-32 rounded-2xl flex items-center justify-center kiosk-muted-button"><ThumbsUp size={40} className="kiosk-text-emerald" /></button>
                    <button type="button" onClick={() => setFeedback('down')} aria-label="Not good" className="h-20 w-32 rounded-2xl flex items-center justify-center kiosk-muted-button"><ThumbsDown size={40} className="kiosk-text-red" /></button>
                  </div>
                )}
                {feedback === 'down' && (
                  <div className="grid grid-cols-2 gap-3">
                    {[['quality', 'Print quality'], ['slow', 'Too slow'], ['hard_to_use', 'Hard to use'], ['paper', 'Paper problem']].map(([reason, label]) => (
                      <button key={reason} type="button" onClick={() => { setFeedback('sent'); void sendFeedback(job.id, -1, reason); }} className="h-16 rounded-2xl text-xl font-bold kiosk-muted-button">{label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!nextFile && feedback === 'sent' && <p className="mb-8 text-xl font-bold kiosk-text-emerald">Thank you for the feedback!</p>}
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
            <p className="text-2xl text-gray-600 mb-4">
              {(live?.alert && FAILURE_TEXT[live.alert]) || 'There was a problem completing your print job.'}
              {live?.alert === 'short-print' && live.pages_done != null && live.pages_total ? ` ${live.pages_done} of ${live.pages_total} came out.` : ''}
            </p>
            <p className="text-xl text-gray-600 mb-12">
              Your money is safe: print it again for free from your AROX history, or it will be refunded. Staff have been told.
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
