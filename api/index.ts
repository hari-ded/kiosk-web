import { proxyToBackend } from './_proxy';

export default async function handler(req: any, res: any) {
  await proxyToBackend(req, res, []);
}