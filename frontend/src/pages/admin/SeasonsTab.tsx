import { useState } from 'react';
import { api } from '../../api';
import { useAdmin } from './AdminContext';

export default function SeasonsTab() {
  const { shows, seasons, season, refreshCatalog, refresh, flash, selectSeason } = useAdmin();
  const [showSlug, setShowSlug] = useState(shows[0]?.slug || 'survivor');
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [premiere, setPremiere] = useState('');
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState(season?.name || '');
  const [editPremiere, setEditPremiere] = useState(season?.premiere_date?.slice(0, 10) || '');

  const createSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!num) return;
    setBusy(true);
    try {
      const s = await api.createSeason(showSlug, { season_number: parseInt(num), name: name || undefined, premiere_date: premiere || undefined });
      await refreshCatalog();
      selectSeason(s.id);
      setNum(''); setName(''); setPremiere('');
      flash(`Season ${s.season_number} created. Add tribes and cast in the Cast tab.`);
    } catch (err: any) { flash(err.message, 'error'); } finally { setBusy(false); }
  };

  const update = async (data: Parameters<typeof api.updateSeason>[1], ok: string) => {
    if (!season) return;
    try {
      await api.updateSeason(season.id, data);
      await refreshCatalog();
      await refresh();
      flash(ok);
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const remove = async () => {
    if (!season) return;
    const label = `${season.show_name} ${season.season_number}`;
    if (!window.confirm(`Delete ${label}? This removes its cast, leagues, teams, and every scoring event. This cannot be undone.`)) return;
    if (window.prompt(`Type ${season.season_number} to confirm deleting ${label}`) !== String(season.season_number)) return;
    try {
      await api.deleteSeason(season.id);
      await refreshCatalog();
      flash(`${label} deleted`);
    } catch (err: any) { flash(err.message, 'error'); }
  };

  return (
    <div className="admin-tab-content">
      {season && (
        <div className="scoring-form">
          <h3>{season.show_name} {season.season_number} settings</h3>
          <div className="form-row-inline">
            <div className="form-group flex-1">
              <label>Season name</label>
              <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => editName !== (season.name || '') && update({ name: editName }, 'Name saved')} placeholder="e.g. The Open Era" />
            </div>
            <div className="form-group">
              <label>Premiere date</label>
              <input type="date" className="form-input" value={editPremiere} onChange={e => setEditPremiere(e.target.value)} onBlur={() => editPremiere !== (season.premiere_date?.slice(0, 10) || '') && update({ premiere_date: editPremiere || null }, 'Premiere date saved')} />
            </div>
          </div>
          <div className="admin-season-flags">
            <div>
              <strong>Status:</strong>{' '}
              {season.is_complete ? 'Complete' : season.is_active ? 'Active' : 'Inactive'}
              {' · '}Episodes logged: {season.current_episode}
            </div>
            <div className="admin-season-actions">
              {!season.is_complete ? (
                <button className="btn btn-secondary btn-small" onClick={() => { if (window.confirm('Mark this season complete? It moves to the Hall of Fame and the landing page stops featuring it.')) update({ is_complete: true }, 'Season marked complete'); }}>
                  🏁 Mark season complete
                </button>
              ) : (
                <button className="btn btn-secondary btn-small" onClick={() => update({ is_complete: false }, 'Season reopened')}>Reopen season</button>
              )}
              {season.is_active
                ? <button className="btn btn-secondary btn-small" onClick={() => update({ is_active: false }, 'Season hidden from the landing page')}>Hide from landing</button>
                : <button className="btn btn-secondary btn-small" onClick={() => update({ is_active: true }, 'Season is active')}>Set active</button>}
            </div>
          </div>
        </div>
      )}

      <form className="scoring-form" onSubmit={createSeason}>
        <h3>New season</h3>
        <div className="form-row-inline">
          <div className="form-group">
            <label>Show</label>
            <select className="form-select" value={showSlug} onChange={e => setShowSlug(e.target.value)}>
              {shows.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Season #</label>
            <input type="number" className="form-input" value={num} onChange={e => setNum(e.target.value)} placeholder="52" style={{ width: 100 }} />
          </div>
          <div className="form-group flex-1">
            <label>Name (optional)</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Subtitle" />
          </div>
          <div className="form-group">
            <label>Premiere</label>
            <input type="date" className="form-input" value={premiere} onChange={e => setPremiere(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !num}>Create season</button>
        <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          After creating: add tribes and the cast (Cast & Tribes), then create a league (Leagues). Scoring rules are shared per show.
        </p>
      </form>

      {season && (
        <details className="danger-zone">
          <summary>Danger zone</summary>
          <p className="text-muted">Deleting {season.show_name} {season.season_number} removes its cast, leagues, teams and every scoring event. There is no undo.</p>
          <button className="btn btn-danger btn-small" onClick={remove}>Delete this season</button>
        </details>
      )}

      <div className="recent-events">
        <h3>All seasons</h3>
        <table className="log-table">
          <thead><tr><th>Season</th><th>Cast</th><th>Leagues</th><th>Status</th></tr></thead>
          <tbody>
            {seasons.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => selectSeason(s.id)}>
                <td><strong>{s.show_name} {s.season_number}</strong>{s.name ? ` — ${s.name}` : ''}</td>
                <td>{s.player_count ?? s.cast_count}</td>
                <td>{s.league_count ?? 0}</td>
                <td>{s.is_complete ? 'Complete' : s.is_active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
