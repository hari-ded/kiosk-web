import { useState, useRef, useEffect } from 'react';
import { createSupportCall } from '../api';
import { X, Mic, MicOff, Phone, AlertCircle, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'https://arox-api-993539509814.asia-south1.run.app/api';
const KIOSK_ID = import.meta.env.VITE_KIOSK_ID || '1';
const SOCKET_URL = API_URL.startsWith('http') ? new URL(API_URL).origin : window.location.origin;

interface Props {
  onClose: () => void;
}

type CallState = 'category' | 'description' | 'requesting_mic' | 'connecting' | 'active';

export function SupportOverlay({ onClose }: Props) {
  const [callState, setCallState] = useState<CallState>('category');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rtcConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const cleanupCall = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    return cleanupCall;
  }, []);

  const handleStartCall = async () => {
    setCallState('requesting_mic');
    setError(null);
    
    try {
      // 1. Request mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;
      
      setCallState('connecting');

      // 2. Create support ticket
      const callData = await createSupportCall(category, description);
      if (!callData || !callData.id) {
        throw new Error('Could not create support ticket');
      }

      const callId = callData.id;

      // 3. Socket.io WebRTC signaling
      const socket = io(SOCKET_URL, {
        path: '/socket.io', // default
        transports: ['websocket', 'polling']
      });
      socketRef.current = socket;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      rtcConnectionRef.current = pc;
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(console.error);
        setCallState('active');
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('support:ice-candidate', { call_id: callId, candidate: event.candidate });
        }
      };

      socket.on('connect', () => {
        socket.emit('support:kiosk-join', {
          call_id: callId,
          kiosk_id: KIOSK_ID,
          category,
          description,
        });
      });

      socket.on('support:offer', async (data: any) => {
        if (data.callId === callId || data.call_id === callId) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('support:answer', { call_id: callId, sdp: answer });
          setCallState('active');
        }
      });

      socket.on('support:ice-candidate', async (data: any) => {
        if (data.candidate && (data.callId === callId || data.call_id === callId)) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });

      socket.on('support:ended', () => {
        cleanupCall();
        onClose();
      });

    } catch (err: any) {
      cleanupCall();
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
        setError('Microphone permission is required for live support calls.');
        setCallState('description'); // back to previous step
      } else {
        setError('Failed to connect to support. Please try again.');
        setCallState('description');
      }
    }
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // if currently muted, enable it
      });
      setIsMuted(!isMuted);
    }
  };

  const handleEndCall = () => {
    cleanupCall();
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-8 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="h-20 bg-gradient-to-r from-rose-500 to-orange-500 border-0 px-8 flex items-center justify-between shrink-0 text-white">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Phone size={28} />
            Live Support
          </h2>
          {(callState === 'category' || callState === 'description') && (
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors">
              <X size={32} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col min-h-[400px]">
          
          {callState === 'category' && (
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">What do you need help with?</h3>
              <div className="grid grid-cols-2 gap-6 flex-1">
                {[
                  { id: 'paper_jam', label: 'Paper Jam' },
                  { id: 'toner_out', label: 'Toner Issue' },
                  { id: 'payment_issue', label: 'Payment Issue' },
                  { id: 'other', label: 'Other Issue' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategory(cat.id); setCallState('description'); }}
                    className="h-24 bg-gray-50 border-2 border-gray-200 rounded-xl text-xl font-bold text-gray-800 active:bg-rose-50 active:border-rose-300 transition-colors"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {callState === 'description' && (
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Add a description (Optional)</h3>
              
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-4 text-red-700">
                  <AlertCircle size={28} className="shrink-0" />
                  <span className="text-lg font-medium">{error}</span>
                </div>
              )}

              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Type any additional details here..."
                className="w-full h-40 p-4 border-2 border-gray-300 rounded-xl text-xl bg-gray-50 resize-none focus:outline-none focus:border-rose-500 mb-8"
              />
              <div className="flex gap-6 mt-auto">
                <button
                  onClick={() => setCallState('category')}
                  className="flex-1 h-16 bg-white border-2 border-gray-300 rounded-xl text-xl font-bold text-gray-700 active:bg-gray-100"
                >
                  Back
                </button>
                <button
                  onClick={handleStartCall}
                  className="flex-1 h-16 bg-gradient-to-r from-rose-500 to-orange-500 border-0 rounded-xl text-xl font-bold text-white shadow-md active:opacity-80 flex items-center justify-center gap-3"
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
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Microphone Access</h3>
              <p className="text-xl text-gray-600">Please allow microphone access when prompted to speak with support.</p>
            </div>
          )}

          {callState === 'connecting' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 size={64} className="text-rose-600 mb-8 animate-spin" />
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Connecting to Support...</h3>
              <p className="text-xl text-gray-600">Please wait while we connect you to the next available agent.</p>
            </div>
          )}

          {callState === 'active' && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-32 h-32 bg-green-50 rounded-full flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-75"></div>
                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center relative z-10 text-white shadow-lg">
                  <Phone size={48} />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">Call Active</h3>
              <p className="text-xl text-gray-500 mb-12">Speaking with support agent...</p>
              
              <div className="flex gap-8 w-full max-w-sm">
                <button
                  onClick={toggleMute}
                  className={`flex-1 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-colors ${
                    isMuted 
                      ? 'bg-red-50 border-red-200 text-red-600' 
                      : 'bg-white border-gray-200 text-gray-700 active:bg-gray-100'
                  }`}
                >
                  {isMuted ? <MicOff size={36} /> : <Mic size={36} />}
                  <span className="text-lg font-bold">{isMuted ? 'Muted' : 'Mute'}</span>
                </button>
                
                <button
                  onClick={handleEndCall}
                  className="flex-1 h-20 bg-red-600 border-2 border-red-600 rounded-2xl flex flex-col items-center justify-center gap-2 text-white active:bg-red-700 shadow-md transition-colors"
                >
                  <Phone size={36} className="rotate-[135deg]" />
                  <span className="text-lg font-bold">End</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
