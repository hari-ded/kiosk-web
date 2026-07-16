import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchConsumables, requestOtp, releaseJob, sendAlert } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { ArrowLeft, ArrowUpDown, Clock3, Copy, FileText, Hash, Layers3, LayoutGrid, Lock, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { playSound } from '../utils/audio';
import { formatSeconds, summarizePrintJob } from '../utils/printJob';

function readStoredJob() {
  try {
    const raw = sessionStorage.getItem('arox_current_job');
    return raw ? (JSON.parse(raw) as PrintJob) : undefined;
  } catch {
    return undefined;
  }
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-2xl p-4 text-center kiosk-panel-strong">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center kiosk-circle-sky text-white">
        {icon}
      </div>
      <div className="text-sm font-bold uppercase tracking-[0.2em] kiosk-copy mb-1">{label}</div>
      <div className="text-lg font-bold kiosk-heading break-words text-center">{value}</div>
    </div>
  );
}

export function Confirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const job = (location.state?.job as PrintJob | undefined) || readStoredJob();

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

  const summary = summarizePrintJob(job);
  const colorLabel = job.color ? 'Color' : 'Black & White';
  const etaLabel = `~${formatSeconds(summary.totalWaitSeconds)}`;

  const handleInitialAction = async () => {
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
        await sendAlert(alertType, 'print', message, {
          required_units: required,
          remaining_paper: consumables.paper_remaining,
          remaining_toner: consumables.toner_remaining
        });
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

      if (job.email) {
        const success = await requestOtp(job.pickup_code);
        if (success) {
          navigate(`/otp/${job.id}`, { state: { job } });
          return;
        }

        const releaseSuccess = await releaseJob(job.pickup_code);
        if (releaseSuccess) {
          navigate(`/status/${job.id}`, { state: { job } });
          return;
        }

        setError('Failed to start code verification.');
        setLoading(false);
        return;
      }

      const releaseSuccess = await releaseJob(job.pickup_code);
      if (releaseSuccess) {
        navigate(`/status/${job.id}`, { state: { job } });
      } else {
        setError('Failed to release job.');
        setLoading(false);
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto pb-4">
        <div className="flex items-center mb-4 relative">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-8 flex items-center gap-3 rounded-xl shadow-sm text-xl font-bold focus:outline-none focus-visible:outline-none focus-visible:ring-0 kiosk-muted-button"
          >
            <ArrowLeft size={28} />
            Cancel
          </button>
          <h2 className="text-3xl font-bold w-full text-center kiosk-heading">
            Confirm Print Job
          </h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start gap-4 pt-1">
          <div className="w-full max-w-4xl mx-auto rounded-[2rem] p-5 md:p-6 text-center kiosk-panel-strong max-h-[calc(100vh-17rem)] overflow-y-auto">
            <div className="flex flex-col items-center justify-center gap-2 mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-md kiosk-circle-rose">
                <FileText size={32} />
              </div>
              <h3 className="text-2xl font-bold kiosk-heading">{job.filename}</h3>
              <p className="text-lg font-medium kiosk-copy">Job {job.pickup_code}</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <StatCard icon={<FileText size={22} />} label="Filename" value={job.filename} />
              <StatCard icon={<Hash size={22} />} label="Pickup Code" value={job.pickup_code} />
              <StatCard icon={<ArrowUpDown size={22} />} label="Orientation" value={summary.orientation} />
              <StatCard icon={<LayoutGrid size={22} />} label="Pages / Sheet" value={`${summary.pagesPerSheet}`} />
              <StatCard icon={<RotateCw size={22} />} label="Duplex" value={summary.duplex ? 'Double-sided' : 'Single-sided'} />
              <StatCard icon={<Copy size={22} />} label="Copies" value={`${summary.copies}`} />
              <StatCard icon={<Layers3 size={22} />} label="Total Sheets" value={`${summary.totalSheets}`} />
              <StatCard icon={<Clock3 size={22} />} label="ETA" value={etaLabel} />
            </div>

            <div className="mt-3 text-base kiosk-copy">
              {colorLabel} printing • {formatSeconds(summary.printSeconds)} print time
            </div>
          </div>

          {error && (
            <div className="text-xl font-bold kiosk-text-red flex items-center gap-3 text-center">
              <ShieldCheck size={24} />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleInitialAction}
            disabled={loading}
            className={`w-full max-w-2xl h-20 border-2 text-2xl font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-4 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-75 ${loading ? 'kiosk-action-disabled' : 'kiosk-primary-rose'}`}
          >
            {loading ? (
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin kiosk-spinner-white"></div>
            ) : (
              <>
                {job.email ? <Lock size={28} /> : <Sparkles size={28} />}
                {job.email ? 'Confirm Details & Send Code' : 'Confirm Details & Print'}
              </>
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
}

