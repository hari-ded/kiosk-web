import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchConsumables } from '../api';
import type { Consumables } from '../types';
import { Layout } from '../components/Layout';
import { ArrowRight, CreditCard, KeyRound, Printer, ScanLine, Smartphone } from 'lucide-react';
import { playSound } from '../utils/audio';
import appDownloadQr from '../../assets/qr-code.png';

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [supplies, setSupplies] = useState<Consumables | null>(null);
  const now = useClock();

  useEffect(() => {
    const thankYouFlag = sessionStorage.getItem('arox_returning_home_audio');
    if (thankYouFlag === 'thank_you') {
      sessionStorage.removeItem('arox_returning_home_audio');
      playSound('thankYou', 0.8);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchConsumables()
      .then((data) => {
        if (!mounted) return;
        if (data.paper_remaining <= 0 || data.toner_remaining <= 0) {
          navigate('/low-supply', {
            state: {
              source: 'home',
              consumables: data
            },
            replace: true
          });
        } else {
          setSupplies(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [location.key, navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-16 h-16 border-8 rounded-full kiosk-spinner-sky"></div>
        </div>
      </Layout>
    );
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const paperPercent = supplies && supplies.paper_capacity > 0 ? Math.round((100 * supplies.paper_remaining) / supplies.paper_capacity) : null;

  return (
    <Layout>
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center px-2 pb-16 lg:pb-10">
        {/* Left: welcome and how it works */}
        <section className="home-left flex flex-col gap-7 kiosk-rise">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-base font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200">
              <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 kiosk-ping" /><span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" /></span>
              Kiosk ready{paperPercent !== null ? ` · paper ${paperPercent}%` : ''}
            </span>
            <span className="rounded-full bg-white/70 px-4 py-2 text-base font-semibold kiosk-copy shadow-sm ring-1 ring-slate-200">
              {greeting} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>

          <div>
            <h1 className="home-title text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight kiosk-heading">
              Print anything,
              <br />
              <span className="kiosk-gradient-text">in seconds.</span>
            </h1>
            <p className="home-sub mt-4 max-w-xl text-xl xl:text-2xl leading-relaxed kiosk-copy">
              Upload from your phone, pay online, and collect your pages right here.
            </p>
          </div>

          <ol className="grid grid-cols-3 gap-3 max-w-xl" aria-label="How it works">
            {[
              { icon: Smartphone, title: 'Upload', text: 'on your phone' },
              { icon: CreditCard, title: 'Pay', text: 'UPI or card' },
              { icon: Printer, title: 'Collect', text: 'at this kiosk' },
            ].map((step, index) => (
              <li key={step.title} className="relative rounded-2xl p-4 kiosk-panel">
                <span className="absolute -top-3 left-4 grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-sm font-extrabold text-white">{index + 1}</span>
                <step.icon size={30} className="mt-1 text-sky-600" />
                <p className="mt-2 text-lg font-extrabold kiosk-heading">{step.title}</p>
                <p className="text-sm kiosk-copy">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Right: the two ways in */}
        <section className="flex flex-col gap-5 kiosk-rise kiosk-rise-delay">
          <button
            type="button"
            onClick={() => navigate('/code')}
            className="home-pickup group relative overflow-hidden rounded-[2rem] p-8 text-left text-white shadow-xl transition-transform active:scale-[0.98] focus:outline-none focus-visible:outline-none kiosk-primary-rose"
          >
            <span aria-hidden="true" className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <span aria-hidden="true" className="absolute -bottom-14 right-16 h-36 w-36 rounded-full bg-white/10" />
            <span className="relative flex items-center gap-5">
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-white/20 ring-1 ring-white/40 kiosk-float">
                <KeyRound size={42} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold uppercase tracking-[0.18em] text-white/80">Already paid?</span>
                <span className="block text-3xl xl:text-4xl font-extrabold leading-tight">Enter your pickup code</span>
              </span>
            </span>
            <span className="home-pickup-code relative mt-7 flex items-center justify-between rounded-2xl bg-white/15 px-5 py-4 ring-1 ring-white/30">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-white/90">ARX-••••••</span>
              <span className="flex items-center gap-2 text-xl font-extrabold">Print now <ArrowRight size={26} className="transition-transform group-active:translate-x-1" /></span>
            </span>
          </button>

          <div className="home-qr-card flex items-center gap-6 rounded-[2rem] p-6 kiosk-panel">
            <img src={appDownloadQr} alt="QR code to start printing on your phone" className="home-qr h-40 w-40 shrink-0 rounded-2xl bg-white p-2 shadow-md ring-1 ring-slate-200" />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-sky-700 ring-1 ring-sky-200"><ScanLine size={16} />New here?</span>
              <p className="mt-3 text-2xl font-extrabold leading-tight kiosk-heading">Scan with your phone camera</p>
              <p className="mt-2 text-lg leading-snug kiosk-copy">Upload your file and pay. You'll get a pickup code to use here.</p>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

/** The current time, refreshed every 30 seconds. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
