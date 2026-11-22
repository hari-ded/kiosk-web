import { PrintJob } from '../types';

// "Print all": the files still to print in this visit, one after another.
const QUEUE_KEY = 'arox_print_queue';

type Queue = { ids: string[]; total: number };

function read(): Queue | null {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Queue) : null;
    return parsed && Array.isArray(parsed.ids) ? parsed : null;
  } catch {
    return null;
  }
}

export function startQueue(jobs: PrintJob[]) {
  const ids = jobs.map((job) => String(job.id));
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ ids, total: ids.length }));
}

export function clearQueue() {
  sessionStorage.removeItem(QUEUE_KEY);
}

/** "File 2 of 4" for the given job, or null when not printing a batch. */
export function queuePosition(jobId: string | number): { index: number; total: number } | null {
  const queue = read();
  if (!queue || queue.total < 2) return null;
  const done = queue.total - queue.ids.length;
  const at = queue.ids.indexOf(String(jobId));
  return at === -1 ? null : { index: done + at + 1, total: queue.total };
}

/** Mark `jobId` done and return the next file to print, if any. */
export function takeNext(jobId: string | number): PrintJob | null {
  const queue = read();
  if (!queue) return null;
  const ids = queue.ids.filter((id) => id !== String(jobId));
  if (!ids.length) {
    clearQueue();
    return null;
  }
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ ...queue, ids }));
  try {
    const jobs = JSON.parse(sessionStorage.getItem('arox_pickup_jobs') || '[]') as PrintJob[];
    const next = jobs.find((job) => String(job.id) === ids[0]);
    if (!next) clearQueue();
    return next || null;
  } catch {
    clearQueue();
    return null;
  }
}
