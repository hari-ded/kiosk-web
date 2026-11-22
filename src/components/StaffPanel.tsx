import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, BatteryMedium, CheckCircle2, Delete, Droplet, FileStack, Loader2, Lock, Moon, Plus, RefreshCw, Settings, Smartphone, X } from 'lucide-react';
import { staffAction, staffUnlockEnd, staffUnlockStart, staffUnlockStatus, type StaffActionName, type StaffSnapshot } from '../api';
import { readSleepHours, saveSleepHours } from './SleepGuard';

declare global {
  interface Window {
    AroxTab?: { setSleeping?: (sleep: boolean) => void; reload?: () => void; openSettings?: () => void; battery?: () => number; version?: () => string; restartInfo?: () => string };
  }
}

const levelPercent = (remaining: number | null | undefined, capacity: number | null | undefined) =>
  remaining == null || !capacity ? null : Math.max(0, Math.min(100, Math.round((100 * remaining) / capacity)));

const NEW_CODE_EVERY_MS = 60_000; // codes live 90 s on the server
const POLL_EVERY_MS = 2_000;
const IDLE_LOCK_MS = 60_000;
const QUICK_SHEETS = [50, 100, 250, 500];

/**
 * Hidden staff panel (hold the AROX logo for 2 seconds). It shows a QR code;
 * a staff member scans it with their phone and approves in the admin panel.
 * Nothing is typed on the kiosk, so there is nothing to watch and reuse.
 */
