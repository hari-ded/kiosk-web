import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchKioskConsumables, listSupportCalls, updateSupportCall } from '../api';
import { Consumables, SupportCall } from '../types';
import { SUPPORT_ICE_SERVERS, createSupportSocket, type SupportSocket } from '../utils/supportTransport';
import { PhoneCall, PhoneOff, RefreshCw, Clock3, MessageSquareText, Mic, MicOff, Phone, Loader2 } from 'lucide-react';

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
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('Waiting for a call to connect');
  const [sessionPhase, setSessionPhase] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [kioskConsumables, setKioskConsumables] = useState<Consumables | null>(null);

  const socketRef = useRef<SupportSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallRef = useRef<string | null>(null);

  const openCalls = useMemo(() => calls.filter(call => call.status === 'open'), [calls]);
  const activeCalls = useMemo(() => calls.filter(call => call.status === 'connected' || call.status === 'on_hold'), [calls]);
  const activeCall = useMemo(
    () => calls.find(call => call.id === activeCallId) ?? null,
    [calls, activeCallId]
  );

  useEffect(() => {
    if (!activeCall) {
      setKioskConsumables(null);
      return;
    }

    let alive = true;
    void fetchKioskConsumables(activeCall.kiosk_id)
      .then(data => {
        if (alive) {
          setKioskConsumables(data);
        }
      })
      .catch(() => {
        if (alive) {
          setKioskConsumables(null);
        }
      });

    return () => {
      alive = false;
    };
  }, [activeCall?.id, activeCall?.kiosk_id]);

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

  const closeLiveSession = () => {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    activeCallRef.current = null;
    setIsMuted(false);
    setSessionPhase('idle');
    setKioskConsumables(null);
  };

  useEffect(() => closeLiveSession, []);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const nextMuted = !isMuted;
    stream.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const ensurePeerConnection = (callId: string) => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const pc = new RTCPeerConnection({ iceServers: SUPPORT_ICE_SERVERS });

    pc.onicecandidate = event => {
      const socket = socketRef.current;
      if (!socket || !event.candidate) {
        return;
      }

      socket.emit('support:ice-candidate', {
        callId,
        call_id: callId,
        candidate: typeof event.candidate.toJSON === 'function' ? event.candidate.toJSON() : event.candidate,
      });
    };

    pc.ontrack = event => {
      const [stream] = event.streams;
      if (stream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setSessionStatus('Call active');
        setSessionPhase('live');
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setSessionStatus('Live support connection interrupted');
      }
    };

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current as MediaStream);
    });

    peerRef.current = pc;
    return pc;
  };

  const createOfferForCall = async (callId: string) => {
    const socket = socketRef.current;
    if (!socket) {
      throw new Error('Socket connection not ready');
    }

    const pc = ensurePeerConnection(callId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('support:offer', {
      callId,
      call_id: callId,
      sdp: offer.sdp,
    });
    setSessionStatus('Calling the kiosk...');
  };

  const connectLiveSession = async (callId: string) => {
    closeLiveSession();
    activeCallRef.current = callId;
    setActiveCallId(callId);
    setSessionPhase('connecting');
    setSessionStatus('Requesting microphone access...');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    setIsMuted(false);

    const socket = createSupportSocket();
    socketRef.current = socket;

    socket.on('connect', async () => {
      socket.emit('support:agent-join', {
        role: 'care',
        agentId: 'web-agent',
        agentName: 'Support Agent',
        activeCallId: callId,
      });

      const pc = peerRef.current;
      if (!pc || pc.connectionState !== 'connected') {
        try {
          await createOfferForCall(callId);
        } catch {
          setError('Unable to start the live call session.');
        }
      }
    });

    socket.on('support:answer', async payload => {
      const incomingCallId = String(payload?.callId || payload?.call_id || '');
      if (incomingCallId !== String(callId)) {
        return;
      }

      try {
        const pc = peerRef.current;
        if (pc && payload?.sdp) {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          setSessionStatus('Call active');
          setSessionPhase('live');
        }
      } catch {
        setError('Failed to complete the live connection.');
      }
    });

    socket.on('support:ice-candidate', async payload => {
      const incomingCallId = String(payload?.callId || payload?.call_id || '');
      if (incomingCallId !== String(callId)) {
        return;
      }

      try {
        const pc = peerRef.current;
        if (pc && payload?.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch {
        // Ignore individual ICE failures; the peer connection can still recover.
      }
    });

    socket.on('support:held', payload => {
      const incomingCallId = String(payload?.callId || payload?.call_id || '');
      if (incomingCallId && incomingCallId !== String(callId)) {
        return;
      }

      setSessionStatus('Call placed on hold');
      setCalls(current => current.map(call => (call.id === callId ? { ...call, status: 'on_hold' } : call)));
    });

    socket.on('support:resumed', payload => {
      const incomingCallId = String(payload?.callId || payload?.call_id || '');
      if (incomingCallId && incomingCallId !== String(callId)) {
        return;
      }

      setSessionStatus('Call resumed');
      setCalls(current => current.map(call => (call.id === callId ? { ...call, status: 'connected' } : call)));
    });

    socket.on('support:ended', payload => {
      const incomingCallId = String(payload?.callId || payload?.call_id || '');
      if (incomingCallId && incomingCallId !== String(callId)) {
        return;
      }

      setSessionStatus('The kiosk ended the call');
      closeLiveSession();
      setActiveCallId(null);
      setCalls(current => current.map(call => (call.id === callId ? { ...call, status: 'closed' } : call)));
    });

    socket.on('support:error', payload => {
      setError(String(payload?.message || 'Support connection error'));
    });

    socket.on('disconnect', () => {
      if (activeCallRef.current === callId) {
        setSessionStatus('Live support connection lost');
      }
    });

    socket.connect();
  };

  const handleAcceptCall = async (callId: string) => {
    setBusyId(callId);
    setError(null);
    try {
      await updateSupportCall(callId, 'connected');
      setCalls(current => current.map(call => (call.id === callId ? { ...call, status: 'connected' } : call)));
      await connectLiveSession(callId);
      setError(null);
    } catch (err) {
      closeLiveSession();
      setActiveCallId(null);
      setSessionPhase('idle');
      setSessionStatus('Waiting for a call to connect');
      setError('Unable to connect to the live support call.');
    } finally {
      setBusyId(null);
      void refreshCalls();
    }
  };

  const handleEndCall = async (callId: string) => {
    setBusyId(callId);
    try {
      socketRef.current?.emit('support:end-call', {
        callId,
        call_id: callId,
      });
      await updateSupportCall(callId, 'closed');
      setCalls(current => current.map(call => (call.id === callId ? { ...call, status: 'closed' } : call)));
      setSessionStatus('Waiting for a call to connect');
      closeLiveSession();
      setActiveCallId(null);
    } finally {
      setBusyId(null);
      void refreshCalls();
    }
  };

  const handleHoldResume = async (call: SupportCall) => {
    setBusyId(call.id);
    try {
      const nextStatus = call.status === 'on_hold' ? 'connected' : 'on_hold';
      socketRef.current?.emit(nextStatus === 'on_hold' ? 'support:hold-call' : 'support:resume-call', {
        callId: call.id,
        call_id: call.id,
      });
      await updateSupportCall(call.id, nextStatus);
      setCalls(current => current.map(item => (item.id === call.id ? { ...item, status: nextStatus } : item)));
      setSessionStatus(nextStatus === 'on_hold' ? 'Call placed on hold' : 'Call resumed');
    } finally {
      setBusyId(null);
      void refreshCalls();
    }
  };

  const liveCallCard = activeCall ? (
    <section className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Phone size={24} /> Live Session</h2>
          <p className="text-slate-200 mt-1">Kiosk {activeCall.kiosk_id} · {categoryLabel(activeCall.category)}</p>
          <p className="text-sm text-slate-300 mt-2">{sessionStatus}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-100">
              {activeCall.status === 'on_hold' ? 'On Hold' : 'Connected'}
            </span>
            {activeCall.kiosk_location && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-100">
                {activeCall.kiosk_location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <button
            type="button"
            onClick={toggleMute}
            disabled={!localStreamRef.current}
            className={`h-12 px-4 rounded-xl font-bold border transition-colors flex items-center gap-2 ${
              isMuted
                ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
            } disabled:opacity-50`}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            {isMuted ? 'Muted' : 'Mute'}
          </button>
          <button
            type="button"
            onClick={() => void handleHoldResume(activeCall)}
            disabled={busyId === activeCall.id}
            className="h-12 px-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {activeCall.status === 'on_hold' ? 'Resume' : 'Hold'}
          </button>
          <button
            type="button"
            onClick={() => void handleEndCall(activeCall.id)}
            disabled={busyId === activeCall.id}
            className="h-12 px-5 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            <Phone size={16} className="rotate-[135deg]" />
            End Call
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-200 lg:col-span-2">
          {activeCall.description || 'No extra details were provided by the kiosk.'}
        </div>
        <div className="rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-200 space-y-2">
          <p className="font-bold text-white">Machine Status</p>
          <p>Paper left: {kioskConsumables ? `${kioskConsumables.paper_remaining} / ${kioskConsumables.paper_capacity}` : 'Loading...'}</p>
          <p>Toner left: {kioskConsumables ? `${kioskConsumables.toner_remaining} / ${kioskConsumables.toner_capacity}` : 'Loading...'}</p>
          <p className="text-slate-400 text-xs">Updated {kioskConsumables?.updated_at ? formatTime(kioskConsumables.updated_at) : 'recently'}</p>
        </div>
      </div>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </section>
  ) : null;

  return (
    <div className="w-full h-full p-6 md:p-8 bg-slate-950 text-white flex flex-col overflow-hidden">
      {sessionPhase === 'connecting' && activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-center gap-4">
              <Loader2 size={44} className="animate-spin text-emerald-300" />
              <div>
                <h2 className="text-2xl font-bold">Connecting to kiosk</h2>
                <p className="text-slate-300 mt-1">Please wait while we establish the live session.</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-slate-400 uppercase text-xs tracking-wide">Kiosk</p>
                <p className="mt-1 text-lg font-semibold">{activeCall.kiosk_id}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-slate-400 uppercase text-xs tracking-wide">Location</p>
                <p className="mt-1 text-lg font-semibold">{activeCall.kiosk_location || 'Not provided'}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-slate-400 uppercase text-xs tracking-wide">Issue</p>
                <p className="mt-1 text-lg font-semibold">{categoryLabel(activeCall.category)}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-slate-400 uppercase text-xs tracking-wide">Status</p>
                <p className="mt-1 text-lg font-semibold">{sessionStatus}</p>
              </div>
            </div>
          </div>
        </div>
      )}
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

      {liveCallCard}

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
                    onClick={() => void handleAcceptCall(call.id)}
                    disabled={busyId === call.id || !!activeCallId}
                    className="flex-1 h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <PhoneCall size={16} />
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEndCall(call.id)}
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
                      onClick={() => void handleEndCall(call.id)}
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






