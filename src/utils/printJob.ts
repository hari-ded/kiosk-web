import { PrintJob } from '../types';

const DEFAULT_PAGES_PER_SHEET = 1;
const DEFAULT_DUPLEX = false;
const DEFAULT_ORIENTATION = 'Portrait';
const FIXED_SPOOL_DELAY_SECONDS = 2.5;
const SIMPLEX_SECONDS_PER_SHEET = 0.5;
// Duplex sheets take about 3–4 seconds to print both sides on the kiosk.
const DUPLEX_SECONDS_PER_SHEET = 3.5;

export interface PrintJobSummary {
  orientation: string;
  pagesPerSheet: number;
  duplex: boolean;
  copies: number;
  totalSheets: number;
  printSeconds: number;
  totalWaitSeconds: number;
}

export function summarizePrintJob(job: PrintJob): PrintJobSummary {
  const pagesPerSheet = Math.max(1, job.pages_per_sheet ?? DEFAULT_PAGES_PER_SHEET);
  const copies = Math.max(1, job.copies);
  const duplex = job.duplex ?? DEFAULT_DUPLEX;
  const orientation = job.orientation || DEFAULT_ORIENTATION;

  const pagesPerPhysicalSheet = pagesPerSheet * (duplex ? 2 : 1);
  const sheetsPerCopy = Math.max(1, Math.ceil(job.pages / pagesPerPhysicalSheet));
  const secondsPerSheet = duplex ? DUPLEX_SECONDS_PER_SHEET : SIMPLEX_SECONDS_PER_SHEET;
  const totalSheets = sheetsPerCopy * copies;
  const printSeconds = totalSheets * secondsPerSheet;
  const totalWaitSeconds = FIXED_SPOOL_DELAY_SECONDS + printSeconds;

  return {
    orientation,
    pagesPerSheet,
    duplex,
    copies,
    totalSheets,
    printSeconds,
    totalWaitSeconds
  };
}

export function formatSeconds(seconds: number) {
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
}

export function getDisplayFilename(filename: string) {
  return filename.replace(/^\d{8}_\d{6}_[^_]+_(.+)$/, '$1');
}

export function getFixedSpoolDelaySeconds() {
  return FIXED_SPOOL_DELAY_SECONDS;
}