export function StaffPanel({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [data, setData] = useState<StaffSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const [sheets, setSheets] = useState('');
  const [sleep, setSleep] = useState(readSleepHours());
  const secret = useRef<string | null>(null);
  const unlocked = !!data;

  const close = useCallback(() => {
    if (secret.current) void staffUnlockEnd(secret.current);
    secret.current = null;
    onClose();
  }, [onClose]);

  // ---- locked: show a fresh QR code and wait for a phone to approve it
  const codeRequest = useRef(0);
  const newCode = useCallback(async () => {
    // Each new code cancels the last one on the server, so only the newest reply counts.
    const mine = ++codeRequest.current;
    const started = await staffUnlockStart();
    if (mine !== codeRequest.current) return;
    if (!started.success || !started.poll_secret || !started.unlock_url) {
      setCodeError(started.error || 'Could not reach AROX. Check the internet connection.');
      return;
    }
    const image = await QRCode.toDataURL(started.unlock_url, { width: 560, margin: 1, errorCorrectionLevel: 'M' });
    if (mine !== codeRequest.current) return;
    secret.current = started.poll_secret;
    setCodeError(null);
    setQr(image);
  }, []);

  useEffect(() => {
    if (unlocked) return;
    void newCode();
    const refresh = window.setInterval(() => void newCode(), NEW_CODE_EVERY_MS);
    return () => window.clearInterval(refresh);
  }, [unlocked, newCode]);

  useEffect(() => {
    if (unlocked) return;
    let stopped = false;
    const poll = window.setInterval(async () => {
      if (!secret.current) return;
      const status = await staffUnlockStatus(secret.current);
      if (stopped) return;
      if (status.success && status.status === 'approved') setData(status);
      else if (status.success && status.status === 'expired') void newCode();
    }, POLL_EVERY_MS);
    return () => { stopped = true; window.clearInterval(poll); };
  }, [unlocked, newCode]);

  // ---- unlocked: lock again after a minute without a touch, and when closed
  useEffect(() => {
    let timer = window.setTimeout(close, unlocked ? IDLE_LOCK_MS : 2 * 60_000);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(close, unlocked ? IDLE_LOCK_MS : 2 * 60_000); };
    window.addEventListener('pointerdown', reset);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', reset); };
  }, [unlocked, close]);
  useEffect(() => () => { if (secret.current) void staffUnlockEnd(secret.current); }, []);

  const run = async (action: StaffActionName, done: string, extra: Record<string, unknown> = {}) => {
    if (!secret.current) return false;
    setBusy(action);
    const result = await staffAction(secret.current, action, extra);
    setBusy(null);
    if (result.success) { setData(result); setMessage(done || null); return true; }
    if (result.locked) { setData(null); setMessage(null); return false; }
    setMessage(result.error || 'That did not work.');
    return false;
  };

  const addPaper = async (count: number) => {
    if (await run('add_paper', `Added ${count} sheets.`, { sheets: count })) { setPaperOpen(false); setSheets(''); }
  };

  const battery = window.AroxTab?.battery?.();
  const kiosk = data?.kiosk;
  const paper = levelPercent(kiosk?.paper_remaining, kiosk?.paper_capacity);
  const toner = levelPercent(kiosk?.toner_remaining, kiosk?.toner_capacity);
  const sheetCount = Number(sheets || 0);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 kiosk-overlay kiosk-blur">
      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-3xl p-8 kiosk-panel-strong">
        <button type="button" onClick={close} aria-label="Close staff mode" className="absolute right-5 top-5 h-14 w-14 rounded-full flex items-center justify-center kiosk-muted-button"><X size={28} /></button>
        <div className="flex items-center gap-3 mb-6 pr-16">
          <Settings size={32} className="kiosk-heading" />
          <h2 className="text-3xl font-extrabold kiosk-heading">Staff mode</h2>
          {unlocked && data?.staff_name && <span className="ml-2 rounded-full bg-emerald-50 px-4 py-1.5 text-lg font-bold text-emerald-800">Unlocked by {data.staff_name}</span>}
        </div>

        {!unlocked ? (
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <p className="text-2xl font-bold kiosk-heading">Scan with your phone to unlock</p>
            <p className="mt-2 text-lg kiosk-copy">Open your phone camera, scan the code, and tap <b>Approve</b>. Only staff of this kiosk can unlock it.</p>
            <div className="mt-6 grid h-72 w-72 place-items-center rounded-3xl bg-white p-3 shadow-md ring-1 ring-slate-200">
              {qr && !codeError ? <img src={qr} alt="Staff unlock QR code" className="h-full w-full" /> : codeError ? <AlertTriangle size={56} className="kiosk-text-red" /> : <Loader2 size={48} className="animate-spin kiosk-copy" />}
            </div>
            {codeError
              ? <p role="alert" className="mt-5 text-xl font-bold kiosk-text-red">{codeError}</p>
              : <p className="mt-5 flex items-center gap-2 text-lg kiosk-copy"><Smartphone size={22} />Waiting for approval… the code changes every minute.</p>}
            {codeError && <button type="button" onClick={() => void newCode()} className="mt-4 h-14 rounded-2xl px-6 text-lg font-bold kiosk-muted-button">Try again</button>}
          </div>
        ) : (
          <div className="space-y-5">
            {message && <p role="status" className="rounded-2xl bg-emerald-50 px-5 py-3 text-xl font-bold text-emerald-800">{message}</p>}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Paper', value: paper == null ? '—' : `${paper}%`, sub: kiosk?.paper_remaining != null ? `${kiosk.paper_remaining}${kiosk.paper_capacity ? ` of ${kiosk.paper_capacity}` : ''} sheets` : '', icon: FileStack, low: paper != null && paper < 15 },
                { label: 'Toner', value: toner == null ? '—' : `${toner}%`, sub: '', icon: Droplet, low: toner != null && toner < 15 },
                { label: 'Printed today', value: String(data.today?.printed ?? 0), sub: `${data.today?.pages ?? 0} pages · ${data.today?.failed ?? 0} failed`, icon: CheckCircle2, low: false },
                { label: 'Tablet battery', value: battery != null && battery >= 0 ? `${battery}%` : '—', sub: window.AroxTab?.version ? `AROX Tab ${window.AroxTab.version()}` : 'Browser', icon: BatteryMedium, low: battery != null && battery >= 0 && battery < 20 },
              ].map((card) => (
                <div key={card.label} className={`rounded-2xl p-4 kiosk-panel ${card.low ? 'ring-4 ring-red-300' : ''}`}>
                  <card.icon size={26} className={card.low ? 'kiosk-text-red' : 'kiosk-heading'} />
                  <p className="mt-2 text-sm font-bold uppercase tracking-wider kiosk-copy">{card.label}</p>
                  <p className="text-3xl font-extrabold kiosk-heading">{card.value}</p>
                  {card.sub && <p className="text-sm kiosk-copy">{card.sub}</p>}
                </div>
              ))}
            </div>

            {paperOpen ? (
              <div className="rounded-2xl p-5 kiosk-panel">
                <p className="text-xl font-bold kiosk-heading">How many sheets did you add?</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {QUICK_SHEETS.map((n) => (
                    <button key={n} type="button" onClick={() => setSheets(String(n))} className={`h-14 rounded-2xl px-6 text-xl font-bold ${sheetCount === n ? 'kiosk-primary-sky' : 'kiosk-muted-button'}`}>{n}</button>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-16 min-w-[10rem] rounded-2xl bg-white px-5 text-4xl font-extrabold leading-[4rem] text-slate-900 ring-2 ring-sky-300" aria-live="polite">{sheets || '0'}</div>
                  <span className="text-xl kiosk-copy">sheets</span>
                </div>
                <div className="mt-4 grid max-w-md grid-cols-3 gap-3">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button key={digit} type="button" onClick={() => setSheets((v) => (v === '0' ? digit : (v + digit).slice(0, 4)))} className="h-16 rounded-2xl text-3xl font-bold kiosk-muted-button">{digit}</button>
                  ))}
                  <button type="button" onClick={() => setSheets((v) => v.slice(0, -1))} aria-label="Delete digit" className="h-16 rounded-2xl flex items-center justify-center kiosk-muted-button"><Delete size={28} /></button>
                  <button type="button" onClick={() => setSheets((v) => (v ? (v + '0').slice(0, 4) : v))} className="h-16 rounded-2xl text-3xl font-bold kiosk-muted-button">0</button>
                  <button type="button" onClick={() => setSheets('')} className="h-16 rounded-2xl text-xl font-bold kiosk-muted-button">Clear</button>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" disabled={busy !== null || sheetCount < 1 || sheetCount > 5000} onClick={() => void addPaper(sheetCount)} className="h-16 rounded-2xl px-8 text-xl font-bold kiosk-primary-sky disabled:opacity-50">{busy === 'add_paper' ? <Loader2 className="mx-auto animate-spin" /> : `Add ${sheetCount || ''} sheets`}</button>
                  <button type="button" disabled={busy !== null} onClick={async () => { if (await run('refill_paper', 'Paper tray marked as full.')) setPaperOpen(false); }} className="h-16 rounded-2xl px-6 text-xl font-bold kiosk-muted-button disabled:opacity-50">Tray is full</button>
                  <button type="button" onClick={() => { setPaperOpen(false); setSheets(''); }} className="h-16 rounded-2xl px-6 text-xl font-bold kiosk-muted-button">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button type="button" disabled={busy !== null} onClick={() => { setMessage(null); setPaperOpen(true); }} className="h-20 rounded-2xl text-xl font-bold flex items-center justify-center gap-2 kiosk-primary-sky disabled:opacity-60"><Plus size={24} />I added paper</button>
                <button type="button" disabled={busy !== null} onClick={() => void run('refill_toner', 'Toner marked as new.')} className="h-20 rounded-2xl text-xl font-bold kiosk-muted-button disabled:opacity-60">{busy === 'refill_toner' ? <Loader2 className="mx-auto animate-spin" /> : 'I replaced the toner'}</button>
                <button type="button" disabled={busy !== null || !data.alerts?.length} onClick={() => void run('resolve_alerts', 'Alerts cleared.')} className="h-20 rounded-2xl text-xl font-bold kiosk-muted-button disabled:opacity-60">{busy === 'resolve_alerts' ? <Loader2 className="mx-auto animate-spin" /> : 'Fixed — clear alerts'}</button>
              </div>
            )}

            <div className="rounded-2xl p-5 kiosk-panel">
              <p className="mb-3 text-xl font-bold kiosk-heading">Open alerts</p>
              {data.alerts?.length ? (
                <ul className="space-y-2">
                  {data.alerts.map((alert) => (
                    <li key={alert.id} className="flex items-center gap-3 text-lg kiosk-copy"><AlertTriangle size={22} className={alert.severity === 'critical' ? 'kiosk-text-red' : 'text-amber-600'} />{alert.title}<span className="ml-auto text-sm">{new Date(alert.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></li>
                  ))}
                </ul>
              ) : <p className="text-lg kiosk-copy">No open alerts.</p>}
            </div>

            <div className="rounded-2xl p-5 kiosk-panel">
              <div className="flex flex-wrap items-center gap-4">
                <Moon size={26} className="kiosk-heading" />
                <p className="text-xl font-bold kiosk-heading">Screen sleep</p>
                <label className="flex items-center gap-2 text-lg kiosk-copy"><input type="checkbox" className="h-6 w-6" checked={sleep.enabled} onChange={(e) => setSleep({ ...sleep, enabled: e.target.checked })} />On</label>
                <label className="flex items-center gap-2 text-lg kiosk-copy">from <input type="time" value={sleep.start} onChange={(e) => setSleep({ ...sleep, start: e.target.value })} className="h-12 rounded-xl border px-3 text-lg" /></label>
                <label className="flex items-center gap-2 text-lg kiosk-copy">to <input type="time" value={sleep.end} onChange={(e) => setSleep({ ...sleep, end: e.target.value })} className="h-12 rounded-xl border px-3 text-lg" /></label>
                <button type="button" onClick={() => { saveSleepHours(sleep); setMessage('Sleep hours saved on this kiosk.'); }} className="h-12 rounded-xl px-5 text-lg font-bold kiosk-primary-sky">Save</button>
              </div>
              <p className="mt-2 kiosk-copy">The screen dims on the home screen during these hours and wakes when touched.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => window.location.reload()} className="h-16 rounded-2xl px-6 text-lg font-bold flex items-center gap-2 kiosk-muted-button"><RefreshCw size={22} />Reload kiosk</button>
              {window.AroxTab?.openSettings && <button type="button" onClick={() => window.AroxTab?.openSettings?.()} className="h-16 rounded-2xl px-6 text-lg font-bold flex items-center gap-2 kiosk-muted-button"><Settings size={22} />Tablet settings</button>}
              <button type="button" onClick={() => void run('refresh', '')} className="h-16 rounded-2xl px-6 text-lg font-bold flex items-center gap-2 kiosk-muted-button"><RefreshCw size={22} />Refresh</button>
              <button type="button" onClick={close} className="ml-auto h-16 rounded-2xl px-6 text-lg font-bold flex items-center gap-2 kiosk-muted-button"><Lock size={22} />Lock</button>
            </div>
            <p className="text-sm kiosk-copy">Staff mode locks itself after 1 minute without a touch. Every action is recorded with your name.</p>
          </div>
        )}
      </div>
    </div>
  );
}
