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
import apiRouter from './routes/api';
import showsRouter from './routes/shows';
import seasonsRouter from './routes/seasons';
import leaguesRouter from './routes/leagues';
import kpiRouter from './routes/kpi';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

// API routes
app.use('/api/kpi', kpiRouter);
app.use('/api', apiRouter);
app.use('/api/auth', authRouter);
app.use('/api/shows', showsRouter);
app.use('/api', seasonsRouter);
app.use('/api', leaguesRouter);
app.use('/api', playersRouter);   // scoped: /api/seasons/:seasonId/players, legacy: /api/players/*
app.use('/api/players', playersRouter);  // legacy mount for /api/players/:id
app.use('/api', teamsRouter);    // scoped: /api/leagues/:leagueId/teams
app.use('/api/teams', teamsRouter);      // legacy mount
app.use('/api', draftRouter);    // scoped: /api/leagues/:leagueId/draft/*
app.use('/api/draft', draftRouter);      // legacy mount
app.use('/api', scoringRouter);  // scoped: /api/shows/:showSlug/rules, /api/seasons/:seasonId/scoring/*
app.use('/api/scoring', scoringRouter);  // legacy mount
app.use('/api', summaryRouter);  // scoped: /api/leagues/:leagueId/summary/*
app.use('/api/summary', summaryRouter);  // legacy mount
app.use('/api', tribesRouter);   // scoped: /api/seasons/:seasonId/tribes
app.use('/api/tribes', tribesRouter);    // legacy mount
app.use('/api', gamestateRouter); // scoped: /api/seasons/:seasonId/gamestate/*
app.use('/api/gamestate', gamestateRouter); // legacy mount

// Health check at root level (before static catch-all)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Serve static frontend in production
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));
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

start().catch(console.error);
