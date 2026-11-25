import { PrintJob, Consumables, SupportCall } from './types';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '/api';

function normalizeApiBase(url: string) {
  const trimmed = String(url || '').trim().replace(/\/$/, '');
  if (!trimmed) {
    return '/api';
  }
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

function buildHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    ...defaultHeaders,
    ...extra,
  };
}

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

async function fetchSupportApi(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
  });
}

export async function fetchConsumables(): Promise<Consumables> {
  const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/consumables`, {
    cache: 'no-store',
    headers: buildHeaders()
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

export async function validateJobCode(code: string): Promise<{ job?: PrintJob, jobs?: PrintJob[], error?: string }> {
  try {
    const pickupCode = normalizePickupCode(code);
    const res = await fetch(API_URL + '/job/' + encodeURIComponent(pickupCode) + '?kiosk_id=' + KIOSK_ID, {
      cache: 'no-store', headers: buildHeaders()
    });
    const data = await readJsonResponse<any>(res);
    if (!data) return { error: 'Server returned an invalid response' };
    if (!res.ok || data.success === false) return { error: data.error || data.message || 'Invalid pickup code' };
    // The backend has returned grouped pickup orders under both `jobs` and
    // `files`/`uploads` over time. Preserve the whole group so the kiosk does
    // not mistake the first file for the complete order.
    const payload = data.data && typeof data.data === 'object' ? data.data : data;
    // The backend returns both a legacy single-job record and a grouped jobs
    // array. Deployments may wrap either part in `data`, so collect every
    // grouped array and the legacy record, then deduplicate by upload ID.
    const rawJobs = [data, payload].flatMap((source: any) => [
      ...(Array.isArray(source.jobs) ? source.jobs : []),
      ...(Array.isArray(source.files) ? source.files : []),
      ...(Array.isArray(source.uploads) ? source.uploads : []),
      ...(source.job && typeof source.job === 'object' ? [source.job] : []),
      ...((source.upload_id ?? source.id) !== undefined ? [source] : []),
    ]);
    const jobsById = new Map<string, PrintJob>();
    rawJobs.forEach((raw: any) => {
      const uploadId = raw.upload_id ?? raw.id;
      if (uploadId === undefined || uploadId === null || String(uploadId).trim() === '') {
        return;
      }
      jobsById.set(String(uploadId), {
        id: String(uploadId), filename: raw.filename || ('Job ' + code),
        pages: Number(raw.pages) || 1, copies: Number(raw.copies) || 1,
        color: Boolean(raw.color), orientation: raw.orientation || raw.print_orientation || 'Portrait',
        pages_per_sheet: Number(raw.pages_per_sheet ?? raw.page_per_sheet ?? 1) || 1,
        page_range: raw.page_range || null,
        paper_size: raw.paper_size || null,
        duplex: parseBoolean(raw.duplex ?? raw.double_sided ?? raw.is_duplex ?? raw.sides),
        status: raw.status || 'unknown', pickup_code: raw.pickup_code || pickupCode,
        estimated_time_seconds: Number(raw.estimated_time_seconds) || 0,
        email: raw.email || null,
      });
    });
    const jobs = Array.from(jobsById.values());
    if (jobs.length === 0) return { error: 'Server returned a file without an ID' };
    const job = jobs.find(item => item.status.toLowerCase() === 'awaitingrelease') || jobs[0];
    return { job, jobs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error or server unavailable' };
  }
}

export async function fetchKioskStatus(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/kiosk/${encodeURIComponent(KIOSK_ID)}/status`, {
      cache: 'no-store',
      headers: buildHeaders(),
    });
    const data = await readJsonResponse<any>(res);
    if (!res.ok || !data) return null;
    return String(data.status || '').trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function sendKioskHeartbeat(customerPresent = false): Promise<void> {
  const res = await fetch(`${API_URL}/kiosks/${encodeURIComponent(KIOSK_ID)}/heartbeat`, {
    method: 'POST',
    cache: 'no-store',
    headers: buildHeaders(),
    body: JSON.stringify({ source: 'web_kiosk', customer_present: customerPresent }),
  });
  if (!res.ok) throw new Error('Failed to send kiosk heartbeat');
}
export async function releaseJob(code: string, uploadId?: string): Promise<{ success: boolean; error?: string }> {
  const pickupCode = normalizePickupCode(code);
  const res = await fetch(`${API_URL}/release_job`, {
    method: 'POST',
    cache: 'no-store',
    headers: buildHeaders(),
    body: JSON.stringify({ pickup_code: pickupCode, kiosk_id: KIOSK_ID, upload_id: uploadId })
  });
  const data = await readJsonResponse<any>(res);
  if (!data) return { success: false, error: `Server returned an invalid release response (${res.status})` };
  return {
    success: res.ok && data.success === true,
    error: data.error || data.message || `Unable to release file (${res.status})`,
  };
}

