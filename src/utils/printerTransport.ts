import { io, type Socket } from 'socket.io-client';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'https://arox-api-993539509814.asia-south1.run.app';

function normalizeBackendRoot(url: string) {
  const trimmed = url.replace(/\/$/, '');
  if (trimmed.endsWith('/api')) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

export const PRINTER_BACKEND_ROOT = normalizeBackendRoot(RAW_API_URL);
export const PRINTER_SOCKET_URL = PRINTER_BACKEND_ROOT;

export type PrinterSocket = Socket;

export function createPrinterSocket(): PrinterSocket {
  return io(PRINTER_SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: false,
  });
}
