import { useEffect, useMemo, useState } from 'react';
import { listSupportCalls, updateSupportCall } from '../api';
import { SupportCall } from '../types';
import { PhoneCall, PhoneOff, RefreshCw, Clock3, MessageSquareText } from 'lucide-react';

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function categoryLabel(category: string) {
  switch (category) {
    case 'paper_jam':
      return 'Paper Jam';
    case 'toner_out':
      return 'Toner Issue';
    case 'payment_issue':
      return 'Payment Issue';
    default:
      return 'Other Issue';
  }
}

export function AgentConsole() {
  const [calls, setCalls] = useState<SupportCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCalls = useMemo(() => calls.filter(call => call.status === 'open'), [calls]);
  const activeCalls = useMemo(() => calls.filter(call => call.status === 'connected'), [calls]);

  const refreshCalls = async () => {
    try {
      const data = await listSupportCalls();
      setCalls(data.sort((left, right) => right.created_at.localeCompare(left.created_at)));
      setError(null);
    } catch {
      setError('Unable to load support requests right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshCalls();
    const timer = window.setInterval(() => {
      void refreshCalls();
    }, 2000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleUpdate = async (callId: string, status: SupportCall['status']) => {
    setBusyId(callId);
    try {
      const updatedCall = await updateSupportCall(callId, status);
      if (updatedCall) {
        setCalls(current => current.map(call => (call.id === callId ? updatedCall : call)));
      }
    } finally {
      setBusyId(null);
      void refreshCalls();
    }
  };

  return (
    <div className="w-full h-full p-6 md:p-8 bg-slate-950 text-white flex flex-col overflow-hidden">
      <header className="h-16 flex items-center justify-between border-b border-white/10 mb-6 pb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold">Operator Console</h1>
          <p className="text-sm text-slate-400 mt-1">Live support requests from kiosk terminals</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshCalls()}
          className="h-12 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <section className="lg:col-span-1 rounded-3xl border border-white/10 bg-white/5 p-5 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><MessageSquareText size={20} /> Waiting</h2>
            <span className="text-sm text-slate-400">{openCalls.length}</span>
          </div>
          <div className="space-y-3 overflow-auto pr-1">
            {loading && <p className="text-slate-400">Loading requests...</p>}
            {!loading && openCalls.length === 0 && <p className="text-slate-400">No calls waiting right now.</p>}
            {openCalls.map(call => (
              <div key={call.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold">Kiosk {call.kiosk_id}</p>
                    <p className="text-sm text-slate-400">{formatTime(call.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">Open</span>
                </div>
                <p className="text-sm text-slate-300 mb-3">{categoryLabel(call.category)}</p>
                <p className="text-sm text-slate-400 line-clamp-3">{call.description || 'No description provided.'}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleUpdate(call.id, 'connected')}
                    disabled={busyId === call.id}
                    className="flex-1 h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <PhoneCall size={16} />
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUpdate(call.id, 'closed')}
                    disabled={busyId === call.id}
                    className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Clock3 size={20} /> Active Calls</h2>
            <span className="text-sm text-slate-400">{activeCalls.length}</span>
          </div>

          {activeCalls.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-slate-400">
              <div>
                <PhoneOff size={56} className="mx-auto mb-4 opacity-60" />
                <p className="text-lg">No agent-connected calls yet.</p>
                <p className="text-sm mt-1">Pick up a waiting request to start the live session.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 overflow-auto pr-1">
              {activeCalls.map(call => (
                <div key={call.id} className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-2xl font-bold text-white">Kiosk {call.kiosk_id}</p>
                      <p className="text-slate-300 mt-1">{categoryLabel(call.category)}</p>
                      <p className="text-sm text-slate-400 mt-2">Connected at {call.connected_at ? formatTime(call.connected_at) : 'just now'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUpdate(call.id, 'closed')}
                      disabled={busyId === call.id}
                      className="h-12 px-5 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 transition-colors disabled:opacity-60"
                    >
                      End Call
                    </button>
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-200">
                    {call.description || 'No extra details were provided by the kiosk.'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