/** Live printing progress, reported by the engine while it reads the printer. */
export type JobProgress = {
  phase: 'waiting' | 'printing' | 'attention' | 'unverified' | 'failed' | 'done' | string;
  pages_done: number | null;
  pages_total: number | null;
  alert: string | null;
  alert_text: string | null;
  message: string | null;
};

export async function checkJobProgress(uploadId: string): Promise<{ status: string; progress: JobProgress | null }> {
  try {
    const res = await fetch(`${API_URL}/job_status/${uploadId}`, {
      cache: 'no-store',
      headers: buildHeaders()
    });
    const data = await readJsonResponse<any>(res);
    if (!data) return { status: 'unknown', progress: null };
    const progress = data.progress && typeof data.progress === 'object' ? (data.progress as JobProgress) : null;
    return { status: String(data.job_status ?? data.status ?? 'unknown'), progress };
  } catch {
    return { status: 'unknown', progress: null };
  }
}

export async function checkJobStatus(uploadId: string): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/job_status/${uploadId}`, {
      cache: 'no-store',
      headers: buildHeaders()
    });
    const data = await readJsonResponse<any>(res);
    if (!data) return 'unknown';
    return String(data.job_status ?? data.status ?? 'unknown');
  } catch {
    return 'unknown';
  }
}
export async function sendAlert(alertType: string, source: string, message: string, extra: any = {}): Promise<boolean> {
  const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/alerts`, {
    method: 'POST',
    cache: 'no-store',
    headers: buildHeaders(),
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

/** "Need help?": alert the kiosk's assigned staff and the administrators. */
export async function sendHelpRequest(problem: string, pickupCode?: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/alerts`, {
      method: 'POST',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify({ alert_type: 'help_request', source: 'kiosk_help', problem, extra: { problem, pickup_code: pickupCode || null } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createSupportCall(category: string, description: string = ''): Promise<SupportCall> {
  const res = await fetchSupportApi('/support/calls', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ kiosk_id: KIOSK_ID, category, description })
  });
  const data = await readJsonResponse<any>(res);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to create support call');
  }

  if (!data) throw new Error('Failed to create support call');
  const call = (data.call || data) as Record<string, any>;
  const accessToken = String(data.access_token || data.call_token || call.access_token || call.call_token || '');
  return {
    id: call.id || call.call_id,
    kiosk_id: String(call.kiosk_id || KIOSK_ID),
    category: String(call.category || category),
    description: String(call.description || description),
    status: (call.status || 'open') as SupportCall['status'],
    created_at: String(call.created_at || new Date().toISOString()),
    updated_at: String(call.updated_at || call.created_at || new Date().toISOString()),
    connected_at: call.connected_at || null,
    closed_at: call.closed_at || null,
    access_token: accessToken || undefined,
  };
}

export async function listSupportCalls(status?: string): Promise<SupportCall[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetchSupportApi(`/support/calls${params.toString() ? `?${params.toString()}` : ''}`, {
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch support calls');
  const data = await readJsonResponse<any>(res);
  if (!data) throw new Error('Failed to fetch support calls');
  return Array.isArray(data.calls) ? (data.calls as SupportCall[]) : [];
}

export async function getSupportCall(callId: string, callToken?: string): Promise<SupportCall | null> {
  const headers = callToken ? buildHeaders({ 'X-AROX-CALL-TOKEN': callToken }) : buildHeaders();
  const res = await fetchSupportApi(`/support/calls/${callId}`, {
    headers,
  });
  if (!res.ok) return null;
  const data = await readJsonResponse<any>(res);
  if (!data?.call) return null;
  return data.call as SupportCall;
}

export async function getSupportIceServers(callId: string, callToken?: string): Promise<RTCIceServer[] | null> {
  const headers = callToken ? buildHeaders({ 'X-AROX-CALL-TOKEN': callToken }) : buildHeaders();
  const res = await fetchSupportApi(`/support/calls/${callId}/ice-servers`, { headers });
  if (!res.ok) return null;
  const data = await readJsonResponse<any>(res);
  return Array.isArray(data?.ice_servers) ? data.ice_servers as RTCIceServer[] : null;
}
export async function updateSupportCall(callId: string, status: SupportCall['status'], callToken?: string): Promise<SupportCall | null> {
  const headers = callToken ? buildHeaders({ 'X-AROX-CALL-TOKEN': callToken }) : buildHeaders();
  const res = await fetchSupportApi(`/support/calls/${callId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  const data = await readJsonResponse<any>(res);
  if (!data?.call) return null;
  return data.call as SupportCall;
}

// ---------------------------------------------------------------- staff mode
// Staff unlock the panel by scanning a QR code with their phone and approving
// it in the admin panel. The kiosk keeps a secret (poll_secret) that only it
// knows; once approved, that secret is the staff session for a few minutes.
export type StaffSnapshot = {
  success: boolean;
  error?: string;
  locked?: boolean;
  status?: 'pending' | 'approved' | 'expired';
  staff_name?: string;
  kiosk?: { name: string; status: string; paper_remaining: number | null; paper_capacity: number | null; toner_remaining: number | null; toner_capacity: number | null; last_seen: string | null };
  alerts?: { id: number; alert_type: string; severity: string; title: string; created_at: string }[];
  today?: { printed: number; failed: number; pages: number };
};
export type StaffUnlockStart = { success: boolean; error?: string; poll_secret?: string; unlock_url?: string; expires_in?: number };

async function staffPost<T extends { success: boolean; error?: string }>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    const res = await fetch(`${API_URL}/kiosks/${encodeURIComponent(KIOSK_ID)}/staff/${path}`, {
      method: 'POST', cache: 'no-store', headers: buildHeaders(), body: JSON.stringify(body),
    });
    const data = await readJsonResponse<T>(res);
    if (!data) return { success: false, error: `Server error (${res.status})` } as T;
    return { ...data, success: res.ok && data.success === true };
  } catch {
    return { success: false, error: 'No connection' } as T;
  }
}

export const staffUnlockStart = () => staffPost<StaffUnlockStart>('unlock/start', {});
export const staffUnlockStatus = (pollSecret: string) => staffPost<StaffSnapshot>('unlock/status', { poll_secret: pollSecret });
export const staffUnlockEnd = (pollSecret: string) => staffPost<{ success: boolean; error?: string }>('unlock/end', { poll_secret: pollSecret });
export type StaffActionName = 'add_paper' | 'refill_paper' | 'refill_toner' | 'resolve_alerts' | 'refresh';
export const staffAction = (pollSecret: string, action: StaffActionName, extra: Record<string, unknown> = {}) =>
  staffPost<StaffSnapshot>('action', { poll_secret: pollSecret, action, ...extra });

// ---------------------------------------------------------------- feedback
export async function sendFeedback(uploadId: string, rating: 1 | -1, reason?: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/kiosks/${encodeURIComponent(KIOSK_ID)}/feedback`, {
      method: 'POST', cache: 'no-store', headers: buildHeaders(),
      body: JSON.stringify({ upload_id: uploadId, rating, reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
