import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, CreditCard, FileWarning, HelpCircle, Loader2, PrinterCheck, Ticket, X } from 'lucide-react';
import { sendHelpRequest } from '../api';

interface Props {
  onClose: () => void;
}

const PROBLEMS = [
  { id: 'paper_jam', label: 'Paper is stuck', icon: FileWarning },
  { id: 'not_printing', label: "My print didn't come out", icon: PrinterCheck },
  { id: 'print_quality', label: 'Printout looks wrong', icon: AlertCircle },
  { id: 'pickup_code', label: 'Pickup code / files not working', icon: Ticket },
  { id: 'payment', label: 'Payment problem', icon: CreditCard },
  { id: 'other', label: 'Something else', icon: HelpCircle },
] as const;

type Step = 'pick' | 'sending' | 'sent' | 'error';

/** "Need help?": the customer picks the problem and alerts the kiosk's staff. */
export function HelpAlert({ onClose }: Props) {
  const [problem, setProblem] = useState<string>('');
  const [step, setStep] = useState<Step>('pick');
  const closeTimer = useRef<number | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const send = async () => {
    if (!problem) return;
    setStep('sending');
    const pickupCode = sessionStorage.getItem('arox_pickup_order_code') || undefined;
    const ok = await sendHelpRequest(problem, pickupCode);
    if (!ok) { setStep('error'); return; }
    setStep('sent');
    closeTimer.current = window.setTimeout(onClose, 20000);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 kiosk-overlay kiosk-blur">
      <div className="rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col kiosk-panel-strong">
        <div className="h-20 border-0 px-8 flex items-center justify-between shrink-0 text-white kiosk-primary-rose">
          <h2 className="text-2xl font-bold flex items-center gap-3"><BellRing size={28} /> Need help?</h2>
          {step !== 'sending' && (
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors">
              <X size={32} />
            </button>
          )}
        </div>

        <div className="p-8 flex flex-col min-h-[420px]">
          {step === 'pick' && (
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold kiosk-heading mb-6 text-center">What's the problem?</h3>
              <div className="grid grid-cols-2 gap-4">
                {PROBLEMS.map(({ id, label, icon: Icon }) => {
                  const chosen = problem === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProblem(id)}
                      aria-pressed={chosen}
                      className={`h-24 rounded-2xl px-5 flex items-center gap-4 text-left text-xl font-bold border-4 transition-colors ${chosen ? 'border-rose-500 kiosk-soft-red' : 'border-transparent kiosk-muted-button'}`}
                    >
                      <Icon size={34} className={`shrink-0 ${chosen ? 'kiosk-text-red' : ''}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!problem}
                onClick={() => void send()}
                className="mt-8 h-20 w-full rounded-xl text-2xl font-bold text-white shadow-md flex items-center justify-center gap-3 kiosk-primary-rose disabled:opacity-40"
              >
                <BellRing size={30} />
                Send alert to staff
              </button>
            </div>
          )}

          {step === 'sending' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 size={64} className="text-rose-600 mb-6 animate-spin" />
              <h3 className="text-2xl font-bold kiosk-heading">Alerting staff…</h3>
            </div>
          )}

          {step === 'sent' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-28 h-28 rounded-full flex items-center justify-center mb-6 text-white shadow-lg kiosk-circle-emerald"><CheckCircle2 size={64} /></div>
              <h3 className="text-3xl font-bold kiosk-heading mb-3">Staff have been alerted</h3>
              <p className="text-xl kiosk-copy max-w-xl">Someone from the team is on the way. Please stay near the kiosk.</p>
              <button type="button" onClick={onClose} className="mt-10 h-16 px-12 rounded-xl text-xl font-bold kiosk-muted-button">OK</button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <AlertCircle size={64} className="kiosk-text-red mb-6" />
              <h3 className="text-2xl font-bold kiosk-heading mb-3">Couldn't send the alert</h3>
              <p className="text-xl kiosk-copy max-w-xl">Please check the internet connection and try again, or ask anyone nearby from the campus team.</p>
              <div className="mt-10 flex gap-4">
                <button type="button" onClick={onClose} className="h-16 px-10 rounded-xl text-xl font-bold kiosk-muted-button">Close</button>
                <button type="button" onClick={() => void send()} className="h-16 px-10 rounded-xl text-xl font-bold text-white kiosk-primary-rose">Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
