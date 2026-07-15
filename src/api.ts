import { PrintJob, Consumables } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'https://arox-api-993539509814.asia-south1.run.app/api';
const KIOSK_ID = import.meta.env.VITE_KIOSK_ID || '1';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

export async function fetchConsumables(): Promise<Consumables> {
  const res = await fetch(`${API_URL}/kiosks/${KIOSK_ID}/consumables`, {
    cache: 'no-store',
    headers: defaultHeaders
  });
  if (!res.ok) throw new Error('Failed to fetch consumables');
  const data = await res.json();
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
    
    // Fallback if exactly 6 digits
    if (!res.ok && /^\d{6}$/.test(code)) {
      res = await fetch(`${API_URL}/job/ARX-${code}?kiosk_id=${KIOSK_ID}`, { cache: 'no-store', headers: defaultHeaders });
    }
    
    const data = await res.json();
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
        status: data.status || 'unknown',
        pickup_code: code,
        estimated_time_seconds: Number(data.estimated_time_seconds) || 0,
        email: data.email || null
      }
    };
  } catch (error) {
    return { error: 'Network error or server unavailable' };
  }
}

export async function requestOtp(code: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/job/${code}/request_release_otp`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID })
  });
  const data = await res.json();
  return data.success;
}

export async function verifyOtp(code: string, otp: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/job/${code}/verify_release_otp`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID, otp })
  });
  const data = await res.json();
  return data.success;
}

export async function releaseJob(code: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/release_job`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ pickup_code: code, kiosk_id: KIOSK_ID })
  });
  const data = await res.json();
  return data.success;
}

export async function checkJobStatus(uploadId: string): Promise<string> {
  const res = await fetch(`${API_URL}/job_status/${uploadId}`, { cache: 'no-store', headers: defaultHeaders });
  const data = await res.json();
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

export async function createSupportCall(category: string, description: string = ''): Promise<any> {
  const res = await fetch(`${API_URL}/support/calls`, {
    method: 'POST',
    cache: 'no-store',
    headers: defaultHeaders,
    body: JSON.stringify({ kiosk_id: KIOSK_ID, category, description })
  });
  if (!res.ok) throw new Error('Failed to create support call');
  return res.json();
}
