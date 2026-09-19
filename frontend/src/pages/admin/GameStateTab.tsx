import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Idol, Advantage, Alliance } from '../../types';
import { useAdmin } from './AdminContext';
import PlayerCard from '../../components/PlayerCard';

type Section = 'idols' | 'advantages' | 'alliances';
const ADVANTAGE_TYPES = ['Steal-a-Vote', 'Extra Vote', 'Shot in the Dark', 'Safety Without Power', 'Knowledge is Power', 'Bank Your Vote', 'Idol Nullifier', 'Block a Vote', 'Other'];

export default function GameStateTab() {
  const { season, activePlayers, episode, flash } = useAdmin();
  const [section, setSection] = useState<Section>('idols');
  const [idols, setIdols] = useState<Idol[]>([]);
  const [advantages, setAdvantages] = useState<Advantage[]>([]);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [playing, setPlaying] = useState<{ kind: 'idol' | 'advantage'; id: number; ep: string } | null>(null);

  const [idolPlayerId, setIdolPlayerId] = useState(0);
  const [idolLabel, setIdolLabel] = useState('Hidden Immunity Idol');
  const [idolNotes, setIdolNotes] = useState('');
  const [advPlayerId, setAdvPlayerId] = useState(0);
  const [advType, setAdvType] = useState('');
  const [advCustom, setAdvCustom] = useState('');
  const [advNotes, setAdvNotes] = useState('');
  const [allianceName, setAllianceName] = useState('');
  const [allianceNotes, setAllianceNotes] = useState('');
  const [allianceMembers, setAllianceMembers] = useState<number[]>([]);

  const loadAll = () => {
    if (!season) return;
    api.getIdols(season.id).then(setIdols).catch(console.error);
    api.getAdvantages(season.id).then(setAdvantages).catch(console.error);
    api.getAlliances(season.id).then(setAlliances).catch(console.error);
  };
  useEffect(loadAll, [season?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); loadAll(); flash(ok); } catch (err: any) { flash(err.message, 'error'); }
  };

  const markPlayed = async () => {
    if (!playing) return;
    const ep = parseInt(playing.ep) || episode;
    await run(() => playing.kind === 'idol'
      ? api.updateIdol(playing.id, { played_episode: ep, is_active: false })
      : api.updateAdvantage(playing.id, { played_episode: ep, is_active: false }), 'Marked as played');
    setPlaying(null);
  };

  return (
    <div className="admin-tab-content">
      <div className="challenge-type-grid three">
        {(['idols', 'advantages', 'alliances'] as Section[]).map(s => (
          <button key={s} className={`challenge-type-btn ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>
            <span className="challenge-type-label">{s[0].toUpperCase() + s.slice(1)}</span>
            <span className="challenge-type-sub">{s === 'idols' ? idols.filter(i => i.is_active).length : s === 'advantages' ? advantages.filter(a => a.is_active).length : alliances.filter(a => a.is_active).length} active</span>
          </button>
        ))}
      </div>

      {playing && (
        <div className="modal-overlay" onClick={() => setPlaying(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Mark as played</h3>
            <div className="form-group">
              <label>Episode played</label>
              <input type="number" min={1} className="form-input" value={playing.ep} onChange={e => setPlaying({ ...playing, ep: e.target.value })} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPlaying(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={markPlayed}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {section === 'idols' && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="scoring-form">
            <h3>Add idol</h3>
            <div className="form-row-inline">
              <div className="form-group flex-1">
                <label>Player</label>
                <select value={idolPlayerId} onChange={e => setIdolPlayerId(parseInt(e.target.value))} className="form-select">
                  <option value={0}>-- Select --</option>
                  {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>)}
                </select>
              </div>
              <div className="form-group flex-1">
                <label>Label</label>
                <input className="form-input" value={idolLabel} onChange={e => setIdolLabel(e.target.value)} />
              </div>
            </div>
            <div className="form-group"><label>Notes</label><input className="form-input" value={idolNotes} onChange={e => setIdolNotes(e.target.value)} placeholder="Optional" /></div>
            <button className="btn btn-primary" disabled={!idolPlayerId} onClick={() => run(async () => { await api.addIdol(season!.id, { player_id: idolPlayerId, label: idolLabel, found_episode: episode, notes: idolNotes || undefined }); setIdolPlayerId(0); setIdolNotes(''); }, `Idol added (found ep ${episode})`)}>Add idol</button>
          </div>
          {idols.length > 0 && (
            <div className="recent-events">
              <h3>Idol tracker</h3>
              <table className="log-table">
                <thead><tr><th>Player</th><th>Label</th><th>Found</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {idols.map(i => (
                    <tr key={i.id} style={{ opacity: i.is_active ? 1 : 0.55 }}>
                      <td>{i.player_name}</td><td>{i.label}{i.notes ? ` (${i.notes})` : ''}</td><td>Ep {i.found_episode || '?'}</td>
                      <td>{i.is_active ? 'In pocket' : `Played ep ${i.played_episode}`}</td>
                      <td className="rules-actions">
                        {i.is_active && <button className="btn btn-secondary btn-small" onClick={() => setPlaying({ kind: 'idol', id: i.id, ep: String(episode) })}>Mark played</button>}
                        <button className="btn-icon delete-btn" onClick={() => window.confirm('Delete this idol record?') && run(() => api.deleteIdol(i.id), 'Deleted')}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === 'advantages' && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="scoring-form">
            <h3>Add advantage</h3>
            <div className="form-row-inline">
              <div className="form-group flex-1">
                <label>Player</label>
                <select value={advPlayerId} onChange={e => setAdvPlayerId(parseInt(e.target.value))} className="form-select">
                  <option value={0}>-- Select --</option>
                  {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>)}
                </select>
              </div>
              <div className="form-group flex-1">
                <label>Type</label>
                <select value={advType} onChange={e => setAdvType(e.target.value)} className="form-select">
                  <option value="">-- Select --</option>
                  {ADVANTAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {advType === 'Other' && <input className="form-input" style={{ marginTop: 8 }} value={advCustom} onChange={e => setAdvCustom(e.target.value)} placeholder="Name the advantage" />}
              </div>
            </div>
            <div className="form-group"><label>Notes</label><input className="form-input" value={advNotes} onChange={e => setAdvNotes(e.target.value)} placeholder="Optional" /></div>
            <button className="btn btn-primary" disabled={!advPlayerId || !advType || (advType === 'Other' && !advCustom)} onClick={() => run(async () => { await api.addAdvantage(season!.id, { player_id: advPlayerId, advantage_type: advType === 'Other' ? advCustom : advType, found_episode: episode, notes: advNotes || undefined }); setAdvPlayerId(0); setAdvType(''); setAdvCustom(''); setAdvNotes(''); }, 'Advantage added')}>Add advantage</button>
          </div>
          {advantages.length > 0 && (
            <div className="recent-events">
              <h3>Advantage tracker</h3>
              <table className="log-table">
                <thead><tr><th>Player</th><th>Type</th><th>Found</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {advantages.map(a => (
                    <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.55 }}>
                      <td>{a.player_name}</td><td>{a.advantage_type}{a.notes ? ` (${a.notes})` : ''}</td><td>Ep {a.found_episode || '?'}</td>
                      <td>{a.is_active ? 'Held' : `Used ep ${a.played_episode}`}</td>
                      <td className="rules-actions">
                        {a.is_active && <button className="btn btn-secondary btn-small" onClick={() => setPlaying({ kind: 'advantage', id: a.id, ep: String(episode) })}>Mark used</button>}
                        <button className="btn-icon delete-btn" onClick={() => window.confirm('Delete this advantage record?') && run(() => api.deleteAdvantage(a.id), 'Deleted')}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === 'alliances' && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="scoring-form">
            <h3>Create alliance</h3>
            <div className="form-row-inline">
              <div className="form-group flex-1"><label>Name</label><input className="form-input" value={allianceName} onChange={e => setAllianceName(e.target.value)} placeholder='e.g. "The Farmers"' /></div>
              <div className="form-group flex-1"><label>Notes</label><input className="form-input" value={allianceNotes} onChange={e => setAllianceNotes(e.target.value)} placeholder="Optional" /></div>
            </div>
            <div className="form-group">
              <label>Members ({allianceMembers.length}) — tap to toggle</label>
              <div className="pick-grid">
                {activePlayers.map(p => <PlayerCard key={p.id} player={p} compact selected={allianceMembers.includes(p.id)} onClick={() => setAllianceMembers(m => m.includes(p.id) ? m.filter(x => x !== p.id) : [...m, p.id])} />)}
              </div>
            </div>
            <button className="btn btn-primary" disabled={!allianceName || allianceMembers.length < 2} onClick={() => run(async () => { await api.createAlliance(season!.id, { name: allianceName, formed_episode: episode, notes: allianceNotes || undefined, member_ids: allianceMembers }); setAllianceName(''); setAllianceNotes(''); setAllianceMembers([]); }, 'Alliance created')}>Create alliance</button>
          </div>
          {alliances.map(a => (
            <div key={a.id} className="scoring-form" style={{ opacity: a.is_active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{a.name}</strong>
                  {a.formed_episode && <span className="text-muted"> · formed ep {a.formed_episode}</span>}
                  {a.notes && <span className="text-muted"> · {a.notes}</span>}
                </div>
                <div className="rules-actions">
                  {a.is_active
                    ? <button className="btn btn-secondary btn-small" onClick={() => run(() => api.updateAlliance(a.id, { is_active: false }), 'Alliance dissolved')}>Dissolve</button>
                    : <button className="btn btn-secondary btn-small" onClick={() => run(() => api.updateAlliance(a.id, { is_active: true }), 'Alliance restored')}>Restore</button>}
                  <button className="btn-icon delete-btn" onClick={() => window.confirm('Delete this alliance?') && run(() => api.deleteAlliance(a.id), 'Deleted')}>✕</button>
                </div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(a.members || []).map(m => <span key={m.id} className="tribe-pill" style={{ fontSize: '0.8rem', opacity: m.is_eliminated ? 0.5 : 1 }}>{m.name}{m.is_eliminated ? ' (out)' : ''}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
