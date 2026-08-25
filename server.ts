import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';

type ConsumablesState = {
  paper_remaining: number;
  toner_remaining: number;
  last_paper_refill: string;
  last_toner_refill: string;
  updated_at: string;
};

type JobRecord = {
  upload_id: string;
  pickup_code: string;
  filename: string;
  pages: number;
  copies: number;
  color: boolean;
  status: string;
  estimated_time_seconds: number;
  email: string | null;
  kiosk_id: string;
  otp: string;
};

type AlertRecord = {
  id: string;
  kiosk_id: string;
  alert_type: string;
  source: string;
  severity: string;
  message: string;
  recipient_roles: string[];
  extra: Record<string, unknown>;
  created_at: string;
};

type SupportCallRecord = {
  id: string;
  kiosk_id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
  closed_at: string | null;
  access_token: string;
};

const paperCapacity = 500;
const tonerCapacity = 1000;
const defaultConsumables = {
  paper_remaining: 200,
  toner_remaining: 300,
  last_paper_refill: new Date().toISOString(),
  last_toner_refill: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const consumablesByKiosk = new Map<string, ConsumablesState>();
const jobsByPickupCode = new Map<string, JobRecord>();
const jobsByUploadId = new Map<string, JobRecord>();
const alerts: AlertRecord[] = [];
const supportCalls: SupportCallRecord[] = [];

const DEFAULT_BACKEND_API_URL = 'https://arox-api-993539509814.asia-south1.run.app/api';

function normalizeBackendApiUrl(url: string) {
  const trimmed = String(url || '').trim().replace(/\/$/, '');
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  return '';
}

function resolveBackendApiUrl() {
  const candidates = [
    process.env.BACKEND_API_URL,
    process.env.AROX_BACKEND_API_URL,
    process.env.VITE_PRINTER_BACKEND_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBackendApiUrl(candidate || '');
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_BACKEND_API_URL;
}

const BACKEND_API_URL = resolveBackendApiUrl();
const BACKEND_SERVICE_TOKEN = (process.env.BACKEND_SERVICE_TOKEN || process.env.AROX_SERVICE_TOKEN || '').trim();
const USE_LOCAL_MOCKS = process.env.NODE_ENV !== 'production' && process.env.KIOSK_WEB_ALLOW_MOCKS === 'true';
const BETTER_STACK_LOG_SOURCE_TOKEN = (process.env.BETTER_STACK_LOG_SOURCE_TOKEN || process.env.BETTER_STACK_SOURCE_TOKEN || '').trim();
const BETTER_STACK_LOG_INGESTING_HOST = (process.env.BETTER_STACK_LOG_INGESTING_HOST || process.env.BETTER_STACK_INGESTING_HOST || '').trim();

async function proxyBackend(pathname: string, init: RequestInit = {}) {
  if (!BACKEND_SERVICE_TOKEN) return null;
  const headers = new Headers(init.headers || {});
  headers.set('X-AROX-SERVICE-TOKEN', BACKEND_SERVICE_TOKEN);
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  const res = await fetch(`${BACKEND_API_URL}${pathname}`, {
    ...init,
    headers,
  });
  return res;
}

async function sendBackendResponse(res: express.Response, backendRes: Response) {
  const body = await backendRes.text();
  res.status(backendRes.status);
  const contentType = backendRes.headers.get('content-type') || 'application/json';
  res.type(contentType);
  res.send(body);
}

function normalizeCode(rawCode: string) {
  return rawCode.replace(/^ARX-/i, '').trim();
}

function kioskKey(kioskId: string | undefined) {
  return kioskId?.trim() || '1';
}

function getConsumables(kioskId: string) {
  const key = kioskKey(kioskId);
  const existing = consumablesByKiosk.get(key);
  if (existing) return existing;

  const created = { ...defaultConsumables };
  consumablesByKiosk.set(key, created);
  return created;
}

function updateConsumables(kioskId: string, next: Partial<ConsumablesState>) {
  const current = getConsumables(kioskKey(kioskId));
  const updated = {
    ...current,
    ...next,
    updated_at: new Date().toISOString(),
  };
  consumablesByKiosk.set(kioskKey(kioskId), updated);
  return updated;
}

function buildJobProfile(code: string) {
  const normalized = normalizeCode(code);

  if (normalized === '000000') {
    return null;
  }

  if (normalized === '999999') {
    return {
      upload_id: 'job-high-demand',
      filename: 'Bulk Print Job.pdf',
      pages: 250,
      copies: 2,
      color: false,
      estimated_time_seconds: 120,
      email: null,
    };
  }

  if (normalized === '654321') {
    return {
      upload_id: 'job-def-456',
      filename: 'Office Packet.pdf',
      pages: 10,
      copies: 2,
      color: true,
      estimated_time_seconds: 45,
      email: 'user@example.com',
    };
  }

  if (normalized === '123456') {
    return {
      upload_id: 'job-abc-123',
      filename: 'Pickup Document.pdf',
      pages: 5,
      copies: 1,
      color: false,
      estimated_time_seconds: 30,
      email: 'user@example.com',
    };
  }

  const digitSum = normalized
    .split('')
    .map((digit) => Number(digit))
    .filter((digit) => Number.isFinite(digit))
    .reduce((sum, digit) => sum + digit, 0);

  return {
    upload_id: `job-${normalized}`,
    filename: `Job ${normalized}`,
    pages: (digitSum % 6) + 3,
    copies: normalized.endsWith('0') ? 2 : 1,
    color: digitSum % 2 === 0,
    estimated_time_seconds: 30 + (digitSum % 5) * 10,
    email: 'user@example.com',
  };
}

function getOrCreateJob(code: string, kioskId: string) {
  const normalized = normalizeCode(code);
  const existing = jobsByPickupCode.get(normalized);
  if (existing) return existing;

  const profile = buildJobProfile(normalized);
  if (!profile) return null;

  const job: JobRecord = {
    pickup_code: normalized,
    kiosk_id: kioskId,
    otp: '000000',
    status: 'ready',
    ...profile,
  };

  jobsByPickupCode.set(normalized, job);
  jobsByUploadId.set(job.upload_id, job);
  return job;
}

function getSupportCall(callId: string) {
  return supportCalls.find((item) => item.id === callId) || null;
}

function getSupportToken(req: express.Request) {
  return String(req.header('X-AROX-CALL-TOKEN') || req.query.call_token || req.query.token || '').trim();
}

function requireBackendOrMock(res: express.Response, feature: string) {
  if (BACKEND_SERVICE_TOKEN) return true;
  if (USE_LOCAL_MOCKS) return true;
  res.status(503).json({ success: false, error: `${feature} is unavailable in production` });
  return false;
}

function normalizeBetterStackHost(host: string) {
  const trimmed = String(host || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/$/, '');
  }
  return `https://${trimmed.replace(/\/$/, '')}`;
}

function sanitizeTelemetryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetryValue(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (['password', 'secret', 'token', 'authorization', 'cookie', 'otp', 'pin', 'key'].some((part) => lowered.includes(part))) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitizeTelemetryValue(item);
      }
    }
    return output;
  }

  if (typeof value === 'string') {
    return value.slice(0, 2000);
  }

  return value;
}

