export interface PrintJob {
  id: string;
  filename: string;
  pages: number;
  copies: number;
  color: boolean;
  status: string;
  pickup_code: string;
  estimated_time_seconds: number;
  email: string | null;
}

export interface Consumables {
  paper_capacity: number;
  paper_remaining: number;
  toner_capacity: number;
  toner_remaining: number;
  last_paper_refill: string;
  last_toner_refill: string;
  updated_at: string;
}
