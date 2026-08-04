import { useEffect, useRef, useState } from 'react';

const SEVERITIES = [
  { value: 'low', label: 'Minor — cosmetic' },
  { value: 'med', label: 'Medium — annoying' },
  { value: 'high', label: 'High — hard to use' },
  { value: 'urgent', label: 'Urgent — broken' },
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const SHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

type Shot = { file: File; url: string };

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
.s50-drop{margin-top:2px;border:1.5px dashed var(--border,#3a3520);border-radius:6px;padding:12px;cursor:pointer;
  text-align:center;font-size:12.5px;color:var(--text-muted,#7a6e56);transition:border-color .15s ease,background .15s ease}
.s50-drop:hover,.s50-drop.over{border-color:var(--fire-orange,#FF6B35);background:rgba(255,107,53,.06);color:var(--text-secondary,#a89878)}
.s50-drop:focus-visible{outline:2px solid var(--gold-bright,#F0C75E);outline-offset:2px}
.s50-thumbs{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.s50-thumb{position:relative;width:64px;height:64px;border:1px solid var(--border,#3a3520);border-radius:6px;overflow:hidden}
.s50-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.s50-thumb button{position:absolute;top:2px;right:2px;width:18px;height:18px;border:0;border-radius:50%;cursor:pointer;
  background:rgba(5,5,3,.75);color:var(--text-primary,#f0e6d3);font-size:12px;line-height:18px;padding:0;text-align:center}
.s50-thumb button:hover{background:var(--fire-red,#E8344E)}
`;

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('med');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [sentNote, setSentNote] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => SHOT_TYPES.includes(f.type));
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    const id = window.setTimeout(() => ref.current?.focus(), 40);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
      window.clearTimeout(id);
    };
  }, [open]);

  useEffect(() => () => { shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)); }, []);

  function clearShots() {
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
  }

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      setMessage(''); setSeverity('med'); setStatus('idle'); setError(''); setSentNote('');
      clearShots();
    }, 200);
  }

  function addFiles(list: File[] | FileList) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const current = shotsRef.current;
    const errors: string[] = [];
    const accepted: Shot[] = [];
    for (const file of incoming) {
      if (!SHOT_TYPES.includes(file.type)) { errors.push(`${file.name || 'That file'} isn't an image (PNG, JPEG, WebP, or GIF).`); continue; }
      if (file.size > MAX_SHOT_BYTES) { errors.push(`${file.name || 'That image'} is over 8MB.`); continue; }
      if (current.length + accepted.length >= MAX_SHOTS) { errors.push(`Up to ${MAX_SHOTS} screenshots per report.`); break; }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) setShots([...current, ...accepted]);
    setError(errors[0] || '');
  }

  function removeShot(idx: number) {
    const next = shotsRef.current.slice();
    const [gone] = next.splice(idx, 1);
    if (gone) URL.revokeObjectURL(gone.url);
    setShots(next);
    setError('');
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) { setError('Add a quick description first.'); ref.current?.focus(); return; }
    setStatus('sending'); setError('');
    let created: { id?: string } | null = null;
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
      created = await res.json().catch(() => null);
    } catch {
      setStatus('error'); setError('Could not send. Try again.');
      return;
    }

    // Report is filed; screenshots are best-effort from here.
    let note = '';
    const toUpload = shotsRef.current;
    if (toUpload.length && created?.id) {
      try {
        const form = new FormData();
        toUpload.forEach((s) => form.append('files', s.file, s.file.name || 'screenshot.png'));
        const up = await fetch(`/api/bug-report/${created.id}/screenshots`, { method: 'POST', body: form });
        if (!up.ok) note = "Screenshots couldn't be attached, but the report went through.";
      } catch {
        note = "Screenshots couldn't be attached, but the report went through.";
      }
    } else if (toUpload.length && !created?.id) {
      note = "Screenshots couldn't be attached, but the report went through.";
    }
    setSentNote(note);
    setStatus('sent');
    window.setTimeout(close, note ? 2600 : 1300);
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
              <div className="s50-sent">Report filed. Thanks for the intel.{sentNote ? <><br />{sentNote}</> : null}</div>
            ) : (
              <>
                <label htmlFor="s50-msg">What went wrong?</label>
                <textarea id="s50-msg" ref={ref} value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4} maxLength={5000} placeholder="What you saw, and what you expected…" />

                <label htmlFor="s50-sev">How bad is it?</label>
                <select id="s50-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <label>Screenshots (optional)</label>
                <div
                  className={`s50-drop${dragOver ? ' over' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileRef.current?.click())}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                >
                  Drop images here, click to browse, or paste from clipboard — up to {MAX_SHOTS}, 8MB each
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={SHOT_TYPES.join(',')}
                  multiple
                  hidden
                  onChange={(e) => { addFiles(e.target.files || []); e.target.value = ''; }}
                />
                {shots.length > 0 && (
                  <div className="s50-thumbs">
                    {shots.map((s, i) => (
                      <div className="s50-thumb" key={s.url}>
                        <img src={s.url} alt={s.file.name || `Screenshot ${i + 1}`} />
                        <button type="button" aria-label={`Remove ${s.file.name || `screenshot ${i + 1}`}`} onClick={() => removeShot(i)}>×</button>
                      </div>
                    ))}
                  </div>
                )}

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
