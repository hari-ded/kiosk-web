import { proxyToBackend } from './_proxy';

export default async function handler(req: any, res: any) {
  const raw = req.query.path;
  const segments = Array.isArray(raw)
    ? raw.map((part) => String(part).trim()).filter(Boolean)
    : typeof raw === 'string' && raw.trim()
      ? raw.split('/').map((part) => part.trim()).filter(Boolean)
      : [];

  await proxyToBackend(req, res, segments);
}