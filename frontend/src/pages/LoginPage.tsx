import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

/**
 * Commissioner sign-in through Squawk (Nathan's auth service) with the OWNER passkey.
 * There is no password.
 *
 * 1. Plain /login: one button → /api/auth/start → Squawk /oauth/authorize.
 * 2. Squawk parks the request and sends the browser back to /login?login_challenge=…:
 *    "Sign in as owner" runs the passkey ceremony through /api/auth/owner/begin|finish
 *    and follows `redirect_to` (Squawk → our /api/auth/callback).
 * 3. The callback mints the app JWT and lands on /login#token=…: store it exactly like
 *    the old password login did, strip the fragment, go to /admin.
 */

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  state_mismatch: 'This sign-in attempt expired or was already used. Start over.',
  invalid_token: 'Squawk returned a token this site could not verify.',
  invalid_grant: 'The sign-in code was rejected. Start over.',
  invalid_request: 'Malformed sign-in response. Start over.',
  server_error: 'The sign-in service is unavailable. Try again shortly.',
  login_expired: 'This sign-in attempt expired. Start over.',
};

// base64url <-> ArrayBuffer, the WebAuthn JSON convention.
const toBuf = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const toB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined;

function decodeAssertionOptions(pk: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  if ('parseRequestOptionsFromJSON' in PublicKeyCredential) {
    return PublicKeyCredential.parseRequestOptionsFromJSON(pk);
  }
  return {
    challenge: toBuf(pk.challenge),
    rpId: pk.rpId,
    timeout: pk.timeout,
    userVerification: pk.userVerification as UserVerificationRequirement | undefined,
    allowCredentials: (pk.allowCredentials ?? []).map(c => ({
      type: c.type as PublicKeyCredentialType,
      id: toBuf(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    extensions: pk.extensions as AuthenticationExtensionsClientInputs | undefined,
  };
}

function encodeAssertion(cred: PublicKeyCredential) {
  if ('toJSON' in cred && typeof cred.toJSON === 'function') return cred.toJSON();
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64(r.clientDataJSON),
      authenticatorData: toB64(r.authenticatorData),
      signature: toB64(r.signature),
      userHandle: toB64(r.userHandle),
    },
  };
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const { login, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const loginChallenge = params.get('login_challenge');
  const hasToken = location.hash.startsWith('#token=');

  // 3. Token handed back by the callback in the fragment.
  useEffect(() => {
    if (!hasToken) return;
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (token) login(token);
    navigate('/admin', { replace: true });
  }, [hasToken, location.hash, login, navigate]);

  useEffect(() => {
    if (isAdmin && !hasToken) navigate('/admin', { replace: true });
  }, [isAdmin, hasToken, navigate]);

  useEffect(() => {
    const code = params.get('error');
    if (code) setError(CALLBACK_ERRORS[code] ?? `Sign-in failed (${code}).`);
  }, [location.search]);

  useEffect(() => {
    if (loginChallenge || hasToken) return;
    api.auth.config().then(c => setEnabled(c.enabled)).catch(() => setEnabled(true));
  }, [loginChallenge, hasToken]);

  const startSquawk = () => {
    setBusy(true);
    window.location.assign(api.auth.startUrl);
  };

  const signInAsOwner = async () => {
    if (!loginChallenge) return;
    setError(null);
    setBusy(true);
    try {
      const begin = await api.auth.ownerBegin(loginChallenge);
      const cred = await navigator.credentials.get({ publicKey: decodeAssertionOptions(begin.options.publicKey) });
      if (!cred) throw new Error('No credential returned.');
      const { redirect_to } = await api.auth.ownerFinish(begin.challenge_id, encodeAssertion(cred as PublicKeyCredential));
      window.location.assign(redirect_to);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        // The user dismissed the passkey prompt; not an error.
      } else {
        setError(err instanceof Error ? err.message : 'Passkey sign-in failed.');
      }
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (hasToken) {
    body = <p className="login-subtitle">Signing you in...</p>;
  } else if (loginChallenge) {
    body = (
      <button type="button" className="btn btn-primary btn-full" onClick={signInAsOwner} disabled={busy}>
        {busy ? 'Waiting for passkey...' : 'Sign in as owner'}
      </button>
    );
  } else if (enabled === false) {
    body = <p className="form-error">Sign-in is not configured on this server.</p>;
  } else {
    body = (
      <button type="button" className="btn btn-primary btn-full" onClick={startSquawk} disabled={busy || enabled === null}>
        {busy ? 'Redirecting...' : 'Sign in with Squawk'}
      </button>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-torch">🔥</div>
        <h1 className="login-title">TRIBAL COUNCIL</h1>
        <p className="login-subtitle">Commissioner access only</p>
        <div className="login-form">
          {body}
          {error && <div className="form-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
