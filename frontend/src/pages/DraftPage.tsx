import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { Player, Team } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTribes } from '../context/TribeContext';
import PlayerCard from '../components/PlayerCard';

export default function DraftPage() {
  const { isAdmin } = useAuth();
  const { activeTribes, getTribeColor } = useTribes();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number>(() => {
    const saved = localStorage.getItem('survivor50_my_team');
    return saved ? parseInt(saved) : 0;
  });
  const [selectedPlayer, setSelectedPlayer] = useState<number>(0);
  const [message, setMessage] = useState('');
  const [tribeFilter, setTribeFilter] = useState<string>('all');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');

  const loadData = useCallback(() => {
    api.getPlayers().then(setPlayers).catch(console.error);
    api.getTeams().then(setTeams).catch(console.error);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Persist team selection
  useEffect(() => {
    if (selectedTeam) localStorage.setItem('survivor50_my_team', String(selectedTeam));
  }, [selectedTeam]);

  const availablePlayers = players.filter(p => !p.team_id);
  const draftedCount = players.filter(p => p.team_id).length;
  const selectedPlayerObj = players.find(p => p.id === selectedPlayer);
  const selectedTeamObj = teams.find(t => t.id === selectedTeam);

  const filteredAvailable = tribeFilter === 'all'
    ? availablePlayers
    : availablePlayers.filter(p => p.tribe === tribeFilter);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handlePick = async () => {
    if (!selectedTeam || !selectedPlayer) return;
    try {
      await api.makePick(selectedTeam, selectedPlayer);
      const playerName = players.find(p => p.id === selectedPlayer)?.name;
      const teamName = teams.find(t => t.id === selectedTeam)?.name;
      flash(`${playerName} drafted to ${teamName}!`);
      setSelectedPlayer(0);
      loadData();
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName || !newOwnerName) return;
    try {
      const newTeam = await api.createTeam({ name: newTeamName, owner_name: newOwnerName });
      setSelectedTeam(newTeam.id);
      setNewTeamName('');
      setNewOwnerName('');
      setShowCreateTeam(false);
      loadData();
      flash('Team created!');
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const handleUndoPick = async (playerId: number) => {
    try {
      await api.undoPick(playerId);
      loadData();
      flash('Pick undone');
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const handleDeleteTeam = async (id: number) => {
    if (!window.confirm('Delete this team and all its picks?')) return;
    try {
      await api.deleteTeam(id);
      if (selectedTeam === id) setSelectedTeam(0);
      loadData();
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const handleResetDraft = async () => {
    if (!window.confirm('Reset the entire draft? This removes ALL picks.')) return;
    try {
      await api.resetDraft();
      loadData();
      flash('Draft reset');
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const draftComplete = draftedCount === 24;

  return (
    <div className="draft-page">
      <h1 className="page-title">THE DRAFT</h1>

      {/* Progress bar */}
      <div className="draft-progress">
        <div className="draft-progress-bar">
          <div className="draft-progress-fill" style={{ width: `${(draftedCount / 24) * 100}%` }} />
        </div>
        <p className="draft-progress-text">
          {draftComplete
            ? 'The draft is complete! All 24 players have been claimed.'
            : `${draftedCount}/24 drafted — ${availablePlayers.length} remaining`}
        </p>
      </div>

      {message && (
        <div className={`toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* Step 1: Pick your team or create one */}
      {!draftComplete && (
        <div className="draft-step">
          <div className="draft-step-header">
            <span className="step-number">{selectedTeam ? '✓' : '1'}</span>
            <span className="step-label">{selectedTeam ? `Playing as ${selectedTeamObj?.name || ''}` : 'Select your team'}</span>
            {selectedTeam > 0 && (
              <button className="step-change-btn" onClick={() => setSelectedTeam(0)}>Change</button>
            )}
          </div>
          {!selectedTeam && (
            <div className="team-picker">
              {teams.map(t => (
                <button
                  key={t.id}
                  className="team-pick-btn"
                  onClick={() => setSelectedTeam(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>{t.owner_name}</span>
                  <span className="team-pick-count">{t.players?.length || 0} picks</span>
                </button>
              ))}
              {!showCreateTeam ? (
                <button className="team-pick-btn team-pick-add" onClick={() => setShowCreateTeam(true)}>
                  <strong>+ New Team</strong>
                  <span>Create your team</span>
                </button>
              ) : (
                <form onSubmit={handleCreateTeam} className="team-create-inline">
                  <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="form-input" placeholder="Team name" autoFocus />
                  <input type="text" value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)} className="form-input" placeholder="Your name" />
                  <div className="team-create-actions">
                    <button type="submit" className="btn btn-primary btn-small">Create</button>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowCreateTeam(false)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Pick a player */}
      {selectedTeam > 0 && !draftComplete && availablePlayers.length > 0 && (
        <div className="draft-step">
          <div className="draft-step-header">
            <span className="step-number">{selectedPlayer ? '✓' : '2'}</span>
            <span className="step-label">
              {selectedPlayer ? `Selected ${selectedPlayerObj?.name}` : 'Tap a player to draft them'}
            </span>
          </div>
          <div className="tribe-filters">
            <button className={`tribe-filter ${tribeFilter === 'all' ? 'active' : ''}`} onClick={() => setTribeFilter('all')}>All</button>
            {activeTribes.map(tribe => (
              <button
                key={tribe.name}
                className={`tribe-filter ${tribeFilter === tribe.name ? 'active' : ''}`}
                onClick={() => setTribeFilter(tribe.name)}
                style={{ '--tribe-color': tribe.color } as React.CSSProperties}
              >
                {tribe.name}
              </button>
            ))}
          </div>
          <div className="cast-grid draft-cast-grid">
            {filteredAvailable.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onClick={() => setSelectedPlayer(p.id === selectedPlayer ? 0 : p.id)}
                selected={selectedPlayer === p.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Draft Board */}
      {teams.length > 0 && (
        <section className="section">
          <h2 className="section-title">Draft Board</h2>
          <div className="draft-board">
            {teams.map(team => (
              <div key={team.id} className={`draft-team-column ${selectedTeam === team.id ? 'my-team' : ''}`}>
                <div className="draft-team-header">
                  <div>
                    <h3>{team.name}</h3>
                    <span className="draft-team-owner">{team.owner_name} — {team.players?.length || 0} picks</span>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleDeleteTeam(team.id)} className="btn-icon delete-btn" title="Delete team">✕</button>
                  )}
                </div>
                <div className="draft-picks-list">
                  {(!team.players || team.players.length === 0) ? (
                    <div className="draft-empty-slot">No picks yet</div>
                  ) : (
                    team.players.map((p: any, idx: number) => (
                      <div key={p.id} className="draft-pick-item" style={{ borderLeftColor: getTribeColor(p.tribe) }}>
                        <span className="draft-pick-num">#{idx + 1}</span>
                        <span className="draft-pick-name">{p.name}</span>
                        <span className="draft-pick-tribe" style={{ color: getTribeColor(p.tribe) }}>{p.tribe}</span>
                        {isAdmin && (
                          <button onClick={() => handleUndoPick(p.id)} className="btn-icon delete-btn" title="Undo">✕</button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isAdmin && teams.length > 0 && (
        <div className="draft-actions" style={{ marginTop: '2rem' }}>
          <button onClick={handleResetDraft} className="btn btn-danger">Reset Entire Draft</button>
        </div>
      )}

      {/* Sticky confirm bar at bottom */}
      {selectedTeam > 0 && selectedPlayer > 0 && !draftComplete && (
        <div className="draft-sticky-bar">
          <div className="draft-sticky-inner">
            <div className="draft-sticky-info">
              <span className="draft-sticky-player">{selectedPlayerObj?.name}</span>
              <span className="draft-sticky-arrow">→</span>
              <span className="draft-sticky-team">{selectedTeamObj?.name}</span>
            </div>
            <button onClick={handlePick} className="btn btn-primary draft-confirm-btn">
              🔥 Confirm Pick
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
