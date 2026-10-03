import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Home, Printer, RefreshCw } from 'lucide-react';
import { validateJobCode } from '../api';
import { PrintJob } from '../types';
import { Layout } from '../components/Layout';
import { getDisplayFilename } from '../utils/printJob';

function readStoredJobs(): PrintJob[] {
  try {
    const raw = sessionStorage.getItem('arox_pickup_jobs');
    return raw ? JSON.parse(raw) as PrintJob[] : [];
  } catch { return []; }
}

function statusLabel(status: string) {
  const value = status.toLowerCase();
  if (value === 'awaitingrelease') return 'Ready to print';
  if (['onkiosk', 'queued', 'printing', 'processing'].includes(value)) return 'Printing or in progress';
  if (['printed', 'done', 'completed'].includes(value)) return 'Printed';
  if (value === 'failed') return 'Print failed. Request a retry in the AROX app history.';
  return status || 'Unavailable';
}

export function OrderFiles() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PrintJob[]>(readStoredJobs());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = sessionStorage.getItem('arox_pickup_order_code') || jobs[0]?.pickup_code || '';

  const refresh = useCallback(async (silent = false) => {
    if (!code) { setError('Pickup order was not found. Please enter your code again.'); return; }
    if (!silent) setLoading(true);
    const result = await validateJobCode(code);
    if (!silent) setLoading(false);
    if (result.jobs?.length) {
      setJobs(result.jobs);
      sessionStorage.setItem('arox_pickup_jobs', JSON.stringify(result.jobs));
      sessionStorage.setItem('arox_pickup_order_code', code);
      setError(null);
    } else {
      setError(result.error || 'Unable to load files for this pickup code.');
    }
  }, [code]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selectJob = (job: PrintJob) => {
    if (job.status.toLowerCase() !== 'awaitingrelease') return;
    sessionStorage.setItem('arox_current_job', JSON.stringify(job));
    sessionStorage.setItem('arox_pickup_order_code', job.pickup_code);
    navigate('/confirm/' + job.id, { state: { job, orderMode: true } });
  };

  const hasReady = jobs.some(job => job.status.toLowerCase() === 'awaitingrelease');
  const hasActive = jobs.some(job => ['onkiosk', 'queued', 'printing', 'processing', 'downloading', 'validating', 'spooling'].includes(job.status.toLowerCase()));
  const hasFailed = jobs.some(job => job.status.toLowerCase() === 'failed');
  const allComplete = jobs.length > 0 && jobs.every(job => ['printed', 'done', 'completed'].includes(job.status.toLowerCase()));

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto pb-4">
        <div className="flex items-center mb-6 relative">
          <button type="button" onClick={() => navigate('/')} className="absolute left-0 h-14 px-6 flex items-center gap-2 rounded-xl kiosk-muted-button">
            <ArrowLeft size={22} /> Home
          </button>
          <h2 className="text-3xl font-bold w-full text-center kiosk-heading">Your print files</h2>
        </div>
        <div className="w-full rounded-3xl p-5 md:p-7 kiosk-panel-strong">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-sm uppercase tracking-widest kiosk-copy">Pickup code</p>
              <p className="text-2xl font-bold kiosk-heading">{code}</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="h-12 px-4 rounded-xl flex items-center gap-2 kiosk-muted-button disabled:opacity-60">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {error && <p role="alert" className="mb-4 text-lg font-semibold kiosk-text-red">{error}</p>}
          {loading && jobs.length === 0 ? (
            <div className="py-12 text-center kiosk-copy">Loading order files…</div>
          ) : jobs.length === 0 ? (
            <div className="py-10 text-center kiosk-copy">Enter your pickup code to load its files.</div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => {
                const ready = job.status.toLowerCase() === 'awaitingrelease';
                const active = ['onkiosk', 'queued', 'printing', 'processing'].includes(job.status.toLowerCase());
                return (
                  <div key={job.id} className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl p-4 kiosk-panel">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center kiosk-circle-sky text-white shrink-0"><FileText size={24} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-bold break-words kiosk-heading">{getDisplayFilename(job.filename)}</p>
                      <p className="kiosk-copy">{job.pages} pages · {job.copies} {job.copies === 1 ? 'copy' : 'copies'} · {job.color ? 'Color' : 'Black & White'}</p>
                      <p className="kiosk-copy">{job.orientation || 'Portrait'} · {job.duplex ? 'Double-sided' : 'Single-sided'} · {job.pages_per_sheet || 1} page(s) per sheet{job.paper_size ? ' · ' + job.paper_size : ''}{job.page_range ? ' · Pages ' + job.page_range : ''}</p>
                      <p className="text-sm font-semibold kiosk-copy">{statusLabel(job.status)}</p>
                    </div>
                    <button type="button" onClick={() => selectJob(job)} disabled={!ready} className={'h-14 px-6 rounded-xl flex items-center justify-center gap-2 font-bold text-lg ' + (ready ? 'kiosk-primary-rose' : 'kiosk-muted-button opacity-75')}>
                      {ready ? <><Printer size={20} /> Print this file</> : active ? 'In progress' : <><CheckCircle2 size={20} /> {statusLabel(job.status)}</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && hasFailed && (
            <div role="status" className="mt-6 rounded-2xl p-5 text-center kiosk-panel">
              <p className="text-lg font-bold kiosk-heading">A file needs attention</p>
              <p className="mt-2 kiosk-copy">Request its one-time retry from Print History in the AROX app, then refresh this screen and select that file.</p>
            </div>
          )}
          {!loading && allComplete && (
            <div className="mt-6 rounded-2xl p-5 text-center kiosk-panel">
              <CheckCircle2 size={32} className="mx-auto mb-2" />
              <p className="text-xl font-bold kiosk-heading">All files in this order are complete.</p>
              <button type="button" onClick={() => { sessionStorage.removeItem('arox_pickup_order_code'); sessionStorage.removeItem('arox_pickup_jobs'); sessionStorage.removeItem('arox_current_job'); navigate('/'); }} className="mt-4 h-14 px-6 rounded-xl inline-flex items-center gap-2 kiosk-primary-emerald"><Home size={20} /> Return Home</button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}