import { useEffect, useState } from 'react';
import { AlertTriangle, BatteryMedium, CheckCircle2, Delete, Droplet, FileStack, Loader2, Moon, RefreshCw, Settings, X } from 'lucide-react';
import { staffAction, staffVerify, type StaffSnapshot } from '../api';
import { readSleepHours, saveSleepHours } from './SleepGuard';

declare global {
  interface Window {
    AroxTab?: { setSleeping?: (sleep: boolean) => void; reload?: () => void; openSettings?: () => void; battery?: () => number; version?: () => string; restartInfo?: () => string };
  }
}

const levelPercent = (remaining: number | null | undefined, capacity: number | null | undefined) =>
  remaining == null || !capacity ? null : Math.max(0, Math.min(100, Math.round((100 * remaining) / capacity)));

/** Hidden staff panel: hold the AROX logo for 3 seconds, then enter the kiosk staff PIN. */
export function StaffPanel({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [data, setData] = useState<StaffSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sleep, setSleep] = useState(readSleepHours());

  // Staff mode closes itself after 2 minutes so it is never left open for customers.
  useEffect(() => {
    let timer = window.setTimeout(onClose, 120_000);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(onClose, 120_000); };
    window.addEventListener('pointerdown', reset);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', reset); };
  }, [onClose]);

  const unlock = async () => {
    setBusy('verify');
    setMessage(null);
    const result = await staffVerify(pin);
    setBusy(null);
    if (result.success) setData(result);
    else { setPin(''); setMessage(result.error === 'Wrong PIN' ? 'Wrong PIN. Try again.' : result.error || 'Could not check the PIN.'); }
  };

  const run = async (action: 'refill_paper' | 'refill_toner' | 'resolve_alerts', done: string) => {
    setBusy(action);
    const result = await staffAction(pin, action);
    setBusy(null);
    if (result.success) { setData(result); setMessage(done); } else setMessage(result.error || 'That did not work.');
  };

  const battery = window.AroxTab?.battery?.();
  const kiosk = data?.kiosk;
  const paper = levelPercent(kiosk?.paper_remaining, kiosk?.paper_capacity);
  const toner = levelPercent(kiosk?.toner_remaining, kiosk?.toner_capacity);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 kiosk-overlay kiosk-blur">
      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-3xl p-8 kiosk-panel-strong">
        <button type="button" onClick={onClose} aria-label="Close staff mode" className="absolute right-5 top-5 h-14 w-14 rounded-full flex items-center justify-center kiosk-muted-button"><X size={28} /></button>
        <div className="flex items-center gap-3 mb-6">
          <Settings size={32} className="kiosk-heading" />
          <h2 className="text-3xl font-extrabold kiosk-heading">Staff mode</h2>
        </div>

        {!data ? (
          <div className="mx-auto max-w-sm text-center">
            <p className="text-xl kiosk-copy mb-4">Enter the kiosk staff PIN</p>
            <div className="mb-5 flex justify-center gap-3" aria-live="polite">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
                <span key={index} className={`h-5 w-5 rounded-full ${index < pin.length ? 'bg-slate-800' : 'bg-slate-200'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button key={digit} type="button" onClick={() => setPin((value) => (value + digit).slice(0, 12))} className="h-20 rounded-2xl text-3xl font-bold kiosk-muted-button">{digit}</button>
              ))}
              <button type="button" onClick={() => setPin((value) => value.slice(0, -1))} aria-label="Delete digit" className="h-20 rounded-2xl flex items-center justify-center kiosk-muted-button"><Delete size={30} /></button>
              <button type="button" onClick={() => setPin((value) => (value + '0').slice(0, 12))} className="h-20 rounded-2xl text-3xl font-bold kiosk-muted-button">0</button>
              <button type="button" onClick={() => void unlock()} disabled={pin.length < 4 || busy !== null} className="h-20 rounded-2xl text-2xl font-bold kiosk-primary-sky disabled:opacity-50">{busy ? <Loader2 className="mx-auto animate-spin" /> : 'OK'}</button>
            </div>
            {message && <p role="alert" className="mt-5 text-xl font-bold kiosk-text-red">{message}</p>}
          </div>
        ) : (
          <div className="space-y-5">
            {message && <p role="status" className="rounded-2xl bg-emerald-50 px-5 py-3 text-xl font-bold text-emerald-800">{message}</p>}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Paper', value: paper == null ? '—' : `${paper}%`, sub: kiosk?.paper_remaining != null ? `${kiosk.paper_remaining} sheets` : '', icon: FileStack, low: paper != null && paper < 15 },
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

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <button type="button" disabled={busy !== null} onClick={() => void run('refill_paper', 'Paper marked as full.')} className="h-20 rounded-2xl text-xl font-bold kiosk-primary-sky disabled:opacity-60">{busy === 'refill_paper' ? <Loader2 className="mx-auto animate-spin" /> : 'I refilled the paper'}</button>
              <button type="button" disabled={busy !== null} onClick={() => void run('refill_toner', 'Toner marked as new.')} className="h-20 rounded-2xl text-xl font-bold kiosk-muted-button disabled:opacity-60">{busy === 'refill_toner' ? <Loader2 className="mx-auto animate-spin" /> : 'I replaced the toner'}</button>
              <button type="button" disabled={busy !== null || !data.alerts?.length} onClick={() => void run('resolve_alerts', 'Alerts cleared.')} className="h-20 rounded-2xl text-xl font-bold kiosk-muted-button disabled:opacity-60">{busy === 'resolve_alerts' ? <Loader2 className="mx-auto animate-spin" /> : 'Fixed — clear alerts'}</button>
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
              <button type="button" onClick={async () => { setBusy('verify'); const result = await staffVerify(pin); setBusy(null); if (result.success) setData(result); }} className="h-16 rounded-2xl px-6 text-lg font-bold flex items-center gap-2 kiosk-muted-button"><RefreshCw size={22} />Refresh</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
