import { PrintJob, Consumables, SupportCall } from './types';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '/api';

function normalizeApiBase(url: string) {
  const trimmed = url.replace(/\/$/, '');
  if (trimmed === '/api' || trimmed.endsWith('/api')) {
    return trimmed;
  }
  return `${trimmed}/api`;
}

const API_URL = normalizeApiBase(RAW_API_URL);
const KIOSK_ID = import.meta.env.VITE_KIOSK_ID || '1';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

function normalizePickupCode(code: string) {
  return /^\d{6}$/.test(code) ? `ARX-${code}` : code;
}

function parseBoolean(value: any) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'double', 'duplex', 'two-sided'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

async function readJsonResponse<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function getSupportApiBase() {
  return API_URL.replace(/\/$/, '');
}

async function fetchSupportApi(path: string, init?: RequestInit) {
  const remoteUrl = `${getSupportApiBase()}${path}`;
  const localUrl = `/api${path}`;

  try {
    const remoteRes = await fetch(remoteUrl, {
      cache: 'no-store',
      ...init,
    });

    if (remoteRes.ok) {
      return remoteRes;
    }
  } catch {
    // Fall through to the same-origin kiosk server if the backend is unavailable.
  }

  return fetch(localUrl, {
    cache: 'no-store',
    ...init,
  });
}

export async function fetchConsumables(): Promise<Consumables> {
  const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/consumables`, {
    cache: 'no-store',
    headers: defaultHeaders
  });
  if (!res.ok) throw new Error('Failed to fetch consumables');
  const data = await readJsonResponse<any>(res);
  if (!data) throw new Error('Failed to fetch consumables');
  return {
    ...data,
    paper_capacity: Number(data.paper_capacity) || 0,
    paper_remaining: Number(data.paper_remaining) || 0,
    toner_capacity: Number(data.toner_capacity) || 0,
    toner_remaining: Number(data.toner_remaining) || 0,
  };
}

export async function validateJobCode(code: string): Promise<{ job?: PrintJob, error?: string }> {
  try {
    let res = await fetch(`${API_URL}/job/${code}?kiosk_id=${KIOSK_ID}`, { cache: 'no-store', headers: defaultHeaders });

    if (!res.ok && /^\d{6}$/.test(code)) {
      res = await fetch(`${API_URL}/job/ARX-${code}?kiosk_id=${KIOSK_ID}`, { cache: 'no-store', headers: defaultHeaders });
    }

    const data = await readJsonResponse<any>(res);
    if (!data) {
      return { error: 'Server returned an invalid response' };
    }

    if (data.success === false) {
      return { error: data.error || data.message || 'Invalid pickup code' };
    }

    return {
      job: {
        id: data.upload_id,
        filename: data.filename || `Job ${code}`,
        pages: Number(data.pages) || 1,
        copies: Number(data.copies) || 1,
        color: Boolean(data.color),
        orientation: data.orientation || data.print_orientation || 'Portrait',
        pages_per_sheet: Number(data.pages_per_sheet ?? data.page_per_sheet ?? 1) || 1,
        duplex: parseBoolean(data.duplex ?? data.double_sided ?? data.is_duplex ?? data.sides),
        status: data.status || 'unknown',
        pickup_code: normalizePickupCode(code),
        estimated_time_seconds: Number(data.estimated_time_seconds) || 0,
        email: data.email || null
      }
    };
  } catch {
    return { error: 'Network error or server unavailable' };
  }
}

export async function requestOtp(code: string): Promise<boolean> {
  const pickupCode = normalizePickupCode(code);
  const res = await fetch(`${API_URL}/job/${pickupCode}/request_release_otp`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID })
  });
  if (!res.ok) return false;
  const data = await readJsonResponse<any>(res);
  if (!data) return false;
  return data.success;
}

export async function verifyOtp(code: string, otp: string): Promise<boolean> {
  const pickupCode = normalizePickupCode(code);
  const res = await fetch(`${API_URL}/job/${pickupCode}/verify_release_otp`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID, otp })
  });
  if (!res.ok) return false;
  const data = await readJsonResponse<any>(res);
  if (!data) return false;
  return data.success;
}

export async function releaseJob(code: string): Promise<boolean> {
  const pickupCode = normalizePickupCode(code);
  const res = await fetch(`${API_URL}/release_job`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ pickup_code: pickupCode, kiosk_id: KIOSK_ID })
  });
  if (!res.ok) return false;
  const data = await readJsonResponse<any>(res);
  if (!data) return false;
  return data.success;
}

export async function checkJobStatus(uploadId: string): Promise<string> {
  const res = await fetch(`${API_URL}/job_status/${uploadId}`, { cache: 'no-store', headers: defaultHeaders });
  const data = await readJsonResponse<any>(res);
  if (!data) return 'unknown';
  return data.status;
}

export async function sendAlert(alertType: string, source: string, message: string, extra: any = {}): Promise<boolean> {
  const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/alerts`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({
      alert_type: alertType,
      source,
      severity: 'critical',
      message,
      recipient_roles: ['admin', 'service'],
      extra
    })
  });
  return res.ok;
}

export async function createSupportCall(category: string, description: string = ''): Promise<SupportCall> {
  const res = await fetchSupportApi('/support/calls', {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID, category, description })
  });
  if (!res.ok) throw new Error('Failed to create support call');
  const data = await readJsonResponse<any>(res);
  if (!data) throw new Error('Failed to create support call');
  return {
    id: data.id || data.call_id,
    kiosk_id: String(data.kiosk_id || KIOSK_ID),
    category: String(data.category || category),
    description: String(data.description || description),
    status: (data.status || 'open') as SupportCall['status'],
    created_at: String(data.created_at || new Date().toISOString()),
    updated_at: String(data.updated_at || data.created_at || new Date().toISOString()),
    connected_at: data.connected_at || null,
    closed_at: data.closed_at || null,
  };
}

export async function listSupportCalls(status?: string): Promise<SupportCall[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetchSupportApi(`/support/calls${params.toString() ? `?${params.toString()}` : ''}`, {
    headers: defaultHeaders,
  });
  if (!res.ok) throw new Error('Failed to fetch support calls');
  const data = await readJsonResponse<any>(res);
  if (!data) throw new Error('Failed to fetch support calls');
  return Array.isArray(data.calls) ? (data.calls as SupportCall[]) : [];
}

export async function getSupportCall(callId: string): Promise<SupportCall | null> {
  const res = await fetchSupportApi(`/support/calls/${callId}`, {
    headers: defaultHeaders,
  });
  if (!res.ok) return null;
  const data = await readJsonResponse<any>(res);
  if (!data?.call) return null;
  return data.call as SupportCall;
}

export async function updateSupportCall(callId: string, status: SupportCall['status']): Promise<SupportCall | null> {
  const res = await fetchSupportApi(`/support/calls/${callId}`, {
    method: 'PATCH',
    headers: defaultHeaders,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  const data = await readJsonResponse<any>(res);
  if (!data?.call) return null;
  return data.call as SupportCall;
}


