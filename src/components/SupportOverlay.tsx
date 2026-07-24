import { useEffect, useRef, useState } from 'react';
import { createSupportCall, getSupportCall, updateSupportCall } from '../api';
import { SUPPORT_ICE_SERVERS, SUPPORT_KIOSK_ID, createSupportSocket, type SupportSocket } from '../utils/supportTransport';
import { X, Mic, MicOff, Phone, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

type CallState = 'category' | 'description' | 'requesting_mic' | 'waiting' | 'active' | 'held' | 'ended';

type JoinPayload = {
  callId: string;
  category: string;
  description: string;
};

const SUPPORT_CATEGORIES = [
  { id: 'paper_jam', label: 'Paper Jam' },
  { id: 'toner_out', label: 'Toner Issue' },
  { id: 'payment_issue', label: 'Payment Issue' },
  { id: 'other', label: 'Other Issue' }
];

export function SupportOverlay({ onClose }: Props) {
  const [callState, setCallState] = useState<CallState>('category');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Waiting for the next available agent');

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<SupportSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingJoinRef = useRef<JoinPayload | null>(null);
  const joinedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const callIdRef = useRef<string | null>(null);
  const callStateRef = useRef<CallState>('category');

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const closePeerConnection = () => {
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    pendingJoinRef.current = null;
    joinedRef.current = false;
  };

  const cleanupCall = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closePeerConnection();
    disconnectSocket();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => cleanupCall, []);

  const emitJoin = () => {
    const socket = socketRef.current;
    const join = pendingJoinRef.current;
    if (!socket || !join || !socket.connected || joinedRef.current) {
      return;
    }

    socket.emit('support:kiosk-join', {
      callId: join.callId,
      call_id: join.callId,
      kiosk_id: SUPPORT_KIOSK_ID,
      category: join.category,
      description: join.description,
    });
    joinedRef.current = true;
    setConnectionStatus('Waiting for the next available agent');
  };

  const ensurePeerConnection = () => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const pc = new RTCPeerConnection({ iceServers: SUPPORT_ICE_SERVERS });

    pc.onicecandidate = event => {
      const socket = socketRef.current;
      const activeCallId = callIdRef.current;
      if (!socket || !activeCallId || !event.candidate) {
        return;
      }

      socket.emit('support:ice-candidate', {
        callId: activeCallId,
        call_id: activeCallId,
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setConnectionStatus('The support connection was interrupted');
      }
    };

    mediaStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, mediaStreamRef.current as MediaStream);
    });

    peerRef.current = pc;
    return pc;
  };

  const connectSupportSocket = (join: JoinPayload) => {
    pendingJoinRef.current = join;

    if (!socketRef.current) {
      const socket = createSupportSocket();
      socketRef.current = socket;

      socket.on('connect', () => {
        emitJoin();
      });

      socket.on('support:queued', payload => {
        if (payload?.message) {
          setConnectionStatus(payload.message);
        }
      });

      socket.on('support:waiting', payload => {
        setConnectionStatus(payload?.message || 'Waiting for the next available agent');
      });

      socket.on('support:agent-assigned', payload => {
        if (String(payload?.call_id || payload?.callId || '') !== String(callIdRef.current || '')) {
          return;
        }
        setConnectionStatus('An agent is joining your call now.');
      });

      socket.on('support:held', payload => {
        const incomingCallId = String(payload?.callId || payload?.call_id || '');
        if (incomingCallId && incomingCallId !== String(callIdRef.current || '')) {
          return;
        }

        setCallState('held');
        setConnectionStatus('The call is on hold. Please wait while the agent resumes it.');
      });

      socket.on('support:resumed', payload => {
        const incomingCallId = String(payload?.callId || payload?.call_id || '');
        if (incomingCallId && incomingCallId !== String(callIdRef.current || '')) {
          return;
        }

        setCallState('active');
        setConnectionStatus('The agent resumed the call.');
      });

      socket.on('support:offer', async payload => {
        const incomingCallId = String(payload?.callId || payload?.call_id || '');
        if (!incomingCallId || incomingCallId !== String(callIdRef.current || '')) {
          return;
        }

        try {
          const pc = ensurePeerConnection();
          await pc.setRemoteDescription({ type: 'offer', sdp: payload?.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('support:answer', {
            callId: incomingCallId,
            call_id: incomingCallId,
            sdp: answer.sdp,
          });
          setCallState('active');
          setConnectionStatus('Connected to support');
        } catch {
          setError('Failed to establish the live audio connection.');
        }
      });

      socket.on('support:ice-candidate', async payload => {
        const incomingCallId = String(payload?.callId || payload?.call_id || '');
        if (!incomingCallId || incomingCallId !== String(callIdRef.current || '')) {
          return;
        }

        try {
          const pc = peerRef.current;
          if (pc && payload?.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        } catch {
          // Ignore individual ICE candidate failures; the connection can still succeed.
        }
      });

      socket.on('support:ended', payload => {
        const incomingCallId = String(payload?.callId || payload?.call_id || '');
        if (incomingCallId && incomingCallId !== String(callIdRef.current || '')) {
          return;
        }

        setConnectionStatus('The support agent ended the call');
        setCallState('ended');
        cleanupCall();
        closeTimerRef.current = window.setTimeout(() => onClose(), 1800);
      });

      socket.on('support:error', payload => {
        setError(String(payload?.message || 'Support connection error'));
      });

      socket.on('disconnect', () => {
        joinedRef.current = false;
        if (callStateRef.current === 'waiting' || callStateRef.current === 'active') {
          setConnectionStatus('Support connection lost');
        }
      });
    }

    if (!socketRef.current.connected) {
      socketRef.current.connect();
      return;
    }

    emitJoin();
  };

  useEffect(() => {
    if (!callId || (callState !== 'waiting' && callState !== 'active')) {
      return;
    }

    const refreshCall = async () => {
      const liveCall = await getSupportCall(callId);
      if (!liveCall) {
        setError('Support request could not be found.');
        setCallState('ended');
        cleanupCall();
        closeTimerRef.current = window.setTimeout(() => onClose(), 1500);
        return;
      }

      if (liveCall.status === 'connected' && callStateRef.current === 'waiting') {
        setCallState('active');
        setConnectionStatus('An agent joined the call');
        return;
      }

      if (liveCall.status === 'on_hold') {
        setCallState('held');
        setConnectionStatus('The call is on hold. Please wait while the agent resumes it.');
        return;
      }

      if (liveCall.status === 'closed') {
        setConnectionStatus('The support agent ended the call');
        setCallState('ended');
        cleanupCall();
        closeTimerRef.current = window.setTimeout(() => onClose(), 1800);
        return;
      }

      if (callStateRef.current === 'waiting') {
        setConnectionStatus('Waiting for the next available agent');
      }
    };

    void refreshCall();
    pollTimerRef.current = window.setInterval(() => {
      void refreshCall();
    }, 2000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [callId, callState, onClose]);

  const handleStartCall = async () => {
    setCallState('requesting_mic');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;
      setCallState('waiting');

      const callData = await createSupportCall(category, description);
      if (!callData || !callData.id) {
        throw new Error('Could not create support ticket');
      }

      const nextCallId = String(callData.id);
      setCallId(nextCallId);
      setConnectionStatus('Waiting for the next available agent');
      connectSupportSocket({
        callId: nextCallId,
        category,
        description,
      });
    } catch (err: any) {
      cleanupCall();
      if (err?.name === 'NotAllowedError' || err?.name === 'NotFoundError') {
        setError('Microphone permission is required for live support calls.');
      } else {
        setError('Failed to connect to support. Please try again.');
      }
      setCallState('description');
    }
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      const nextMuted = !isMuted;
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);
    }
  };

  const handleEndCall = async () => {
    const activeCallId = callId;
    const socket = socketRef.current;
    if (socket && activeCallId) {
      socket.emit('support:end-call', {
        callId: activeCallId,
        call_id: activeCallId,
      });
    }

    cleanupCall();
    if (activeCallId) {
      void updateSupportCall(activeCallId, 'closed');
    }
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 kiosk-overlay kiosk-blur">
      <div className="rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col kiosk-panel-strong">
        <div className="h-20 border-0 px-8 flex items-center justify-between shrink-0 text-white kiosk-primary-rose">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Phone size={28} /> Live Support
          </h2>
          {(callState === 'category' || callState === 'description') && (
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors">
              <X size={32} />
            </button>
          )}
        </div>

        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <div className="p-8 flex flex-col min-h-[400px]">
          {callState === 'category' && (
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold kiosk-heading mb-8 text-center">What do you need help with?</h3>
              <div className="grid grid-cols-2 gap-6 flex-1">
                {SUPPORT_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategory(cat.id); setCallState('description'); }}
                    className="h-24 rounded-xl text-xl font-bold transition-colors kiosk-muted-button"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {callState === 'description' && (
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold kiosk-heading mb-6">Add a description (Optional)</h3>

              {error && (
                <div className="mb-6 p-4 rounded-xl flex items-start gap-4 kiosk-soft-red kiosk-text-red">
                  <AlertCircle size={28} className="shrink-0" />
                  <span className="text-lg font-medium">{error}</span>
                </div>
              )}

              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Type any additional details here..."
                className="w-full h-40 p-4 border-2 rounded-xl text-xl resize-none focus:outline-none mb-8 kiosk-input"
              />
              <div className="flex gap-6 mt-auto">
                <button
                  onClick={() => setCallState('category')}
                  className="flex-1 h-16 rounded-xl text-xl font-bold kiosk-muted-button"
                >
                  Back
                </button>
                <button
                  onClick={handleStartCall}
                  className="flex-1 h-16 border-0 rounded-xl text-xl font-bold text-white shadow-md flex items-center justify-center gap-3 kiosk-primary-rose"
                >
                  <Phone size={24} />
                  Start Call
                </button>
              </div>
            </div>
          )}

          {callState === 'requesting_mic' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Mic size={64} className="text-rose-600 mb-8 animate-pulse" />
              <h3 className="text-2xl font-bold mb-4 kiosk-heading">Microphone Access</h3>
              <p className="text-xl kiosk-copy">Please allow microphone access when prompted to speak with support.</p>
            </div>
          )}

          {callState === 'waiting' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 size={64} className="text-rose-600 mb-8 animate-spin" />
              <h3 className="text-2xl font-bold mb-4 kiosk-heading">Connecting to Support...</h3>
              <p className="text-xl kiosk-copy max-w-xl">{connectionStatus}</p>
              <p className="text-lg text-gray-500 mt-4">Kiosk {SUPPORT_KIOSK_ID}{callId ? ` · ${callId}` : ''}</p>
              <button
                onClick={handleEndCall}
                className="mt-10 h-16 px-10 rounded-xl text-xl font-bold kiosk-muted-button"
              >
                Cancel Request
              </button>
            </div>
          )}

          {callState === 'active' && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full flex items-center justify-center mb-8 relative kiosk-soft-emerald">
                <div className="absolute inset-0 rounded-full animate-ping opacity-75 kiosk-soft-emerald"></div>
                <div className="w-24 h-24 rounded-full flex items-center justify-center relative z-10 text-white shadow-lg kiosk-circle-emerald">
                  <Phone size={48} />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">Call Active</h3>
              <p className="text-xl text-gray-500 mb-3">Speaking with support agent...</p>
              <p className="text-lg text-gray-500 mb-12">{callId ? `Call ${callId}` : connectionStatus}</p>

              <div className="flex gap-8 w-full max-w-sm">
                <button
                  onClick={toggleMute}
                  className={`flex-1 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-colors ${
                    isMuted
                      ? 'kiosk-soft-red kiosk-text-red'
                      : 'kiosk-muted-button'
                  }`}
                >
                  {isMuted ? <MicOff size={36} /> : <Mic size={36} />}
                  <span className="text-lg font-bold">{isMuted ? 'Muted' : 'Mute'}</span>
                </button>

                <button
                  onClick={handleEndCall}
                  className="flex-1 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 text-white shadow-md transition-colors kiosk-primary-red"
                >
                  <Phone size={36} className="rotate-[135deg]" />
                  <span className="text-lg font-bold">End</span>
                </button>
              </div>
            </div>
          )}

          {callState === 'held' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 size={64} className="text-rose-600 mb-8 animate-spin" />
              <h3 className="text-2xl font-bold mb-4 kiosk-heading">Call On Hold</h3>
              <p className="text-xl kiosk-copy max-w-xl">{connectionStatus}</p>
              <p className="text-lg text-gray-500 mt-4">Kiosk {SUPPORT_KIOSK_ID}{callId ? ` · ${callId}` : ''}</p>
            </div>
          )}

          {callState === 'ended' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Phone size={64} className="text-gray-400 mb-8" />
              <h3 className="text-2xl font-bold mb-4 kiosk-heading">Support Call Ended</h3>
              <p className="text-xl kiosk-copy">{connectionStatus}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


