export default function handler(req: any, res: any) {
  res.status(200).json({
    ok: true,
    service: 'kiosk-web',
    method: String(req.method || 'GET').toUpperCase(),
  });
}