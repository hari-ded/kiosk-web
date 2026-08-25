const DEFAULT_BACKEND_API_URL = 'https://arox-api-993539509814.asia-south1.run.app/api';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
  'upgrade',
]);

function getBackendApiBase(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.AROX_BACKEND_API_URL ||
    process.env.VITE_PRINTER_BACKEND_URL ||
    DEFAULT_BACKEND_API_URL
  ).replace(/\/+$|\s+$/g, '');
}

function getForwardPath(req: any): string {
  const queryPath = req.query?.path;
  if (Array.isArray(queryPath)) {
    return `/${queryPath.join('/')}`;
  }
  if (typeof queryPath === 'string' && queryPath.trim()) {
    return queryPath.startsWith('/') ? queryPath : `/${queryPath}`;
  }

  const incomingUrl = new URL(req.url ?? '/api/proxy-all', 'http://localhost');
  const fallback = incomingUrl.pathname.replace(/^\/api\/proxy-all/, '').replace(/^\/api/, '') || '/';
  return fallback.startsWith('/') ? fallback : `/${fallback}`;
}

function getForwardUrl(req: any): string {
  const backendBase = new URL(getBackendApiBase());
  const forwardPath = getForwardPath(req);
  const query = new URL(req.url ?? '/api/proxy-all', 'http://localhost').searchParams;
  query.delete('path');

  backendBase.pathname = `${backendBase.pathname.replace(/\/+$/, '')}${forwardPath}`;
  backendBase.search = query.toString() ? `?${query.toString()}` : '';
  return backendBase.toString();
}

function forwardBody(req: any): BodyInit | undefined {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
    return req.body;
  }

  return JSON.stringify(req.body);
}

export default async function handler(req: any, res: any) {
  try {
    const backendToken = process.env.BACKEND_SERVICE_TOKEN?.trim();
    const targetUrl = getForwardUrl(req);
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lowerKey = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    if (backendToken) {
      headers['X-AROX-SERVICE-TOKEN'] = backendToken;
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: forwardBody(req),
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy failed';
    res.status(500).json({
      error: 'Proxy failed',
      message,
    });
  }
}
