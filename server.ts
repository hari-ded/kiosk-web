import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Mock state
let currentPaper = 200;
let currentToner = 300;
const paperCapacity = 500;
const tonerCapacity = 1000;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. GET /api/kiosks/{kiosk_id}/consumables
  app.get('/api/kiosks/:kiosk_id/consumables', (req, res) => {
    res.json({
      paper_capacity: paperCapacity,
      paper_remaining: currentPaper,
      toner_capacity: tonerCapacity,
      toner_remaining: currentToner,
      last_paper_refill: new Date().toISOString(),
      last_toner_refill: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  // 2. GET /api/job/{code}?kiosk_id={kiosk_id}
  app.get('/api/job/:code', (req, res) => {
    const { code } = req.params;
    
    // Reject 000000 to allow testing the failure state
    if (code === '000000' || code === 'ARX-000000') {
      return res.status(404).json({ success: false, error: 'Invalid pickup code' });
    }

    // Simulate code requiring more consumables than available
    if (code === '999999' || code === 'ARX-999999') {
      return res.json({
        success: true,
        upload_id: 'job-high-demand',
        pages: 250,
        copies: 2,
        color: false,
        status: 'ready',
        estimated_time_seconds: 120,
        email: null
      });
    }

    // Accept all other codes for testing
    return res.json({
      success: true,
      upload_id: `job-${code}`,
      pages: 5,
      copies: 1,
      color: false,
      status: 'ready',
      estimated_time_seconds: 30,
      email: 'user@example.com'
    });
  });

  // 3. POST /api/job/{code}/request_release_otp
  app.post('/api/job/:code/request_release_otp', (req, res) => {
    res.json({ success: true, message: 'OTP sent' });
  });

  // 4. POST /api/job/{code}/verify_release_otp
  app.post('/api/job/:code/verify_release_otp', (req, res) => {
    const { otp } = req.body;
    if (otp === '000000') { // Let 000000 be the valid mock OTP
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid OTP' });
    }
  });

  let jobStatuses: Record<string, string> = {};

  // 5. POST /api/release_job
  app.post('/api/release_job', (req, res) => {
    const { pickup_code } = req.body;
    
    // deduct consumables (mock)
    let pages = 5;
    let copies = 1;
    if (pickup_code === '654321' || pickup_code === 'ARX-654321') {
      pages = 10;
      copies = 2;
    } else if (pickup_code === '999999' || pickup_code === 'ARX-999999') {
      pages = 250;
      copies = 2;
    }
    const required = Math.max(1, pages) * Math.max(1, copies);
    
    if (currentPaper < required || currentToner < required) {
      return res.status(400).json({ success: false, error: 'Insufficient consumables' });
    }

    currentPaper -= required;
    currentToner -= required;
    
    const upload_id = pickup_code === '123456' || pickup_code === 'ARX-123456' ? 'job-abc-123' : 
                      pickup_code === '654321' || pickup_code === 'ARX-654321' ? 'job-def-456' : 'job-high-demand';
    
    jobStatuses[upload_id] = 'printing';
    
    // Simulate finishing the print
    setTimeout(() => {
      jobStatuses[upload_id] = 'completed';
    }, 10000); // 10 seconds of printing

    res.json({ success: true });
  });

  // 6. GET /api/job_status/{uploadId}
  app.get('/api/job_status/:uploadId', (req, res) => {
    const { uploadId } = req.params;
    res.json({ status: jobStatuses[uploadId] || 'unknown' });
  });

  // 7. POST /api/kiosks/{kiosk_id}/alerts
  app.post('/api/kiosks/:kiosk_id/alerts', (req, res) => {
    res.json({ success: true });
  });

  // 8. POST /api/support/calls
  app.post('/api/support/calls', (req, res) => {
    res.json({ success: true, call_id: 'call-123' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
