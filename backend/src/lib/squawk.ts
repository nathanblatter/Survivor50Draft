/**
 * Squawk client — Nathan's auth service (https://squawk.nathanblatter.com).
 *
 * This app has no end users: the only account is the Squawk OWNER, who signs in
 * with a passkey. Everything that talks to Squawk lives here:
 *
 * - a cached service token (client_credentials with the service credential),
 *   which authenticates our backend when it drives the owner passkey ceremony
 *   on behalf of the /login page;
 * - the two owner-ceremony calls (/v1/login/owner/begin|finish);
 * - the authorization-code exchange at /oauth/token (public PKCE client);
 * - a JWKS verifier for the access token that exchange returns (ES256,
 *   iss == SQUAWK_ISSUER, aud == SQUAWK_SERVICE_ID, sub == "owner" — nothing else).
 *
 * When SQUAWK_ISSUER is empty `enabled()` is false and the auth routes answer
 * 404. There is intentionally no password fallback.
 */

import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'crypto';

export interface SquawkConfig {
  issuer: string;
  serviceId: string;
  credential: string;
  clientId: string;
  resource: string;
  siteUrl: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SquawkConfig {
  return {
    issuer: (env.SQUAWK_ISSUER ?? '').replace(/\/+$/, ''),
    serviceId: env.SQUAWK_SERVICE_ID ?? '',
    credential: env.SQUAWK_CREDENTIAL ?? '',
    clientId: env.SQUAWK_CLIENT_ID ?? '',
    resource: env.SQUAWK_RESOURCE ?? '',
    siteUrl: (env.SQUAWK_SITE_URL ?? 'https://survivor.nathanblatter.com').replace(/\/+$/, ''),
  };
}

const HTTP_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_MARGIN_S = 30;
const JWKS_TTL_MS = 5 * 60_000;
export const OWNER_SUBJECT = 'owner';

export class SquawkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail = '',
    public readonly retryAfter: number | null = null,
  ) {
    super(`squawk ${status} ${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'SquawkError';
  }
}

type Json = Record<string, unknown>;

async function raiseFor(resp: Response): Promise<void> {
  if (resp.ok) return;
  let code = 'server_error';
  let detail = '';
  const text = await resp.text().catch(() => '');
  try {
    const body = JSON.parse(text) as Json;
    if (typeof body.error === 'string' && body.error) code = body.error;
    const d = body.detail ?? body.error_description;
    if (typeof d === 'string') detail = d;
  } catch {
    detail = text.slice(0, 200);
  }
  const ra = resp.headers.get('Retry-After');
  const retryAfter = ra && /^\d+$/.test(ra) ? parseInt(ra, 10) : null;
  throw new SquawkError(resp.status, code, detail, retryAfter);
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
}

export class SquawkClient {
  private serviceToken: string | null = null;
  private serviceTokenExp = 0; // unix seconds

  constructor(readonly cfg: SquawkConfig) {}

  enabled(): boolean {
    return Boolean(this.cfg.issuer);
  }

  redirectUri(): string {
    return `${this.cfg.siteUrl}/api/auth/callback`;
  }

  // ── Service token ────────────────────────────────────────────────────────

  resetServiceToken(): void {
    this.serviceToken = null;
    this.serviceTokenExp = 0;
  }

  async getServiceToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.serviceToken && now < this.serviceTokenExp - TOKEN_REFRESH_MARGIN_S) return this.serviceToken;
    const resp = await fetchWithTimeout(`${this.cfg.issuer}/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.cfg.serviceId,
        client_secret: this.cfg.credential,
      }),
    });
    await raiseFor(resp);
    const body = (await resp.json()) as { access_token: string; expires_in?: number };
    this.serviceToken = body.access_token;
    this.serviceTokenExp = now + (typeof body.expires_in === 'number' ? body.expires_in : 900);
    return this.serviceToken;
  }

  /** Authenticated call to /v1/*; retries once with a fresh service token on 401 invalid_token. */
  async call<T = Json>(method: string, path: string, opts: { json?: unknown; params?: Record<string, string> } = {}): Promise<T> {
    const url = new URL(`${this.cfg.issuer}${path}`);
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
    const doFetch = async (): Promise<Response> =>
      fetchWithTimeout(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${await this.getServiceToken()}`,
          ...(opts.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      });
    let resp = await doFetch();
    if (resp.status === 401) {
      const text = await resp.clone().text().catch(() => '');
      if (text.includes('invalid_token')) {
        this.resetServiceToken();
        resp = await doFetch();
      }
    }
    await raiseFor(resp);
    if (resp.status === 204) return {} as T;
    return (await resp.json()) as T;
  }

  // ── Owner passkey ceremony (driven for the /login page) ──────────────────

  loginOwnerBegin(loginChallenge: string) {
    return this.call<{ challenge_id: string; options: Json }>('POST', '/v1/login/owner/begin', {
      json: { login_challenge: loginChallenge },
    });
  }

  loginOwnerFinish(challengeId: string, credential: Json) {
    return this.call<{ redirect_to: string; subject?: string }>('POST', '/v1/login/owner/finish', {
      json: credential,
      params: { challenge: challengeId },
    });
  }

  // ── Authorization-code exchange ──────────────────────────────────────────

  async exchangeCode(code: string, codeVerifier: string): Promise<{ access_token: string; expires_in?: number; scope?: string }> {
    const resp = await fetchWithTimeout(`${this.cfg.issuer}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.cfg.clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.redirectUri(),
      }),
    });
    await raiseFor(resp);
    return (await resp.json()) as { access_token: string; expires_in?: number; scope?: string };
  }
}

