import express from 'express';
import cors from 'cors';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
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
