import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import { initDB } from './db';
import authRouter, { initAuth } from './routes/auth';
import playersRouter from './routes/players';
import teamsRouter from './routes/teams';
import draftRouter from './routes/draft';
import scoringRouter from './routes/scoring';
import summaryRouter from './routes/summary';
import tribesRouter from './routes/tribes';
import gamestateRouter from './routes/gamestate';
import showsRouter from './routes/shows';
import seasonsRouter from './routes/seasons';
import leaguesRouter from './routes/leagues';
import kpiRouter from './routes/kpi';
import homeRouter from './routes/home';
import extractRouter from './routes/extract';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Bug report → flightdeck
app.post('/api/bug-report', async (req, res) => {
  const key = process.env.FLIGHTDECK_INGEST_KEY;
  if (!key) return res.status(503).json({ error: 'Bug reporting is not configured.' });
  const { message, severity, url, meta } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A description is required.' });
  }
  const base = (process.env.FLIGHTDECK_URL || 'http://flightdeck:8080').replace(/\/$/, '');
  try {
    const r = await fetch(base + '/api/ingest/bug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({
        site: 'survivor50',
        url: url || '',
        message: message.trim().slice(0, 5000),
        severity: ['low', 'med', 'high', 'urgent'].includes(severity) ? severity : 'med',
        meta: meta || {},
      }),
    });
    if (!r.ok) throw new Error('ingest ' + r.status);
    const created = await r.json().catch(() => null) as { id?: string } | null;
    res.json({ ok: true, id: created?.id });
  } catch (err) {
    console.error('bug-report forward failed:', err);
    res.status(502).json({ error: 'Could not reach the bug tracker.' });
  }
});

// Bug report screenshots → flightdeck attachments (max 4 images, 8MB each)
const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 4, fileSize: 8 * 1024 * 1024 },
}).array('files', 4);

app.post('/api/bug-report/:id/screenshots', (req, res) => {
  const key = process.env.FLIGHTDECK_INGEST_KEY;
  if (!key) return res.status(503).json({ error: 'Bug reporting is not configured.' });
  const itemId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
    return res.status(400).json({ error: 'Invalid report id.' });
  }
  screenshotUpload(req, res, async (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each screenshot must be 8MB or smaller.' });
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Up to 4 screenshots per report.' });
      }
      return res.status(400).json({ error: 'Could not read the upload.' });
    }
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: 'No screenshots attached.' });
    if (files.some((f) => !SCREENSHOT_TYPES.has(f.mimetype))) {
      return res.status(400).json({ error: 'Screenshots must be PNG, JPEG, WebP, or GIF images.' });
    }
    const base = (process.env.FLIGHTDECK_URL || 'http://flightdeck:8080').replace(/\/$/, '');
    try {
      const form = new FormData();
      for (const f of files) {
        form.append('files', new Blob([new Uint8Array(f.buffer)], { type: f.mimetype }), f.originalname || 'screenshot.png');
      }
      const r = await fetch(`${base}/api/ingest/attachments/${itemId}`, {
        method: 'POST',
        headers: { 'X-API-Key': key },
        body: form,
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('screenshot forward rejected:', r.status, detail.slice(0, 500));
        return res.status(r.status === 404 || r.status === 400 || r.status === 410 ? 400 : 502)
          .json({ error: 'Could not attach screenshots.' });
      }
      const body = await r.json().catch(() => []);
      res.status(201).json({ ok: true, attachments: body });
    } catch (e) {
      console.error('screenshot forward failed:', e);
      res.status(502).json({ error: 'Could not reach the bug tracker.' });
    }
  });
});

// API routes — every data route is scoped by show / season / league.
app.use('/api/kpi', kpiRouter);
app.use('/api/auth', authRouter);
app.use('/api/shows', showsRouter);
app.use('/api', homeRouter);      // /featured, /hall-of-fame, /leagues/:id/recap
app.use('/api', seasonsRouter);   // /shows/:slug/seasons, /seasons/:id
app.use('/api', leaguesRouter);   // /seasons/:id/leagues, /leagues/:id, /leagues/join/:code
app.use('/api', playersRouter);   // /seasons/:id/players, /players/:id
app.use('/api', teamsRouter);     // /leagues/:id/teams, /teams/:id
app.use('/api', draftRouter);     // /leagues/:id/draft/*
app.use('/api', scoringRouter);   // /shows/:slug/rules, /rules/:id, /seasons/:id/scoring/events
app.use('/api', extractRouter);   // /seasons/:id/scoring/extract (AI-proposed events, admin reviews)
app.use('/api', summaryRouter);   // /leagues/:id/summary/*, /leagues/:id/recaps
app.use('/api', tribesRouter);    // /seasons/:id/tribes, /tribes/:id
app.use('/api', gamestateRouter); // /seasons/:id/gamestate/*

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve static frontend in production
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath, { maxAge: '1h', index: false }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

async function start() {
  await initDB();
  await initAuth();
  app.listen(PORT, () => {
    console.log(`Fantasy Draft API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
