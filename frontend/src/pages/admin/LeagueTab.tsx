import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Team } from '../../types';
import { useAdmin } from './AdminContext';

export default function LeagueTab() {
  const { season, league, leagues, refresh, flash, selectLeague } = useAdmin();
  const [teams, setTeams] = useState<Team[]>([]);
  const [newLeague, setNewLeague] = useState('');
  const [newCode, setNewCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [copied, setCopied] = useState(false);

  const loadTeams = () => { if (league) api.getLeagueTeams(league.id).then(setTeams).catch(console.error); else setTeams([]); };
  useEffect(loadTeams, [league?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const leagueUrl = season && league ? `${window.location.origin}/${season.show_slug}/${season.season_number}/leagues/${league.invite_code}` : '';

  const createLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!season || !newLeague.trim()) return;
    try {
      const l = await api.createLeague(season.id, { name: newLeague.trim(), invite_code: newCode.trim() || undefined });
      await refresh();
      selectLeague(l.id);
      setNewLeague(''); setNewCode('');
      flash(`League "${l.name}" created`);
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!league || !teamName.trim() || !ownerName.trim()) return;
    try {
      await api.createLeagueTeam(league.id, { name: teamName.trim(), owner_name: ownerName.trim() });
      setTeamName(''); setOwnerName('');
      loadTeams(); refresh();
      flash('Team added');
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const saveTeam = async (id: number) => {
    try {
      await api.updateTeam(id, { name: editName, owner_name: editOwner });
      setEditing(null); loadTeams(); flash('Team updated');
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const deleteTeam = async (t: Team) => {
    if (!window.confirm(`Delete ${t.name} and its draft picks?`)) return;
    try { await api.deleteTeam(t.id); loadTeams(); refresh(); flash('Team deleted'); } catch (err: any) { flash(err.message, 'error'); }
  };

  const renameLeague = async () => {
    if (!league) return;
    const name = window.prompt('League name', league.name);
    if (!name || name === league.name) return;
    try { await api.updateLeague(league.id, { name }); await refresh(); flash('League renamed'); } catch (err: any) { flash(err.message, 'error'); }
  };

  const deleteLeague = async () => {
    if (!league) return;
    if (!window.confirm(`Delete league "${league.name}" with its ${teams.length} teams and draft? Scoring events are season-wide and stay.`)) return;
    try { await api.deleteLeague(league.id); await refresh(); flash('League deleted'); } catch (err: any) { flash(err.message, 'error'); }
  };

  return (
    <div className="admin-tab-content">
      <div className="scoring-form">
        <h3>Leagues in {season?.show_name} {season?.season_number}</h3>
        <p className="summary-desc">Each league drafts its own teams from the same cast. Scoring is entered once per season and every league reads it.</p>
        <div className="admin-list">
          {leagues.map(l => (
            <div key={l.id} className={`admin-list-item ${league?.id === l.id ? 'selected' : ''}`} onClick={() => selectLeague(l.id)} style={{ cursor: 'pointer' }}>
              <strong>{l.name}</strong>
              <span className="badge">{l.team_count || 0} teams</span>
              <span className="text-muted">/{l.invite_code}</span>
            </div>
          ))}
          {leagues.length === 0 && <div className="empty-state">No leagues yet.</div>}
        </div>
        <form className="admin-form-row" style={{ marginTop: '1rem' }} onSubmit={createLeague}>
          <input className="form-input" placeholder="New league name" value={newLeague} onChange={e => setNewLeague(e.target.value)} />
          <input className="form-input" placeholder="Invite code (optional)" value={newCode} onChange={e => setNewCode(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!newLeague.trim()}>Create league</button>
        </form>
      </div>

      {league && (
        <>
          <div className="scoring-form">
            <h3>{league.name}</h3>
            <div className="admin-league-actions">
              <button className="btn btn-secondary btn-small" onClick={() => navigator.clipboard.writeText(leagueUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
                {copied ? '✓ Copied' : '🔗 Copy invite link'}
              </button>
              {season && <Link className="btn btn-secondary btn-small" to={`/${season.show_slug}/${season.season_number}/leagues/${league.invite_code}/draft`}>Open draft room ↗</Link>}
              <button className="btn btn-secondary btn-small" onClick={renameLeague}>Rename</button>
              <button className="btn btn-danger btn-small" onClick={deleteLeague}>Delete league</button>
            </div>
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              Draft order, roster size, pick clock, start/pause, and undo live in the draft room (you're the commissioner there).
            </p>
          </div>

          <form className="team-form" onSubmit={createTeam}>
            <h3>Add a team</h3>
            <div className="form-row-inline">
              <div className="form-group flex-1">
                <label>Team name</label>
                <input className="form-input" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. Blindside Brigade" />
              </div>
              <div className="form-group flex-1">
                <label>Manager</label>
                <input className="form-input" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Who runs it" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!teamName.trim() || !ownerName.trim()}>Add team</button>
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>League members can also create their own team from the draft room.</p>
          </form>

          <div className="existing-teams">
            <h3>Teams ({teams.length})</h3>
            {teams.map(team => (
              <div key={team.id} className="admin-team-card">
                {editing === team.id ? (
                  <>
                    <div className="admin-team-edit">
                      <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                      <input className="form-input" value={editOwner} onChange={e => setEditOwner(e.target.value)} />
                    </div>
                    <div className="admin-team-actions">
                      <button onClick={() => saveTeam(team.id)} className="btn btn-primary btn-small">Save</button>
                      <button onClick={() => setEditing(null)} className="btn btn-secondary btn-small">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-team-info">
                      <strong>{team.name}</strong>
                      <span className="team-meta">{team.owner_name}{team.draft_order ? ` · drafts ${team.draft_order}${['st', 'nd', 'rd'][team.draft_order - 1] || 'th'}` : ''}</span>
                      <span className="team-meta">{team.players?.length || 0} players · {team.total_score.toFixed(1)} pts</span>
                    </div>
                    <div className="admin-team-actions">
                      <button onClick={() => { setEditing(team.id); setEditName(team.name); setEditOwner(team.owner_name); }} className="btn btn-secondary btn-small">Edit</button>
                      <button onClick={() => deleteTeam(team)} className="btn btn-danger btn-small">Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