async function forwardLogToBetterStack(payload: Record<string, unknown>) {
  if (!BETTER_STACK_LOG_SOURCE_TOKEN || !BETTER_STACK_LOG_INGESTING_HOST) {
    return false;
  }

  const endpoint = normalizeBetterStackHost(BETTER_STACK_LOG_INGESTING_HOST);
  if (!endpoint) return false;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BETTER_STACK_LOG_SOURCE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function logServerEvent(level: string, event: string, message: string, context: Record<string, unknown> = {}) {
  const payload = {
    dt: new Date().toISOString(),
    source: 'arox_web_kiosk',
    level,
    event,
    message,
    context: sanitizeTelemetryValue(context),
  };
  void forwardLogToBetterStack(payload);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      if (res.statusCode >= 500) {
        logServerEvent('error', 'http_5xx', `${req.method} ${req.path} failed`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        });
      }

      if (req.path.startsWith('/api/support/')) {
        logServerEvent('info', 'support_request', `${req.method} ${req.path}`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        });
      }
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (BACKEND_SERVICE_TOKEN) {
    app.get('/api/job/:code', async (req, res) => {
      const kioskId = String(req.query.kiosk_id || '').trim();
      const query = kioskId ? `?kiosk_id=${encodeURIComponent(kioskId)}` : '';
      const backendRes = await proxyBackend(`/job/${req.params.code}${query}`);
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.post('/api/job/:code/request_release_otp', async (req, res) => {
      const backendRes = await proxyBackend(`/job/${req.params.code}/request_release_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.post('/api/job/:code/verify_release_otp', async (req, res) => {
      const backendRes = await proxyBackend(`/job/${req.params.code}/verify_release_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.post('/api/job/:code/request_otp', async (req, res) => {
      const backendRes = await proxyBackend(`/job/${req.params.code}/request_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.post('/api/job/:code/verify_otp', async (req, res) => {
      const backendRes = await proxyBackend(`/job/${req.params.code}/verify_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.post('/api/release_job', async (req, res) => {
      const backendRes = await proxyBackend('/release_job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });

    app.get('/api/job_status/:uploadId', async (req, res) => {
      const backendRes = await proxyBackend(`/job_status/${req.params.uploadId}`);
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    });
  }

  app.get('/api/kiosks/:kiosk_id/consumables', (req, res) => {
    if (!requireBackendOrMock(res, 'Consumables route')) return;
    const kioskId = kioskKey(req.params.kiosk_id);
    const consumables = getConsumables(kioskId);
    res.json({
      paper_capacity: paperCapacity,
      paper_remaining: consumables.paper_remaining,
      toner_capacity: tonerCapacity,
      toner_remaining: consumables.toner_remaining,
      last_paper_refill: consumables.last_paper_refill,
      last_toner_refill: consumables.last_toner_refill,
      updated_at: consumables.updated_at,
    });
  });

  app.get('/api/job/:code', (req, res) => {
    if (!requireBackendOrMock(res, 'Job lookup route')) return;
    const kioskId = kioskKey(req.query.kiosk_id as string | undefined);
    const normalized = normalizeCode(req.params.code);

    if (normalized === '000000') {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    const valid = /^\d{6}$/.test(normalized);
    const arxValid = /^ARX-\d{6}$/i.test(req.params.code);
    if (!valid && !arxValid) {
      return res.status(400).json({ success: false, error: 'Pickup code must be 6 digits' });
    }

    const job = getOrCreateJob(req.params.code, kioskId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    res.json({
      success: true,
      upload_id: job.upload_id,
      filename: job.filename,
      pages: job.pages,
      copies: job.copies,
      color: job.color,
      status: job.status,
      estimated_time_seconds: job.estimated_time_seconds,
      email: job.email,
    });
  });

  app.post('/api/job/:code/request_release_otp', (req, res) => {
    if (!requireBackendOrMock(res, 'Release OTP route')) return;
    const kioskId = kioskKey(req.body?.kiosk_id || req.query?.kiosk_id);
    const job = getOrCreateJob(req.params.code, kioskId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    job.otp = '000000';
    return res.json({ success: true, message: 'OTP sent', destination: job.email ? 'email' : 'kiosk' });
  });

  app.post('/api/job/:code/verify_release_otp', (req, res) => {
    if (!requireBackendOrMock(res, 'Release OTP verification route')) return;
    const kioskId = kioskKey(req.body?.kiosk_id || req.query?.kiosk_id);
    const job = getOrCreateJob(req.params.code, kioskId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    const otp = String(req.body?.otp || '');
    if (otp === job.otp || otp === '000000') {
      return res.json({ success: true });
    }

    return res.status(401).json({ success: false, error: 'Invalid OTP' });
  });

  app.post('/api/release_job', (req, res) => {
    if (!requireBackendOrMock(res, 'Release job route')) return;
    const kioskId = kioskKey(req.body?.kiosk_id);
    const pickupCode = normalizeCode(String(req.body?.pickup_code || ''));
    const job = getOrCreateJob(pickupCode, kioskId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    const consumables = getConsumables(kioskId);
    const required = Math.max(1, job.pages) * Math.max(1, job.copies);

    if (consumables.paper_remaining < required || consumables.toner_remaining < required) {
      return res.status(400).json({ success: false, error: 'Insufficient consumables' });
    }

    updateConsumables(kioskId, {
      paper_remaining: consumables.paper_remaining - required,
      toner_remaining: consumables.toner_remaining - required,
      last_paper_refill: consumables.last_paper_refill,
      last_toner_refill: consumables.last_toner_refill,
    });

    // Let the VM own the live print-state transition.
    job.status = 'onKiosk';

    return res.json({ success: true, upload_id: job.upload_id, status: job.status });
  });

  app.get('/api/job_status/:uploadId', (req, res) => {
    if (!requireBackendOrMock(res, 'Job status route')) return;
    const job = jobsByUploadId.get(req.params.uploadId);
    res.json({
      success: true,
      upload_id: job?.upload_id || req.params.uploadId,
      job_status: job?.status || 'unknown',
      status: job?.status || 'unknown',
      payment_status: job ? 'Paid' : 'unknown',
      print_failed: false,
      pickup_code: job?.pickup_code || null,
      estimated_total_seconds: job?.estimated_time_seconds || 0,
    });
  });

  app.post('/api/kiosks/:kiosk_id/alerts', (req, res) => {
    if (!requireBackendOrMock(res, 'Kiosk alerts route')) return;
    const kioskId = kioskKey(req.params.kiosk_id);
    const alert: AlertRecord = {
      id: `alert-${Date.now()}`,
      kiosk_id: kioskId,
      alert_type: String(req.body?.alert_type || 'general_low'),
      source: String(req.body?.source || 'unknown'),
      severity: String(req.body?.severity || 'critical'),
      message: String(req.body?.message || ''),
      recipient_roles: Array.isArray(req.body?.recipient_roles) ? req.body.recipient_roles : ['admin', 'service'],
      extra: req.body?.extra && typeof req.body.extra === 'object' ? req.body.extra : {},
      created_at: new Date().toISOString(),
    };
    alerts.push(alert);
    res.json({ success: true, id: alert.id, alert_id: alert.id });
  });

  app.post('/api/support/calls', async (req, res) => {
    if (BACKEND_SERVICE_TOKEN) {
      const backendRes = await proxyBackend('/support/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    }

    if (!requireBackendOrMock(res, 'Support call creation')) return;

    const kioskId = kioskKey(req.body?.kiosk_id);
    logServerEvent('info', 'support_create', 'Support call created', { kioskId, category: String(req.body?.category || 'other') });
    const now = new Date().toISOString();
    const call: SupportCallRecord = {
      id: `call-${Date.now()}`,
      kiosk_id: kioskId,
      category: String(req.body?.category || 'other'),
      description: String(req.body?.description || ''),
      status: 'open',
      created_at: now,
      updated_at: now,
      connected_at: null,
      closed_at: null,
      access_token: crypto.randomUUID().replace(/-/g, ''),
    };
    supportCalls.push(call);
    res.json({ success: true, id: call.id, call_id: call.id, status: call.status, access_token: call.access_token, call });
  });

  app.get('/api/support/calls', async (req, res) => {
    if (BACKEND_SERVICE_TOKEN) {
      const query = new URLSearchParams();
      const status = String(req.query.status || '').trim();
      const kioskId = String(req.query.kiosk_id || '').trim();
      if (status) query.set('status', status);
      if (kioskId) query.set('kiosk_id', kioskId);
      const backendRes = await proxyBackend(`/support/calls${query.toString() ? `?${query.toString()}` : ''}`);
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    }

    if (!requireBackendOrMock(res, 'Support call list')) return;

    const status = String(req.query.status || '').trim().toLowerCase();
    const kioskId = String(req.query.kiosk_id || '').trim();
    logServerEvent('info', 'support_list', 'Support call list requested', { status: status || 'all', kioskId });

    const filtered = supportCalls.filter((call) => {
      const statusMatches = !status || call.status.toLowerCase() === status;
      const kioskMatches = !kioskId || call.kiosk_id === kioskId;
      return statusMatches && kioskMatches;
    });

    res.json({ success: true, calls: filtered });
  });

  app.get('/api/support/calls/:call_id', async (req, res) => {
    if (BACKEND_SERVICE_TOKEN) {
      const backendRes = await proxyBackend(`/support/calls/${req.params.call_id}`);
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    }

    if (!requireBackendOrMock(res, 'Support call fetch')) return;

    logServerEvent('info', 'support_get', 'Support call fetched', { callId: req.params.call_id });
    const call = getSupportCall(req.params.call_id);
    const token = getSupportToken(req);
    if (!call || call.access_token !== token) {
      return res.status(404).json({ success: false, error: 'Support call not found' });
    }

    return res.json({ success: true, call });
  });

  app.patch('/api/support/calls/:call_id', async (req, res) => {
    if (BACKEND_SERVICE_TOKEN) {
      const backendRes = await proxyBackend(`/support/calls/${req.params.call_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!backendRes) {
        return res.status(503).json({ success: false, error: 'Backend proxy not configured' });
      }
      return sendBackendResponse(res, backendRes);
    }

    if (!requireBackendOrMock(res, 'Support call update')) return;

    logServerEvent('info', 'support_update', 'Support call updated', { callId: req.params.call_id, nextStatus: String(req.body?.status || '') });
    const call = getSupportCall(req.params.call_id);
    const token = getSupportToken(req);
    if (!call || call.access_token !== token) {
      return res.status(404).json({ success: false, error: 'Support call not found' });
    }

    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    if (nextStatus !== 'closed') {
      return res.status(400).json({ success: false, error: 'Invalid support call status' });
    }

    call.status = nextStatus;
    call.updated_at = new Date().toISOString();
    if (!call.closed_at) {
      call.closed_at = call.updated_at;
    }

    return res.json({ success: true, call });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logServerEvent('info', 'server_start', 'Kiosk web server started', { port: PORT });
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();


