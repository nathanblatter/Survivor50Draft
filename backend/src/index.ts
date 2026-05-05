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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRouter);
app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/draft', draftRouter);
app.use('/api/scoring', scoringRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/tribes', tribesRouter);
app.use('/api/gamestate', gamestateRouter);

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
    console.log(`Survivor 50 Draft API running on port ${PORT}`);
  });
}

start().catch(console.error);
