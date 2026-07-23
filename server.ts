import express from 'express';
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/kiosks/:kiosk_id/consumables', (req, res) => {
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
    const kioskId = kioskKey(req.body?.kiosk_id || req.query?.kiosk_id);
    const job = getOrCreateJob(req.params.code, kioskId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    job.otp = '000000';
    return res.json({ success: true, message: 'OTP sent', destination: job.email ? 'email' : 'kiosk' });
  });

  app.post('/api/job/:code/verify_release_otp', (req, res) => {
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

    job.status = 'printing';
    setTimeout(() => {
      const liveJob = jobsByUploadId.get(job.upload_id);
      if (liveJob && liveJob.status === 'printing') {
        liveJob.status = 'completed';
      }
    }, Math.max(5000, job.estimated_time_seconds * 1000));

    return res.json({ success: true, upload_id: job.upload_id, status: job.status });
  });

  app.get('/api/job_status/:uploadId', (req, res) => {
    const job = jobsByUploadId.get(req.params.uploadId);
    res.json({ status: job?.status || 'unknown' });
  });

  app.post('/api/kiosks/:kiosk_id/alerts', (req, res) => {
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

  app.post('/api/support/calls', (req, res) => {
    const kioskId = kioskKey(req.body?.kiosk_id);
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
    };
    supportCalls.push(call);
    res.json({ success: true, id: call.id, call_id: call.id, status: call.status, call });
  });

  app.get('/api/support/calls', (req, res) => {
    const status = String(req.query.status || '').trim().toLowerCase();
    const kioskId = String(req.query.kiosk_id || '').trim();

    const filtered = supportCalls.filter((call) => {
      const statusMatches = !status || call.status.toLowerCase() === status;
      const kioskMatches = !kioskId || call.kiosk_id === kioskId;
      return statusMatches && kioskMatches;
    });

    res.json({ success: true, calls: filtered });
  });

  app.get('/api/support/calls/:call_id', (req, res) => {
    const call = getSupportCall(req.params.call_id);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Support call not found' });
    }

    return res.json({ success: true, call });
  });

  app.patch('/api/support/calls/:call_id', (req, res) => {
    const call = getSupportCall(req.params.call_id);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Support call not found' });
    }

    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    if (!['open', 'connected', 'closed'].includes(nextStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid support call status' });
    }

    call.status = nextStatus;
    call.updated_at = new Date().toISOString();
    if (nextStatus === 'connected' && !call.connected_at) {
      call.connected_at = call.updated_at;
    }
    if (nextStatus === 'closed') {
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
