import { useEffect, useRef, useState } from 'react';

const SEVERITIES = [
  { value: 'low', label: 'Minor — cosmetic' },
  { value: 'med', label: 'Medium — annoying' },
  { value: 'high', label: 'High — hard to use' },
  { value: 'urgent', label: 'Urgent — broken' },
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

// Scoped styles, built from the app's war-room CSS custom properties so the
// widget reads as native (Teko display, ember-orange, fire-lit dark cards).
const CSS = `
.s50-launch{position:fixed;bottom:20px;right:20px;z-index:9000;display:inline-flex;align-items:center;gap:8px;
  font-family:'Teko',sans-serif;font-size:18px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:#1a1208;background:var(--fire-orange,#FF6B35);border:0;border-radius:6px;padding:8px 16px;cursor:pointer;
  box-shadow:0 6px 20px rgba(255,107,53,.35);transition:transform .15s ease,box-shadow .15s ease}
.s50-launch:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(255,107,53,.5)}
.s50-launch:focus-visible{outline:2px solid var(--gold-bright,#F0C75E);outline-offset:2px}
.s50-scrim{position:fixed;inset:0;z-index:9001;background:rgba(5,5,3,.72);display:flex;align-items:center;justify-content:center;padding:16px}
.s50-card{width:min(94vw,420px);background:var(--bg-card,#1a1810);color:var(--text-primary,#f0e6d3);
  border:1px solid var(--border,#3a3520);border-radius:10px;padding:24px;font-family:'Inter',system-ui,sans-serif;
  box-shadow:0 24px 60px rgba(0,0,0,.6)}
.s50-card h2{margin:0;font-family:'Teko',sans-serif;font-size:30px;font-weight:600;letter-spacing:.03em;
  text-transform:uppercase;color:var(--gold-bright,#F0C75E);line-height:1}
.s50-card p.sub{margin:4px 0 0;font-size:13px;color:var(--text-secondary,#a89878)}
.s50-card label{display:block;margin:18px 0 6px;font-family:'Teko',sans-serif;font-size:15px;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary,#a89878)}
.s50-card textarea,.s50-card select{width:100%;box-sizing:border-box;padding:10px 12px;background:var(--bg-input,#1e1d16);
  color:var(--text-primary,#f0e6d3);border:1px solid var(--border,#3a3520);border-radius:6px;font:inherit}
.s50-card textarea{min-height:96px;resize:vertical}
.s50-card textarea:focus,.s50-card select:focus{outline:0;border-color:var(--fire-orange,#FF6B35)}
.s50-row{display:flex;align-items:center;gap:14px;margin-top:20px}
.s50-msg{margin-right:auto;font-size:12.5px;color:var(--text-secondary)}
.s50-msg.err{color:var(--fire-red,#E8344E)}.s50-msg.ok{color:var(--positive,#4CAF50)}
.s50-cancel{background:none;border:0;cursor:pointer;font-family:'Teko',sans-serif;font-size:15px;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#7a6e56)}
.s50-cancel:hover{color:var(--text-primary)}
.s50-send{background:var(--fire-orange,#FF6B35);color:#1a1208;border:0;border-radius:6px;padding:9px 18px;cursor:pointer;
  font-family:'Teko',sans-serif;font-size:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.s50-send:hover{background:var(--gold-bright,#F0C75E)}.s50-send:disabled{opacity:.55;cursor:default}
.s50-sent{margin-top:18px;border:1px solid var(--border);border-radius:6px;background:rgba(76,175,80,.08);
  padding:18px;text-align:center;font-size:14px;color:var(--text-primary)}
`;

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('med');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => ref.current?.focus(), 40);
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(id); };
  }, [open]);

  function close() {
    setOpen(false);
    window.setTimeout(() => { setMessage(''); setSeverity('med'); setStatus('idle'); setError(''); }, 200);
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) { setError('Add a quick description first.'); ref.current?.focus(); return; }
    setStatus('sending'); setError('');
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          severity,
          url: window.location.href,
          meta: { path: window.location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent },
        }),
      });
      if (!res.ok) throw new Error();
      setStatus('sent');
      window.setTimeout(close, 1300);
    } catch {
      setStatus('error'); setError('Could not send. Try again.');
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="s50-launch" onClick={() => setOpen(true)} aria-label="Report a bug">
        🔥 Report a bug
      </button>

      {open && (
        <div className="s50-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="s50-card" role="dialog" aria-modal="true" aria-label="Report a bug">
            <h2>Found a bug?</h2>
            <p className="sub">Tell us what happened — it goes straight to the board.</p>

            {status === 'sent' ? (
              <div className="s50-sent">Report filed. Thanks for the intel.</div>
            ) : (
              <>
                <label htmlFor="s50-msg">What went wrong?</label>
                <textarea id="s50-msg" ref={ref} value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4} maxLength={5000} placeholder="What you saw, and what you expected…" />

                <label htmlFor="s50-sev">How bad is it?</label>
                <select id="s50-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <div className="s50-row">
                  <span className={`s50-msg${error ? ' err' : ''}`}>{error}</span>
                  <button type="button" className="s50-cancel" onClick={close}>Cancel</button>
                  <button type="button" className="s50-send" onClick={send} disabled={status === 'sending'}>
                    {status === 'sending' ? 'Sending…' : 'Send report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