// ── Access-token verification (owner only) ─────────────────────────────────

export interface OwnerClaims {
  iss: string;
  sub: typeof OWNER_SUBJECT;
  aud: string;
  exp: number;
  iat: number;
  scope?: string;
}

// Node's crypto JsonWebKey plus the kid we cache by.
type Jwk = JsonWebKey & { kid?: string };

const b64urlDecode = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** DER-encode a raw r||s ECDSA signature (64 bytes) for Node's verifier. */
function rawToDer(sig: Buffer): Buffer {
  if (sig.length !== 64) throw new Error('bad signature length');
  const enc = (n: Buffer) => {
    let i = 0;
    while (i < n.length - 1 && n[i] === 0) i++;
    let v = n.subarray(i);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return Buffer.concat([Buffer.from([0x02, v.length]), v]);
  };
  const body = Buffer.concat([enc(sig.subarray(0, 32)), enc(sig.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

export class OwnerTokenVerifier {
  private keys = new Map<string, Jwk>();
  private fetchedAt = 0;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly fetchJwks: () => Promise<{ keys: Jwk[] }> = async () => {
      const r = await fetchWithTimeout(`${issuer}/.well-known/jwks.json`, { method: 'GET' });
      if (!r.ok) throw new Error(`jwks ${r.status}`);
      return (await r.json()) as { keys: Jwk[] };
    },
    private readonly leewaySeconds = 30,
  ) {
    if (!issuer || !audience) throw new Error('issuer and audience are required');
  }

  private async resolveKey(kid: string): Promise<Jwk | null> {
    const stale = Date.now() - this.fetchedAt > JWKS_TTL_MS;
    if (!stale && this.keys.has(kid)) return this.keys.get(kid)!;
    const { keys } = await this.fetchJwks();
    this.keys = new Map(keys.filter((k) => typeof k.kid === 'string').map((k) => [k.kid!, k]));
    this.fetchedAt = Date.now();
    return this.keys.get(kid) ?? null;
  }

  /** Claims when the token is a valid, verified OWNER token for this service; null otherwise. Never throws. */
  async verify(token: string): Promise<OwnerClaims | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const header = JSON.parse(b64urlDecode(parts[0]).toString('utf8')) as { alg?: string; kid?: string };
      if (header.alg !== 'ES256' || typeof header.kid !== 'string') return null;
      const jwk = await this.resolveKey(header.kid);
      if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null;
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      const ok = cryptoVerify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), key, rawToDer(b64urlDecode(parts[2])));
      if (!ok) return null;

      const claims = JSON.parse(b64urlDecode(parts[1]).toString('utf8')) as Partial<OwnerClaims>;
      const now = Date.now() / 1000;
      if (claims.iss !== this.issuer) return null;
      if (claims.aud !== this.audience) return null;
      if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number') return null;
      if (claims.exp + this.leewaySeconds < now) return null;
      if (claims.iat - this.leewaySeconds > now) return null;
      if (claims.sub !== OWNER_SUBJECT) return null;
      return claims as OwnerClaims;
    } catch {
      return null;
    }
  }
}

// ── Error mapping for the JSON routes ──────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  passkey_rejected: 'Passkey not recognized.',
  setup_required: 'The Squawk owner has no passkey yet. Set one up in the Squawk console.',
  service_not_configured: 'This site is not configured in Squawk (missing origins).',
  too_many_attempts: 'Too many attempts. Try again later.',
  not_found: 'This sign-in attempt expired. Start over.',
};

export interface MappedError {
  status: number;
  body: { error: string; message: string };
  retryAfter: number | null;
}

/** Map any failure from a Squawk call to a clean JSON response. */
export function mapSquawkError(err: unknown): MappedError {
  if (err instanceof SquawkError) {
    const status = [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
    const message =
      status === 502
        ? 'Sign-in service unavailable. Try again.'
        : ERROR_MESSAGES[err.code] ?? err.detail ?? 'Sign-in failed.';
    return { status, body: { error: err.code, message }, retryAfter: status === 429 ? err.retryAfter : null };
  }
  return { status: 502, body: { error: 'server_error', message: 'Sign-in service unavailable. Try again.' }, retryAfter: null };
}
