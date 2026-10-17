/**
 * Admin sign-in through Squawk (owner passkey). No password login exists.
 *
 * Flow: GET /api/auth/start → 302 Squawk /oauth/authorize (PKCE) → Squawk parks
 * the request and sends the browser to our /login?login_challenge=… → the page
 * runs the owner passkey ceremony (proxied through /owner/begin + /owner/finish
 * with the service token) → Squawk redirects to GET /api/auth/callback?code&state
 * → exchange, verify the token is the OWNER's, mint this app's admin JWT and hand
 * it to the SPA as `/login#token=…` (fragment, never query string).
 *
 * The JWT shape ({ admin: true }, JWT_SECRET, 7d) and GET /verify are unchanged,
 * so authMiddleware and every admin route keep working as before.
 */

import { Router, Request, Response } from 'express';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { SquawkClient, OwnerTokenVerifier, configFromEnv, mapSquawkError } from '../lib/squawk';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fantasydraft-secret-key';
const STATE_TTL_MS = 5 * 60_000;
const LOGIN_PAGE = '/login';

const cfg = configFromEnv();
const squawk = new SquawkClient(cfg);
const enabled = squawk.enabled();
const verifier = enabled ? new OwnerTokenVerifier(cfg.issuer, cfg.serviceId) : null;
if (!enabled) console.warn('SQUAWK_ISSUER is not set: admin sign-in is disabled (no password fallback exists).');

// Pending authorizations: state -> PKCE verifier (single container; 5 min TTL).
const pending = new Map<string, { verifier: string; exp: number }>();
const sweep = () => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
};
setInterval(sweep, 60_000).unref();

function str(v: unknown, max = 256): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function sendSquawkError(res: Response, err: unknown): void {
  const m = mapSquawkError(err);
  if (m.status === 502) console.warn('squawk upstream error:', err instanceof Error ? err.message : String(err));
  if (m.retryAfter) res.setHeader('Retry-After', String(m.retryAfter));
  res.status(m.status).json(m.body);
}

const loginError = (res: Response, code: string) =>
  res.redirect(302, `${LOGIN_PAGE}?${new URLSearchParams({ error: code })}`);

const router = Router();

router.get('/config', (_req, res) => {
  res.json({ enabled });
});

router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ valid: false });
    return;
  }
  try {
    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// Everything below needs Squawk.
router.use((_req, res, next) => {
  if (!enabled) return res.status(404).json({ error: 'not_found', message: 'Admin sign-in is not configured.' });
  next();
});

// ── start → Squawk → login page → callback ───────────────────────────────

router.get('/start', (_req, res) => {
  sweep();
  const verifierStr = randomBytes(48).toString('base64url'); // 64 chars, within RFC 7636's 43–128
  const challenge = createHash('sha256').update(verifierStr, 'ascii').digest('base64url');
  const state = randomBytes(24).toString('base64url');
  pending.set(state, { verifier: verifierStr, exp: Date.now() + STATE_TTL_MS });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: squawk.redirectUri(),
    state,
    scope: 'admin',
    resource: cfg.resource,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  res.redirect(302, `${cfg.issuer}/oauth/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const error = str(q.error);
  if (error) return loginError(res, error);
  const code = str(q.code, 512);
  const state = str(q.state);
  if (!code || !state) return loginError(res, 'invalid_request');
  const stashed = pending.get(state);
  pending.delete(state); // single use
  if (!stashed || stashed.exp < Date.now()) return loginError(res, 'state_mismatch');
  try {
    const tokens = await squawk.exchangeCode(code, stashed.verifier);
    const claims = await verifier!.verify(tokens.access_token ?? '');
    if (!claims) {
      console.warn('squawk access token failed verification (not a valid owner token)');
      return loginError(res, 'invalid_token');
    }
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
    console.log('admin signed in via squawk (owner)');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, `${LOGIN_PAGE}#${new URLSearchParams({ token })}`);
  } catch (err) {
    const m = mapSquawkError(err);
    console.warn('squawk code exchange failed:', err instanceof Error ? err.message : String(err));
    loginError(res, m.body.error);
  }
});

// ── Owner passkey ceremony proxies ───────────────────────────────────────

router.post('/owner/begin', async (req, res) => {
  const loginChallenge = str(obj(req.body)?.login_challenge);
  if (!loginChallenge) {
    res.status(400).json({ error: 'invalid_request', message: 'A login challenge is required.' });
    return;
  }
  try {
    const out = await squawk.loginOwnerBegin(loginChallenge);
    res.json({ challenge_id: out.challenge_id, options: out.options });
  } catch (err) {
    sendSquawkError(res, err);
  }
});

router.post('/owner/finish', async (req, res) => {
  const body = obj(req.body) ?? {};
  const challengeId = str(body.challenge_id);
  const credential = obj(body.credential);
  if (!challengeId || !credential) {
    res.status(400).json({ error: 'invalid_request', message: 'A challenge id and a credential are required.' });
    return;
  }
  try {
    const out = await squawk.loginOwnerFinish(challengeId, credential);
    res.json({ redirect_to: out.redirect_to });
  } catch (err) {
    sendSquawkError(res, err);
  }
});

export default router;
