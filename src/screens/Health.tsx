import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { Layout } from '../components/Layout';

type CheckState = 'loading' | 'ok' | 'fail';

type CheckResult = {
  label: string;
  state: CheckState;
  detail: string;
};

const KIOSK_ID = import.meta.env.VITE_KIOSK_ID || '1';
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function normalizeApiBase(url: string) {
  const trimmed = String(url || '').trim().replace(/\/$/, '');
  if (!trimmed) return '/api';
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

async function probe(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-store',
      },
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 200),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function Health() {
  const [checks, setChecks] = useState<CheckResult[]>([
    { label: 'Vercel API health', state: 'loading', detail: 'Checking /api/health' },
    { label: `Kiosk consumables (${KIOSK_ID})`, state: 'loading', detail: 'Checking /api/kiosks/:id/consumables' },
  ]);
  const [lastRun, setLastRun] = useState<string>('');

  const runChecks = async () => {
    setChecks([
      { label: 'Vercel API health', state: 'loading', detail: 'Checking /api/health' },
      { label: `Kiosk consumables (${KIOSK_ID})`, state: 'loading', detail: 'Checking /api/kiosks/:id/consumables' },
    ]);

    const apiBase = normalizeApiBase(API_BASE);
    const [healthRes, consumablesRes] = await Promise.all([
      probe('/api/health'),
      probe(`${apiBase}/kiosks/${encodeURIComponent(KIOSK_ID)}/consumables`),
    ]);

    setChecks([
      {
        label: 'Vercel API health',
        state: healthRes.ok ? 'ok' : 'fail',
        detail: healthRes.ok
          ? `HTTP ${healthRes.status} from /api/health`
          : `HTTP ${healthRes.status} from /api/health${healthRes.body ? `: ${healthRes.body}` : ''}`,
      },
      {
        label: `Kiosk consumables (${KIOSK_ID})`,
        state: consumablesRes.ok ? 'ok' : 'fail',
        detail: consumablesRes.ok
          ? `HTTP ${consumablesRes.status} from ${apiBase}/kiosks/${KIOSK_ID}/consumables`
          : `HTTP ${consumablesRes.status} from ${apiBase}/kiosks/${KIOSK_ID}/consumables${consumablesRes.body ? `: ${consumablesRes.body}` : ''}`,
      },
    ]);

    setLastRun(new Date().toLocaleString());
  };

  useEffect(() => {
    void runChecks();
  }, []);

  return (
    <Layout disableInactivityWarning>
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-4xl rounded-[2rem] border shadow-xl overflow-hidden kiosk-panel">
          <div className="p-8 md:p-10 border-b bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white">
            <div className="flex items-center gap-3 mb-4 text-sky-300">
              <Server size={20} />
              <span className="text-sm font-semibold uppercase tracking-[0.24em]">Health Check</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-3">Kiosk deployment status</h1>
            <p className="text-lg md:text-xl text-slate-200 max-w-2xl">
              This page checks whether the deployed Vercel app can serve its own API routes and reach the kiosk consumables endpoint.
            </p>
          </div>

          <div className="p-8 md:p-10 grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border p-4 bg-slate-50">
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Browser API base</div>
                <div className="text-lg font-bold text-slate-900">{normalizeApiBase(API_BASE)}</div>
              </div>
              <div className="rounded-2xl border p-4 bg-slate-50">
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Kiosk ID</div>
                <div className="text-lg font-bold text-slate-900">{KIOSK_ID}</div>
              </div>
            </div>

            <div className="grid gap-3">
              {checks.map((check) => (
                <div key={check.label} className="rounded-2xl border p-5 flex items-start gap-4 bg-white">
                  <div className="mt-0.5">
                    {check.state === 'loading' && <RefreshCw size={22} className="animate-spin text-sky-600" />}
                    {check.state === 'ok' && <CheckCircle2 size={22} className="text-emerald-600" />}
                    {check.state === 'fail' && <XCircle size={22} className="text-rose-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-slate-900">{check.label}</div>
                    <div className="text-slate-600 break-words">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex gap-3 items-start">
              <ShieldAlert size={22} className="text-amber-700 mt-0.5 shrink-0" />
              <div className="text-amber-900">
                <div className="font-bold">What a 404 here means</div>
                <div className="mt-1">
                  If `/api/health` or `/api/kiosks/1/consumables` returns 404 on this page, Vercel is serving a stale or misrouted deployment before the backend is even reached.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => void runChecks()}
                className="h-14 px-6 rounded-xl text-white font-bold shadow-md kiosk-primary-sky flex items-center gap-3"
              >
                <RefreshCw size={18} />
                Re-run checks
              </button>
              <Link
                to="/"
                className="h-14 px-6 rounded-xl font-bold shadow-sm border flex items-center justify-center kiosk-muted-button"
              >
                Back home
              </Link>
            </div>

            {lastRun && <div className="text-sm text-slate-500">Last checked: {lastRun}</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
