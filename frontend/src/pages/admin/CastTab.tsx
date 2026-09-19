import { useState } from 'react';
import { api } from '../../api';
import { Player, Tribe } from '../../types';
import { useAdmin } from './AdminContext';
import { useTribes } from '../../context/TribeContext';

type Mode = 'cast' | 'tribes' | 'swap' | 'merge' | 'import';

const EMPTY: Partial<Player> = { name: '', nickname: '', original_seasons: '', tribe: '', photo_url: '', occupation: '', hometown: '' };

export default function CastTab() {
  const { season, players, activePlayers, tribes, refresh, flash } = useAdmin();
  const { refresh: refreshTribes, getTribeColor } = useTribes();
  const [mode, setMode] = useState<Mode>('cast');
  const [editing, setEditing] = useState<Partial<Player> | null>(null);
  const [tribeDraft, setTribeDraft] = useState<{ id?: number; name: string; color: string }>({ name: '', color: '#E87830' });
  const [swapEp, setSwapEp] = useState('');
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [newTribes, setNewTribes] = useState<{ name: string; color: string }[]>([]);
  const [mergeEp, setMergeEp] = useState('');
  const [mergeName, setMergeName] = useState('');
  const [mergeColor, setMergeColor] = useState('#D4A843');
  const [castJson, setCastJson] = useState('');
  const [busy, setBusy] = useState(false);

  const reloadAll = async () => { await refresh(); refreshTribes(); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); await reloadAll(); flash(ok); } catch (err: any) { flash(err.message, 'error'); } finally { setBusy(false); }
  };

  const savePlayer = async () => {
    if (!season || !editing?.name?.trim() || !editing.tribe) { flash('Name and tribe are required', 'error'); return; }
    const data = { ...editing, name: editing.name.trim() };
    await run(async () => {
      if (editing.id) await api.updatePlayer(editing.id, data);
      else await api.createPlayer(season.id, data as Partial<Player> & { name: string; tribe: string });
      setEditing(null);
    }, editing.id ? 'Player saved' : 'Player added');
  };

  const deletePlayer = async (p: Player) => {
    if (!window.confirm(`Delete ${p.name}? This also deletes their scoring events and draft picks.`)) return;
    await run(() => api.deletePlayer(p.id), `${p.name} removed`);
  };

  const saveTribe = async () => {
    if (!season || !tribeDraft.name.trim()) return;
    await run(async () => {
      if (tribeDraft.id) await api.updateTribe(tribeDraft.id, { name: tribeDraft.name.trim(), color: tribeDraft.color });
      else await api.createTribe(season.id, { name: tribeDraft.name.trim(), color: tribeDraft.color, phase: 'original', introduced_episode: 1 });
      setTribeDraft({ name: '', color: '#E87830' });
    }, tribeDraft.id ? 'Tribe saved (players follow the rename)' : 'Tribe added');
  };

  const doSwap = async () => {
    if (!season) return;
    const list = Object.entries(assignments).filter(([, t]) => t).map(([pid, t]) => ({ player_id: parseInt(pid), tribe_name: t }));
    if (!swapEp || list.length === 0) { flash('Episode and at least one move are required', 'error'); return; }
    await run(async () => {
      await api.performSwap(season.id, { episode: parseInt(swapEp), assignments: list, new_tribes: newTribes.length ? newTribes : undefined });
      setAssignments({}); setNewTribes([]); setSwapEp(''); setMode('tribes');
    }, `Swap done — ${list.length} players moved`);
  };

  const doMerge = async () => {
    if (!season || !mergeEp || !mergeName) return;
    if (!window.confirm(`Merge all ${activePlayers.length} remaining players into ${mergeName}?`)) return;
    await run(async () => {
      await api.performMerge(season.id, { episode: parseInt(mergeEp), tribe_name: mergeName, tribe_color: mergeColor });
      setMergeEp(''); setMergeName(''); setMode('tribes');
    }, `Merged into ${mergeName}`);
  };

  const importJson = async () => {
    if (!season) return;
    let arr: Partial<Player>[];
    try { const parsed = JSON.parse(castJson); arr = Array.isArray(parsed) ? parsed : [parsed]; } catch { flash('Invalid JSON', 'error'); return; }
    await run(async () => { await api.bulkImportPlayers(season.id, arr); setCastJson(''); setMode('cast'); }, `Imported ${arr.length} players`);
  };

  const tribeOptions = [...tribes.filter(t => t.is_active), ...newTribes.map(t => ({ ...t, id: -1, is_active: true, phase: 'swap', introduced_episode: null } as Tribe))];

  return (
    <div className="admin-tab-content">
      <div className="tribes-mode-bar">
        {(['cast', 'tribes', 'swap', 'merge', 'import'] as Mode[]).map(m => (
          <button key={m} className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'} btn-small`} onClick={() => setMode(m)}>
            {{ cast: `Cast (${players.length})`, tribes: `Tribes (${tribes.filter(t => t.is_active).length})`, swap: 'Tribe swap', merge: 'Merge', import: 'Import JSON' }[m]}
          </button>
        ))}
      </div>

      {mode === 'cast' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0' }}>
            <p className="summary-desc" style={{ margin: 0 }}>Tap a row to edit. Photos live in <code>frontend/public/cast-photos/</code> or any image URL.</p>
            <button className="btn btn-primary btn-small" onClick={() => setEditing({ ...EMPTY, tribe: tribes.find(t => t.is_active)?.name || '' })}>+ Add player</button>
          </div>
          {editing && (
            <div className="scoring-form">
              <h3>{editing.id ? `Edit ${editing.name}` : 'New player'}</h3>
              <div className="form-row-inline">
                <div className="form-group flex-1"><label>Name</label><input className="form-input" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus /></div>
                <div className="form-group"><label>Nickname</label><input className="form-input" value={editing.nickname || ''} onChange={e => setEditing({ ...editing, nickname: e.target.value })} placeholder="optional" /></div>
                <div className="form-group">
                  <label>Tribe</label>
                  <select className="form-select" value={editing.tribe || ''} onChange={e => setEditing({ ...editing, tribe: e.target.value })}>
                    <option value="">—</option>
                    {tribes.map(t => <option key={t.id} value={t.name}>{t.name}{t.is_active ? '' : ' (inactive)'}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row-inline">
                <div className="form-group flex-1"><label>Occupation</label><input className="form-input" value={editing.occupation || ''} onChange={e => setEditing({ ...editing, occupation: e.target.value })} /></div>
                <div className="form-group flex-1"><label>Hometown</label><input className="form-input" value={editing.hometown || ''} onChange={e => setEditing({ ...editing, hometown: e.target.value })} /></div>
                <div className="form-group"><label>Past seasons</label><input className="form-input" value={editing.original_seasons || ''} onChange={e => setEditing({ ...editing, original_seasons: e.target.value })} placeholder="e.g. 32, 34 (returnees)" /></div>
              </div>
              <div className="form-row-inline">
                <div className="form-group flex-1"><label>Photo URL</label><input className="form-input" value={editing.photo_url || ''} onChange={e => setEditing({ ...editing, photo_url: e.target.value })} placeholder="/cast-photos/s51-name.jpg or https://…" /></div>
                {editing.id && (
                  <div className="form-group"><label>Placement</label><input type="number" className="form-input" style={{ width: 100 }} value={editing.placement ?? ''} onChange={e => setEditing({ ...editing, placement: e.target.value ? parseInt(e.target.value) : null, is_eliminated: e.target.value ? parseInt(e.target.value) > 1 : false })} /></div>
                )}
              </div>
              <div className="form-row-inline">
                <button className="btn btn-primary" onClick={savePlayer} disabled={busy}>Save</button>
                <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                {editing.id && editing.is_eliminated && <button className="btn btn-secondary" onClick={() => run(() => api.updatePlayer(editing.id!, { is_eliminated: false, placement: null }), 'Player reinstated (scoring events untouched)')}>Reinstate</button>}
              </div>
            </div>
          )}
          <div className="rules-table-container">
            <table className="log-table cast-table">
              <thead><tr><th></th><th>Name</th><th>Tribe</th><th>Info</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {players.map(p => (
                  <tr key={p.id} onClick={() => setEditing({ ...p })} style={{ cursor: 'pointer', opacity: p.is_eliminated ? 0.6 : 1 }}>
                    <td>{p.photo_url ? <img src={p.photo_url} alt="" className="cast-thumb" /> : <span className="cast-thumb placeholder" />}</td>
                    <td><strong>{p.name}</strong>{p.nickname ? <span className="text-muted"> "{p.nickname}"</span> : null}</td>
                    <td><span style={{ color: getTribeColor(p.tribe) }}>{p.tribe}</span></td>
                    <td className="text-muted">{p.original_seasons ? `S${p.original_seasons}` : [p.occupation, p.hometown].filter(Boolean).join(' · ')}</td>
                    <td>{p.placement === 1 ? '👑 Winner' : p.is_eliminated ? `Out (${p.placement})` : 'In'}</td>
                    <td><button className="btn-icon delete-btn" onClick={e => { e.stopPropagation(); deletePlayer(p); }} title="Delete">✕</button></td>
                  </tr>
                ))}
                {players.length === 0 && <tr><td colSpan={6} className="text-muted">No players yet — add them here or import JSON.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === 'tribes' && (
        <>
          <div className="scoring-form">
            <h3>{tribeDraft.id ? `Edit ${tribeDraft.name}` : 'Add a tribe'}</h3>
            <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
              <div className="form-group flex-1"><label>Name</label><input className="form-input" value={tribeDraft.name} onChange={e => setTribeDraft({ ...tribeDraft, name: e.target.value })} placeholder="e.g. Kalo" /></div>
              <div className="form-group"><label>Color</label><input type="color" className="color-picker" value={tribeDraft.color} onChange={e => setTribeDraft({ ...tribeDraft, color: e.target.value })} /></div>
              <button className="btn btn-primary" onClick={saveTribe} disabled={busy || !tribeDraft.name.trim()}>{tribeDraft.id ? 'Save' : 'Add tribe'}</button>
              {tribeDraft.id && <button className="btn btn-secondary" onClick={() => setTribeDraft({ name: '', color: '#E87830' })}>Cancel</button>}
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Renaming a tribe moves its players with it — handy when the real tribe names get revealed.</p>
          </div>
          <div className="tribes-list">
            {tribes.map(t => (
              <div key={t.id} className={`tribe-card ${!t.is_active ? 'inactive' : ''}`}>
                <div className="tribe-card-color" style={{ backgroundColor: t.color }} />
                <div className="tribe-card-info">
                  <strong>{t.name}</strong>
                  <span className="tribe-card-meta">{t.phase}{t.introduced_episode ? ` · ep ${t.introduced_episode}` : ''}{!t.is_active ? ' · inactive' : ''}</span>
                </div>
                <div className="tribe-card-count">{activePlayers.filter(p => p.tribe === t.name).length} active</div>
                <div className="rules-actions">
                  <button className="btn btn-secondary btn-small" onClick={() => setTribeDraft({ id: t.id, name: t.name, color: t.color })}>Edit</button>
                  <button className="btn btn-secondary btn-small" onClick={() => run(() => api.updateTribe(t.id, { is_active: !t.is_active }), t.is_active ? 'Tribe deactivated' : 'Tribe activated')}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn-icon delete-btn" onClick={() => window.confirm(`Delete tribe ${t.name}?`) && run(() => api.deleteTribe(t.id), 'Tribe deleted')}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === 'swap' && (
        <div className="scoring-form">
          <h3>🔀 Tribe swap</h3>
          <p className="summary-desc">Only set the players who move. Add new tribes first if the swap creates them.</p>
          <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
            <div className="form-group"><label>Episode</label><input type="number" min={1} className="form-input" style={{ width: 100 }} value={swapEp} onChange={e => setSwapEp(e.target.value)} /></div>
            <div className="form-group flex-1"><label>New tribe (optional)</label><input className="form-input" value={tribeDraft.name} onChange={e => setTribeDraft({ ...tribeDraft, name: e.target.value })} placeholder="Name" /></div>
            <div className="form-group"><label>Color</label><input type="color" className="color-picker" value={tribeDraft.color} onChange={e => setTribeDraft({ ...tribeDraft, color: e.target.value })} /></div>
            <button className="btn btn-secondary btn-small" onClick={() => { if (tribeDraft.name.trim()) { setNewTribes([...newTribes, { name: tribeDraft.name.trim(), color: tribeDraft.color }]); setTribeDraft({ name: '', color: '#E87830' }); } }}>+ Add</button>
          </div>
          {newTribes.length > 0 && <div className="new-tribes-chips">{newTribes.map(t => <span key={t.name} className="tribe-chip" style={{ borderColor: t.color, color: t.color }}>{t.name}<button className="tribe-chip-remove" onClick={() => setNewTribes(newTribes.filter(x => x.name !== t.name))}>✕</button></span>)}</div>}
          <div className="swap-player-list">
            {activePlayers.map(p => (
              <div key={p.id} className="swap-player-row">
                <span className="swap-player-name"><span className="swap-player-dot" style={{ backgroundColor: getTribeColor(p.tribe) }} />{p.name}</span>
                <select className="form-select swap-tribe-select" value={assignments[p.id] || ''} onChange={e => setAssignments({ ...assignments, [p.id]: e.target.value })}>
                  <option value="">— stays {p.tribe} —</option>
                  {tribeOptions.filter(t => t.name !== p.tribe).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-full" onClick={doSwap} disabled={busy}>Execute swap ({Object.values(assignments).filter(Boolean).length} moving)</button>
        </div>
      )}

      {mode === 'merge' && (
        <div className="scoring-form">
          <h3>🤝 Merge</h3>
          <p className="summary-desc">Everyone still in the game joins one tribe; the old tribes go inactive. Award the merge points in Log Episode.</p>
          <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
            <div className="form-group"><label>Episode</label><input type="number" min={1} className="form-input" style={{ width: 100 }} value={mergeEp} onChange={e => setMergeEp(e.target.value)} /></div>
            <div className="form-group flex-1"><label>Merge tribe name</label><input className="form-input" value={mergeName} onChange={e => setMergeName(e.target.value)} placeholder="e.g. Manulevu" /></div>
            <div className="form-group"><label>Color</label><input type="color" className="color-picker" value={mergeColor} onChange={e => setMergeColor(e.target.value)} /></div>
          </div>
          <button className="btn btn-danger btn-full" onClick={doMerge} disabled={busy || !mergeEp || !mergeName}>Merge {activePlayers.length} players into {mergeName || '…'}</button>
        </div>
      )}

      {mode === 'import' && (
        <div className="scoring-form">
          <h3>Import cast from JSON</h3>
          <p className="summary-desc">Array of objects with name, tribe, and optionally nickname, original_seasons, photo_url, occupation, hometown.</p>
          <textarea className="form-textarea" rows={10} value={castJson} onChange={e => setCastJson(e.target.value)} placeholder={'[\n  { "name": "Player Name", "tribe": "Purple", "occupation": "Chef", "hometown": "Providence, RI" }\n]'} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
          <button className="btn btn-primary" onClick={importJson} disabled={busy || !castJson.trim()}>Import</button>
        </div>
      )}
    </div>
  );
}
