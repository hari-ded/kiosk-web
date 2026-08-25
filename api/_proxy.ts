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

function getBackendApiUrl() {
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

function getServiceToken() {
  return String(process.env.BACKEND_SERVICE_TOKEN || process.env.AROX_SERVICE_TOKEN || '').trim();
}

function getPathSegments(req: any): string[] {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.map((part) => String(part).trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return raw.split('/').map((part) => part.trim()).filter(Boolean);
  return [];
}

function normalizeBackendPath(segments: string[]) {
  const path = `/${segments.join('/')}`;
  return path === '/' ? '' : path;
}

function copyRequestHeaders(req: any) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (['host', 'content-length', 'connection'].includes(lower)) continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else {
      headers.set(key, String(value));
    }
  }

  const serviceToken = getServiceToken();
  if (serviceToken) {
    headers.set('X-AROX-SERVICE-TOKEN', serviceToken);
  }

  return headers;
}

async function proxyToBackend(req: any, res: any, segments: string[]) {
  try {
    const backendBase = getBackendApiUrl();
    const incomingUrl = new URL(req.url || '/', 'http://localhost');
    const backendUrl = new URL(`${backendBase}${normalizeBackendPath(segments)}`);
    backendUrl.search = incomingUrl.search;

    const method = String(req.method || 'GET').toUpperCase();
    const headers = copyRequestHeaders(req);
    const init: RequestInit = { method, headers };

    if (!['GET', 'HEAD'].includes(method)) {
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        init.body = req.body;
      } else if (req.body !== undefined) {
        init.body = JSON.stringify(req.body);
        if (!headers.has('content-type')) {
          headers.set('Content-Type', 'application/json');
        }
      }
    }

    const backendRes = await fetch(backendUrl.toString(), init);
    const body = await backendRes.text();

    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (['content-length', 'connection', 'transfer-encoding'].includes(lower)) return;
      res.setHeader(key, value);
    });

    if (!res.getHeader('content-type')) {
      res.setHeader('content-type', backendRes.headers.get('content-type') || 'application/json');
    }

    res.send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Proxy failed');
    res.status(500).json({
      error: 'Proxy failed',
      message,
    });
  }
}

export { proxyToBackend };