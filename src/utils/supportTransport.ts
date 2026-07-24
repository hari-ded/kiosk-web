import { io, type Socket } from 'socket.io-client';

const RAW_SUPPORT_URL = import.meta.env.VITE_API_URL ?? 'https://arox-api-993539509814.asia-south1.run.app';

function normalizeSupportRoot(url: string) {
  const trimmed = url.replace(/\/$/, '');
  if (trimmed.endsWith('/api')) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

export const SUPPORT_BACKEND_ROOT = normalizeSupportRoot(RAW_SUPPORT_URL);
export const SUPPORT_API_ROOT = `${SUPPORT_BACKEND_ROOT}/api`;
export const SUPPORT_SOCKET_URL = SUPPORT_BACKEND_ROOT;
export const SUPPORT_KIOSK_ID = import.meta.env.VITE_KIOSK_ID || '1';
export const SUPPORT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type SupportSocket = Socket;

export function createSupportSocket(): SupportSocket {
  return io(SUPPORT_SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: false,
  });
}
