import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTribes } from '../context/TribeContext';
import { api } from '../api';
import { Player, Team, ScoringRule, ScoringEvent, Tribe, Show, Season } from '../types';
import PlayerCard from '../components/PlayerCard';

type AdminTab = 'scoring' | 'challenges' | 'eliminate' | 'teams' | 'draft' | 'tribes' | 'gamestate' | 'summary' | 'manage';

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('scoring');

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/login');
  }, [isAdmin, authLoading, navigate]);

  if (authLoading) return <div className="loading">Loading...</div>;
  if (!isAdmin) return null;

  return (
    <div className="admin-page">
      <h1 className="page-title">TRIBAL COUNCIL</h1>
      <p className="page-subtitle">League Administration</p>

      <div className="tab-bar">
        <button className={`tab ${tab === 'scoring' ? 'active' : ''}`} onClick={() => setTab('scoring')}>
          Add Scores
        </button>
        <button className={`tab ${tab === 'challenges' ? 'active' : ''}`} onClick={() => setTab('challenges')}>
          Challenges
        </button>
        <button className={`tab ${tab === 'eliminate' ? 'active' : ''}`} onClick={() => setTab('eliminate')}>
          Eliminate
        </button>
        <button className={`tab ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
          Manage Teams
        </button>
        <button className={`tab ${tab === 'draft' ? 'active' : ''}`} onClick={() => setTab('draft')}>
          Draft
        </button>
        <button className={`tab ${tab === 'tribes' ? 'active' : ''}`} onClick={() => setTab('tribes')}>
          Tribes
        </button>
        <button className={`tab ${tab === 'gamestate' ? 'active' : ''}`} onClick={() => setTab('gamestate')}>
          Game State
        </button>
        <button className={`tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
          Recap
        </button>
        <button className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>
          Shows/Seasons
        </button>
      </div>

      {tab === 'scoring' && <ScoringTab />}
      {tab === 'challenges' && <ChallengesTab />}
      {tab === 'eliminate' && <EliminateTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'draft' && <DraftTab />}
      {tab === 'tribes' && <TribesTab />}
      {tab === 'gamestate' && <GameStateTab />}
      {tab === 'summary' && <SummaryTab />}
      {tab === 'manage' && <ManageShowsTab />}
    </div>
  );
}

type VoteReceiver = { player_id: number; name: string; votes: number };

function EliminateTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<Player | null>(null);
  const [placement, setPlacement] = useState('');
  const [votesReceived, setVotesReceived] = useState('');
  const [episode, setEpisode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [additionalVotes, setAdditionalVotes] = useState<VoteReceiver[]>([]);
  const [addVotePlayerId, setAddVotePlayerId] = useState('');
  const [addVoteCount, setAddVoteCount] = useState('');

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = () => {
    api.getPlayers().then(setPlayers).catch(console.error);
  };

  const activePlayers = players.filter(p => !p.is_eliminated);
  const eliminatedPlayers = players.filter(p => p.is_eliminated);

  const openEliminateModal = (player: Player) => {
    setTargetPlayer(player);
    // Default placement to current number of active players (they're the next one out)
    setPlacement(String(activePlayers.length));
    setVotesReceived('');
    setEpisode('');
    setAdditionalVotes([]);
    setAddVotePlayerId('');
    setAddVoteCount('');
    setShowModal(true);
  };

  const handleEliminate = async () => {
    if (!targetPlayer || !placement) return;
    const placementNum = parseInt(placement);
    if (placementNum < 1) {
      setMessage('Error: Placement must be at least 1');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Add placement scoring event (this also sets is_eliminated + placement on the player)
      await api.addScoringEvent({
        player_id: targetPlayer.id,
        event_type: 'placement',
        custom_points: placementNum,
        episode: episode ? parseInt(episode) : undefined,
        notes: `Eliminated — placed ${placementNum}`,
      });

      // 2. Add votes received scoring events (one per vote, each at -0.25)
      const votes = parseInt(votesReceived);
      if (votes > 0) {
        for (let i = 0; i < votes; i++) {
          await api.addScoringEvent({
            player_id: targetPlayer.id,
            event_type: 'receives_votes',
            episode: episode ? parseInt(episode) : undefined,
            notes: i === 0 ? `Received ${votes} vote${votes > 1 ? 's' : ''} at tribal` : undefined,
          });
        }
      }

      // 3. Add votes for other players who received votes but weren't eliminated
      for (const rv of additionalVotes) {
        for (let i = 0; i < rv.votes; i++) {
          await api.addScoringEvent({
            player_id: rv.player_id,
            event_type: 'receives_votes',
            episode: episode ? parseInt(episode) : undefined,
            notes: i === 0 ? `Received ${rv.votes} vote${rv.votes > 1 ? 's' : ''} at tribal` : undefined,
          });
        }
      }

      const additionalSummary = additionalVotes.length > 0
        ? ` | Also voted: ${additionalVotes.map(rv => `${rv.name} (${rv.votes})`).join(', ')}`
        : '';
      setMessage(`🔥 ${targetPlayer.name} has been voted out! (Placement: ${placementNum}${votes > 0 ? `, ${votes} votes` : ''}${additionalSummary})`);
      setShowModal(false);
      setTargetPlayer(null);
      loadPlayers();
      setTimeout(() => setMessage(''), 5000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReinstate = async (player: Player) => {
    if (!window.confirm(`Reinstate ${player.name}? This will NOT remove their scoring events — do that manually in the Scores tab if needed.`)) return;
    try {
      await api.updatePlayer(player.id, { is_eliminated: false, placement: null });
      setMessage(`${player.name} reinstated`);
      loadPlayers();
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="admin-tab-content">
      {message && (
        <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="eliminate-section">
        <h3>Still in the Game ({activePlayers.length})</h3>
        <p className="eliminate-hint">Tap a player to eliminate them</p>
        <div className="cast-grid">
          {activePlayers.map(p => (
            <div key={p.id} className="eliminate-card-wrapper" onClick={() => openEliminateModal(p)}>
              <PlayerCard player={p} onClick={() => openEliminateModal(p)} />
            </div>
          ))}
        </div>
      </div>

      {eliminatedPlayers.length > 0 && (
        <div className="eliminate-section" style={{ marginTop: '2rem' }}>
          <h3>Voted Out ({eliminatedPlayers.length})</h3>
          <p className="eliminate-hint">Tap to undo elimination</p>
          <div className="cast-grid">
            {eliminatedPlayers.map(p => (
              <div key={p.id} className="eliminate-card-wrapper">
                <PlayerCard player={p} onClick={() => handleReinstate(p)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Elimination Modal */}
      {showModal && targetPlayer && (
        <div className="modal-overlay" onClick={() => !submitting && setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>🔥 Eliminate {targetPlayer.name}</h3>
            <p className="modal-subtitle">{targetPlayer.tribe} tribe</p>

            <div className="form-group">
              <label>Placement (1 = Winner, 24 = First Boot)</label>
              <input
                type="number"
                min="1"
                max="24"
                value={placement}
                onChange={e => setPlacement(e.target.value)}
                className="form-input"
                placeholder="e.g. 18"
              />
              {placement && parseInt(placement) >= 1 && (
                <div className="placement-preview">
                  Placement points calculated by backend (cast_count + 1 - {placement})
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Votes Received at Tribal (0 if no votes)</label>
              <input
                type="number"
                min="0"
                max="20"
                value={votesReceived}
                onChange={e => setVotesReceived(e.target.value)}
                className="form-input"
                placeholder="e.g. 5"
              />
              {votesReceived && parseInt(votesReceived) > 0 && (
                <div className="placement-preview negative">
                  Vote penalty: {(parseInt(votesReceived) * -0.25).toFixed(2)} pts
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Episode (optional)</label>
              <input
                type="number"
                min="1"
                value={episode}
                onChange={e => setEpisode(e.target.value)}
                className="form-input"
                placeholder="Ep #"
              />
            </div>

            <div className="form-group">
              <label>Other Players Who Received Votes</label>
              {additionalVotes.map(rv => (
                <div key={rv.player_id} className="additional-vote-row">
                  <span>{rv.name} — {rv.votes} vote{rv.votes > 1 ? 's' : ''} <span className="negative">({(rv.votes * -0.25).toFixed(2)} pts)</span></span>
                  <button
                    className="btn-remove-vote"
                    onClick={() => setAdditionalVotes(prev => prev.filter(r => r.player_id !== rv.player_id))}
                  >✕</button>
                </div>
              ))}
              <div className="additional-vote-add">
                <select
                  value={addVotePlayerId}
                  onChange={e => setAddVotePlayerId(e.target.value)}
                  className="form-input"
                >
                  <option value="">Select player...</option>
                  {activePlayers
                    .filter(p => p.id !== targetPlayer.id && !additionalVotes.some(rv => rv.player_id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                  }
                </select>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={addVoteCount}
                  onChange={e => setAddVoteCount(e.target.value)}
                  className="form-input vote-count-input"
                  placeholder="# votes"
                />
                <button
                  className="btn btn-secondary"
                  disabled={!addVotePlayerId || !addVoteCount || parseInt(addVoteCount) < 1}
                  onClick={() => {
                    const player = activePlayers.find(p => p.id === parseInt(addVotePlayerId));
                    if (!player) return;
                    setAdditionalVotes(prev => [...prev, { player_id: player.id, name: player.name, votes: parseInt(addVoteCount) }]);
                    setAddVotePlayerId('');
                    setAddVoteCount('');
                  }}
                >Add</button>
              </div>
            </div>

            {placement && parseInt(placement) >= 1 && (
              <div className="eliminate-summary">
                <strong>Summary:</strong> {targetPlayer.name} finishes {placement}{placement === '1' ? 'st' : placement === '2' ? 'nd' : placement === '3' ? 'rd' : 'th'}
                {' '}&rarr; placement points + vote penalties calculated by backend
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-secondary"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleEliminate}
                className="btn btn-danger"
                disabled={submitting || !placement}
              >
                {submitting ? 'Eliminating...' : '🔥 Confirm Elimination'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoringTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number>(0);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [episode, setEpisode] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [placement, setPlacement] = useState<string>('');
  const [message, setMessage] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [showRulesManager, setShowRulesManager] = useState(false);
  // Rule editing state
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editRuleType, setEditRuleType] = useState('');
  const [editRulePoints, setEditRulePoints] = useState('');
  const [editRuleDesc, setEditRuleDesc] = useState('');
  const [editRuleVariable, setEditRuleVariable] = useState(false);
  // New rule state
  const [newRuleType, setNewRuleType] = useState('');
  const [newRulePoints, setNewRulePoints] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [newRuleVariable, setNewRuleVariable] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    api.getPlayers().then(setPlayers).catch(console.error);
    api.getScoringRules().then(setRules).catch(console.error);
    api.getScoringEvents(30).then(setEvents).catch(console.error);
  };

  const togglePlayerSelection = (id: number) => {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (bulkMode) {
        if (selectedPlayers.length === 0 || !selectedEvent) {
          setMessage('Select players and an event type');
          return;
        }
        await api.addBulkScoringEvents({
          player_ids: selectedPlayers,
          event_type: selectedEvent,
          episode: episode ? parseInt(episode) : undefined,
          notes: notes || undefined,
        });
        setMessage(`Added "${selectedEvent.replace(/_/g, ' ')}" for ${selectedPlayers.length} players!`);
        setSelectedPlayers([]);
      } else {
        if (!selectedPlayer || !selectedEvent) {
          setMessage('Select a player and event type');
          return;
        }
        const data: any = {
          player_id: selectedPlayer,
          event_type: selectedEvent,
          episode: episode ? parseInt(episode) : undefined,
          notes: notes || undefined,
        };
        if (selectedEvent === 'placement') {
          data.custom_points = parseInt(placement);
        }
        await api.addScoringEvent(data);
        const playerName = players.find(p => p.id === selectedPlayer)?.name;
        setMessage(`Score added for ${playerName}!`);
      }
      setSelectedPlayer(0);
      setSelectedEvent('');
      setEpisode('');
      setNotes('');
      setPlacement('');
      loadData();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDeleteEvent = async (id: number) => {
    try {
      await api.deleteScoringEvent(id);
      loadData();
      setMessage('Event deleted');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  // --- Scoring Rules CRUD ---
  const startEditingRule = (rule: ScoringRule) => {
    setEditingRuleId(rule.id);
    setEditRuleType(rule.event_type);
    setEditRulePoints(String(rule.points));
    setEditRuleDesc(rule.description);
    setEditRuleVariable(rule.is_variable);
  };

  const cancelEditingRule = () => {
    setEditingRuleId(null);
    setEditRuleType('');
    setEditRulePoints('');
    setEditRuleDesc('');
    setEditRuleVariable(false);
  };

  const handleSaveRule = async (id: number) => {
    if (!editRuleType || !editRuleDesc || editRulePoints === '') return;
    try {
      await api.updateScoringRule(id, {
        event_type: editRuleType,
        points: parseFloat(editRulePoints),
        description: editRuleDesc,
        is_variable: editRuleVariable,
      });
      setEditingRuleId(null);
      loadData();
      setMessage('Rule updated!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('Delete this scoring rule? Events using this rule will NOT be deleted.')) return;
    try {
      await api.deleteScoringRule(id);
      loadData();
      setMessage('Rule deleted');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleType || !newRuleDesc || newRulePoints === '') {
      setMessage('Error: All fields are required');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    try {
      await api.createScoringRule({
        event_type: newRuleType,
        points: parseFloat(newRulePoints),
        description: newRuleDesc,
        is_variable: newRuleVariable,
      });
      setNewRuleType('');
      setNewRulePoints('');
      setNewRuleDesc('');
      setNewRuleVariable(false);
      loadData();
      setMessage('Rule created!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const selectedRule = rules.find(r => r.event_type === selectedEvent);

  return (
    <div className="admin-tab-content">
      <form onSubmit={handleSubmit} className="scoring-form">
        <div className="form-row">
          <label className="form-toggle">
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={e => { setBulkMode(e.target.checked); setSelectedPlayers([]); }}
            />
            <span>Bulk Mode (multiple players)</span>
          </label>
        </div>

        {!bulkMode ? (
          <div className="form-group">
            <label>Player</label>
            <select
              value={selectedPlayer}
              onChange={e => setSelectedPlayer(parseInt(e.target.value))}
              className="form-select"
            >
              <option value={0}>-- Select Player --</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.tribe}) {p.is_eliminated ? '(OUT)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label>Select Players ({selectedPlayers.length} selected)</label>
            <div className="bulk-player-grid">
              {players.filter(p => !p.is_eliminated).map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  compact
                  selected={selectedPlayers.includes(p.id)}
                  onClick={() => togglePlayerSelection(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Scoring Event</label>
          <select
            value={selectedEvent}
            onChange={e => setSelectedEvent(e.target.value)}
            className="form-select"
          >
            <option value="">-- Select Event --</option>
            {rules.map(r => (
              <option key={r.event_type} value={r.event_type}>
                {r.description} ({r.is_variable ? 'variable' : (r.points > 0 ? '+' : '') + r.points})
              </option>
            ))}
          </select>
        </div>

        {selectedEvent === 'placement' && (
          <div className="form-group">
            <label>Placement (1 = Winner, 24 = First Boot)</label>
            <input
              type="number"
              min="1"
              max="24"
              value={placement}
              onChange={e => setPlacement(e.target.value)}
              className="form-input"
              placeholder="Enter placement..."
            />
            {placement && (
              <div className="placement-preview">
                Points calculated dynamically based on season cast count
              </div>
            )}
          </div>
        )}

        <div className="form-row-inline">
          <div className="form-group">
            <label>Episode (optional)</label>
            <input
              type="number"
              min="1"
              value={episode}
              onChange={e => setEpisode(e.target.value)}
              className="form-input"
              placeholder="Ep #"
            />
          </div>
          <div className="form-group flex-1">
            <label>Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="form-input"
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {selectedRule && !selectedRule.is_variable && (
          <div className="points-preview">
            {bulkMode ? `${selectedPlayers.length} × ` : ''}
            {selectedRule.points > 0 ? '+' : ''}{selectedRule.points} points
            {bulkMode ? ` = ${(selectedPlayers.length * selectedRule.points).toFixed(2)} total` : ''}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full">
          🔥 Add Score{bulkMode ? 's' : ''}
        </button>

        {message && (
          <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </form>

      <div className="recent-events">
        <h3>Recent Scoring Events</h3>
        <table className="log-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Event</th>
              <th>Points</th>
              <th>Ep</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id}>
                <td>{event.player_name}</td>
                <td>{event.event_type.replace(/_/g, ' ')}</td>
                <td className={event.points >= 0 ? 'positive' : 'negative'}>
                  {event.points > 0 ? '+' : ''}{event.points}
                </td>
                <td>{event.episode || '-'}</td>
                <td>
                  <button
                    onClick={() => handleDeleteEvent(event.id)}
                    className="btn-icon delete-btn"
                    title="Delete"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scoring Rules Manager */}
      <div className="rules-manager">
        <div className="rules-manager-header" onClick={() => setShowRulesManager(!showRulesManager)}>
          <h3>⚙️ Scoring Rules ({rules.length})</h3>
          <span className="rules-toggle">{showRulesManager ? '▼' : '▶'}</span>
        </div>

        {showRulesManager && (
          <div className="rules-manager-content">
            {/* Existing rules table */}
            <table className="log-table rules-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Points</th>
                  <th>Description</th>
                  <th>Variable</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    {editingRuleId === rule.id ? (
                      <>
                        <td>
                          <input
                            type="text"
                            value={editRuleType}
                            onChange={e => setEditRuleType(e.target.value)}
                            className="form-input form-input-sm"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.25"
                            value={editRulePoints}
                            onChange={e => setEditRulePoints(e.target.value)}
                            className="form-input form-input-sm"
                            style={{ width: '80px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editRuleDesc}
                            onChange={e => setEditRuleDesc(e.target.value)}
                            className="form-input form-input-sm"
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={editRuleVariable}
                            onChange={e => setEditRuleVariable(e.target.checked)}
                          />
                        </td>
                        <td className="rules-actions">
                          <button onClick={() => handleSaveRule(rule.id)} className="btn btn-primary btn-small">Save</button>
                          <button onClick={cancelEditingRule} className="btn btn-secondary btn-small">✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><code>{rule.event_type}</code></td>
                        <td className={rule.points >= 0 ? 'positive' : 'negative'}>
                          {rule.points > 0 ? '+' : ''}{rule.points}
                        </td>
                        <td>{rule.description}</td>
                        <td>{rule.is_variable ? '✓' : ''}</td>
                        <td className="rules-actions">
                          <button onClick={() => startEditingRule(rule)} className="btn btn-secondary btn-small">Edit</button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="btn-icon delete-btn" title="Delete">✕</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Create new rule form */}
            <form onSubmit={handleCreateRule} className="new-rule-form">
              <h4>Add New Rule</h4>
              <div className="form-row-inline">
                <div className="form-group">
                  <label>Event Type (snake_case)</label>
                  <input
                    type="text"
                    value={newRuleType}
                    onChange={e => setNewRuleType(e.target.value)}
                    className="form-input"
                    placeholder="e.g. wins_reward"
                  />
                </div>
                <div className="form-group">
                  <label>Points</label>
                  <input
                    type="number"
                    step="0.25"
                    value={newRulePoints}
                    onChange={e => setNewRulePoints(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 3"
                    style={{ width: '100px' }}
                  />
                </div>
              </div>
              <div className="form-row-inline">
                <div className="form-group flex-1">
                  <label>Description</label>
                  <input
                    type="text"
                    value={newRuleDesc}
                    onChange={e => setNewRuleDesc(e.target.value)}
                    className="form-input"
                    placeholder="e.g. Wins reward challenge"
                  />
                </div>
                <label className="form-toggle" style={{ alignSelf: 'flex-end', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={newRuleVariable}
                    onChange={e => setNewRuleVariable(e.target.checked)}
                  />
                  <span>Variable points</span>
                </label>
              </div>
              <button type="submit" className="btn btn-primary">+ Add Rule</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [draftOrder, setDraftOrder] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editOwner, setEditOwner] = useState('');

  useEffect(() => { loadTeams(); }, []);

  const loadTeams = () => {
    api.getTeams().then(setTeams).catch(console.error);
  };

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ownerName) return;
    try {
      await api.createTeam({
        name,
        owner_name: ownerName,
        draft_order: draftOrder ? parseInt(draftOrder) : undefined,
      });
      setName('');
      setOwnerName('');
      setDraftOrder('');
      loadTeams();
      flash('Team created!');
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const startEditing = (team: Team) => {
    setEditingId(team.id);
    setEditName(team.name);
    setEditOwner(team.owner_name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditOwner('');
  };

  const handleSaveEdit = async (id: number) => {
    if (!editName || !editOwner) return;
    try {
      await api.updateTeam(id, { name: editName, owner_name: editOwner });
      setEditingId(null);
      loadTeams();
      flash('Team updated!');
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this team? This will remove all draft picks.')) return;
    try {
      await api.deleteTeam(id);
      loadTeams();
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    }
  };

  return (
    <div className="admin-tab-content">
      <form onSubmit={handleCreate} className="team-form">
        <h3>Create New Team</h3>
        <div className="form-row-inline">
          <div className="form-group flex-1">
            <label>Team Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="form-input"
              placeholder="e.g. Blindside Brigade"
            />
          </div>
          <div className="form-group flex-1">
            <label>Manager Name</label>
            <input
              type="text"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              className="form-input"
              placeholder="e.g. Nathan"
            />
          </div>
          <div className="form-group">
            <label>Draft Order</label>
            <input
              type="number"
              min="1"
              value={draftOrder}
              onChange={e => setDraftOrder(e.target.value)}
              className="form-input"
              placeholder="#"
              style={{ width: '80px' }}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Create Team</button>
      </form>

      {message && (
        <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="existing-teams">
        <h3>Existing Teams ({teams.length})</h3>
        {teams.map(team => (
          <div key={team.id} className="admin-team-card">
            {editingId === team.id ? (
              <>
                <div className="admin-team-edit">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="form-input"
                    placeholder="Team name"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editOwner}
                    onChange={e => setEditOwner(e.target.value)}
                    className="form-input"
                    placeholder="Manager name"
                  />
                </div>
                <div className="admin-team-actions">
                  <button onClick={() => handleSaveEdit(team.id)} className="btn btn-primary btn-small">Save</button>
                  <button onClick={cancelEditing} className="btn btn-secondary btn-small">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="admin-team-info">
                  <strong>{team.name}</strong>
                  <span className="team-meta">{team.owner_name} — Draft #{team.draft_order || '?'}</span>
                  <span className="team-meta">{team.players?.length || 0} players — {team.total_score.toFixed(1)} pts</span>
                </div>
                <div className="admin-team-actions">
                  <button onClick={() => startEditing(team)} className="btn btn-secondary btn-small">Edit</button>
                  <button onClick={() => handleDelete(team.id)} className="btn btn-danger btn-small">Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number>(0);
  const [selectedPlayer, setSelectedPlayer] = useState<number>(0);
  const [message, setMessage] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    api.getPlayers().then(setPlayers).catch(console.error);
    api.getTeams().then(setTeams).catch(console.error);
  };

  const availablePlayers = players.filter(p => !p.team_id);
  const draftedPlayers = players.filter(p => p.team_id);

  const handlePick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !selectedPlayer) {
      setMessage('Select both a team and a player');
      setTimeout(() => setMessage(''), 2000);
      return;
    }
    try {
      await api.makePick(selectedTeam, selectedPlayer);
      const playerName = players.find(p => p.id === selectedPlayer)?.name;
      const teamName = teams.find(t => t.id === selectedTeam)?.name;
      setMessage(`${playerName} drafted to ${teamName}!`);
      setSelectedPlayer(0);
      loadData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const handleUndoPick = async (playerId: number) => {
    try {
      await api.undoPick(playerId);
      loadData();
      setMessage('Pick undone');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const handleResetDraft = async () => {
    if (!window.confirm('Reset the entire draft? This removes ALL picks.')) return;
    try {
      await api.resetDraft();
      loadData();
      setMessage('Draft reset');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="admin-tab-content">
      <form onSubmit={handlePick} className="draft-form">
        <h3>Make a Draft Pick</h3>
        <div className="form-row-inline">
          <div className="form-group flex-1">
            <label>Team</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(parseInt(e.target.value))}
              className="form-select"
            >
              <option value={0}>-- Select Team --</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.owner_name}) — {t.players?.length || 0} players
                </option>
              ))}
            </select>
          </div>
          <div className="form-group flex-1">
            <label>Available Player</label>
            <select
              value={selectedPlayer}
              onChange={e => setSelectedPlayer(parseInt(e.target.value))}
              className="form-select"
            >
              <option value={0}>-- Select Player --</option>
              {availablePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">🔥 Draft Player</button>
        {message && (
          <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </form>

      <div className="draft-status">
        <div className="draft-counts">
          <span className="draft-count-item">
            <strong>{availablePlayers.length}</strong> Available
          </span>
          <span className="draft-count-item">
            <strong>{draftedPlayers.length}</strong> Drafted
          </span>
        </div>
      </div>

      <div className="available-players-section">
        <h3>Available Players ({availablePlayers.length})</h3>
        <div className="draft-player-grid">
          {availablePlayers.map(p => (
            <PlayerCard
              key={p.id}
              player={p}
              compact
              onClick={() => setSelectedPlayer(p.id)}
              selected={selectedPlayer === p.id}
            />
          ))}
        </div>
      </div>

      {teams.length > 0 && (
        <div className="draft-rosters">
          <h3>Current Rosters</h3>
          <div className="rosters-grid">
            {teams.map(team => (
              <div key={team.id} className="roster-card">
                <h4>{team.name} <span className="roster-owner">({team.owner_name})</span></h4>
                {team.players?.length === 0 ? (
                  <p className="empty-roster">No players yet</p>
                ) : (
                  <ul className="roster-list">
                    {team.players?.map((p: any) => (
                      <li key={p.id} className="roster-item">
                        <span>{p.name}</span>
                        <button
                          onClick={() => handleUndoPick(p.id)}
                          className="btn-icon delete-btn"
                          title="Undo pick"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="draft-actions">
        <button onClick={handleResetDraft} className="btn btn-danger">Reset Entire Draft</button>
      </div>
    </div>
  );
}

function TribesTab() {
  const { tribes, activeTribes, getTribeColor, refresh: refreshTribes } = useTribes();
  const [players, setPlayers] = useState<Player[]>([]);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'view' | 'swap' | 'merge'>('view');

  // Swap state
  const [swapEpisode, setSwapEpisode] = useState('');
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [newTribeName, setNewTribeName] = useState('');
  const [newTribeColor, setNewTribeColor] = useState('#E87830');
  const [newTribes, setNewTribes] = useState<{ name: string; color: string }[]>([]);
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  // Merge state
  const [mergeEpisode, setMergeEpisode] = useState('');
  const [mergeTribeName, setMergeTribeName] = useState('');
  const [mergeTribeColor, setMergeTribeColor] = useState('#D4A843');
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  useEffect(() => {
    api.getPlayers().then(setPlayers).catch(console.error);
  }, []);

  const activePlayers = players.filter(p => !p.is_eliminated);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleAddNewTribe = () => {
    if (!newTribeName) return;
    if (newTribes.some(t => t.name === newTribeName) || tribes.some(t => t.name === newTribeName)) {
      flash('Error: Tribe name already exists');
      return;
    }
    setNewTribes([...newTribes, { name: newTribeName, color: newTribeColor }]);
    setNewTribeName('');
    setNewTribeColor('#E87830');
  };

  const handleRemoveNewTribe = (name: string) => {
    setNewTribes(newTribes.filter(t => t.name !== name));
    // Clear assignments that used this tribe
    const updated = { ...assignments };
    Object.entries(updated).forEach(([k, v]) => {
      if (v === name) delete updated[parseInt(k)];
    });
    setAssignments(updated);
  };

  const allAvailableTribes = [...activeTribes, ...newTribes.map((t, i) => ({ ...t, id: -1 - i, phase: 'swap', introduced_episode: null, is_active: true }))];

  const handleSwapSubmit = async () => {
    if (!swapEpisode) { flash('Error: Episode is required'); return; }
    const assignmentList = Object.entries(assignments)
      .filter(([, tribe]) => tribe !== '')
      .map(([playerId, tribe]) => ({ player_id: parseInt(playerId), tribe_name: tribe }));
    if (assignmentList.length === 0) { flash('Error: No tribe assignments made'); return; }

    setSwapSubmitting(true);
    try {
      await api.performSwap({
        episode: parseInt(swapEpisode),
        assignments: assignmentList,
        new_tribes: newTribes.length > 0 ? newTribes : undefined,
      });
      flash(`Tribe swap completed! ${assignmentList.length} players reassigned.`);
      setMode('view');
      setAssignments({});
      setNewTribes([]);
      setSwapEpisode('');
      refreshTribes();
      api.getPlayers().then(setPlayers).catch(console.error);
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleMergeSubmit = async () => {
    if (!mergeEpisode || !mergeTribeName) { flash('Error: Episode and tribe name are required'); return; }

    setMergeSubmitting(true);
    try {
      await api.performMerge({
        episode: parseInt(mergeEpisode),
        tribe_name: mergeTribeName,
        tribe_color: mergeTribeColor,
      });
      flash(`Merge complete! All active players are now ${mergeTribeName}.`);
      setMode('view');
      setMergeEpisode('');
      setMergeTribeName('');
      refreshTribes();
      api.getPlayers().then(setPlayers).catch(console.error);
    } catch (err: any) {
      flash(`Error: ${err.message}`);
    } finally {
      setMergeSubmitting(false);
    }
  };

  return (
    <div className="admin-tab-content">
      {message && (
        <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* Mode buttons */}
      <div className="tribes-mode-bar">
        <button className={`btn ${mode === 'view' ? 'btn-primary' : 'btn-secondary'} btn-small`} onClick={() => setMode('view')}>Current Tribes</button>
        <button className={`btn ${mode === 'swap' ? 'btn-primary' : 'btn-secondary'} btn-small`} onClick={() => setMode('swap')}>Tribe Swap</button>
        <button className={`btn ${mode === 'merge' ? 'btn-primary' : 'btn-secondary'} btn-small`} onClick={() => setMode('merge')}>Merge</button>
      </div>

      {/* VIEW MODE */}
      {mode === 'view' && (
        <div className="tribes-view">
          <h3>All Tribes</h3>
          <div className="tribes-list">
            {tribes.map(tribe => (
              <div key={tribe.id} className={`tribe-card ${!tribe.is_active ? 'inactive' : ''}`}>
                <div className="tribe-card-color" style={{ backgroundColor: tribe.color }} />
                <div className="tribe-card-info">
                  <strong>{tribe.name}</strong>
                  <span className="tribe-card-meta">
                    {tribe.phase} {tribe.introduced_episode ? `(Ep. ${tribe.introduced_episode})` : ''}
                    {!tribe.is_active && ' — Inactive'}
                  </span>
                </div>
                <div className="tribe-card-count">
                  {activePlayers.filter(p => p.tribe === tribe.name).length} players
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SWAP MODE */}
      {mode === 'swap' && (
        <div className="tribes-swap">
          <div className="scoring-form">
            <h3>🔀 Tribe Swap</h3>
            <p className="summary-desc">Reassign players to new or existing tribes. Only change the players who are moving — leave others alone.</p>

            <div className="form-group">
              <label>Episode</label>
              <input type="number" min="1" value={swapEpisode} onChange={e => setSwapEpisode(e.target.value)} className="form-input" placeholder="Ep #" />
            </div>

            {/* Add new tribe */}
            <div className="swap-new-tribe">
              <label>Add New Tribe (optional)</label>
              <div className="form-row-inline">
                <input type="text" value={newTribeName} onChange={e => setNewTribeName(e.target.value)} className="form-input" placeholder="Tribe name" style={{ flex: 1 }} />
                <input type="color" value={newTribeColor} onChange={e => setNewTribeColor(e.target.value)} className="color-picker" />
                <button type="button" onClick={handleAddNewTribe} className="btn btn-secondary btn-small">+ Add</button>
              </div>
              {newTribes.length > 0 && (
                <div className="new-tribes-chips">
                  {newTribes.map(t => (
                    <span key={t.name} className="tribe-chip" style={{ borderColor: t.color, color: t.color }}>
                      {t.name}
                      <button onClick={() => handleRemoveNewTribe(t.name)} className="tribe-chip-remove">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Player assignments */}
            <div className="swap-assignments">
              <label>Player Assignments</label>
              <div className="swap-player-list">
                {activePlayers.map(p => (
                  <div key={p.id} className="swap-player-row">
                    <span className="swap-player-name">
                      <span className="swap-player-dot" style={{ backgroundColor: getTribeColor(p.tribe) }} />
                      {p.name}
                    </span>
                    <select
                      value={assignments[p.id] || ''}
                      onChange={e => setAssignments({ ...assignments, [p.id]: e.target.value })}
                      className="form-select swap-tribe-select"
                    >
                      <option value="">— Keep {p.tribe} —</option>
                      {allAvailableTribes.filter(t => t.name !== p.tribe).map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {Object.values(assignments).filter(Boolean).length > 0 && (
              <div className="swap-preview">
                <strong>Preview:</strong> {Object.values(assignments).filter(Boolean).length} player(s) moving
                {newTribes.length > 0 && `, ${newTribes.length} new tribe(s)`}
              </div>
            )}

            <button
              onClick={handleSwapSubmit}
              className="btn btn-primary btn-full"
              disabled={swapSubmitting}
            >
              {swapSubmitting ? 'Processing Swap...' : '🔀 Execute Tribe Swap'}
            </button>
          </div>
        </div>
      )}

      {/* MERGE MODE */}
      {mode === 'merge' && (
        <div className="tribes-merge">
          <div className="scoring-form">
            <h3>🤝 Merge Tribes</h3>
            <p className="summary-desc">Merge all active players into a single new tribe. This deactivates all current tribes.</p>

            <div className="form-group">
              <label>Episode</label>
              <input type="number" min="1" value={mergeEpisode} onChange={e => setMergeEpisode(e.target.value)} className="form-input" placeholder="Ep #" />
            </div>

            <div className="form-row-inline">
              <div className="form-group flex-1">
                <label>Merge Tribe Name</label>
                <input type="text" value={mergeTribeName} onChange={e => setMergeTribeName(e.target.value)} className="form-input" placeholder="e.g. Lantana" />
              </div>
              <div className="form-group">
                <label>Color</label>
                <input type="color" value={mergeTribeColor} onChange={e => setMergeTribeColor(e.target.value)} className="color-picker" />
              </div>
            </div>

            <div className="swap-preview">
              <strong>This will:</strong> Move all {activePlayers.length} active players to <span style={{ color: mergeTribeColor, fontWeight: 600 }}>{mergeTribeName || '...'}</span> and deactivate {activeTribes.length} current tribes.
            </div>

            <button
              onClick={handleMergeSubmit}
              className="btn btn-danger btn-full"
              disabled={mergeSubmitting || !mergeTribeName || !mergeEpisode}
            >
              {mergeSubmitting ? 'Merging...' : `🤝 Merge ${activePlayers.length} Players`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type GameStateSection = 'idols' | 'advantages' | 'alliances';

function GameStateTab() {
  const [section, setSection] = useState<GameStateSection>('idols');
  const [players, setPlayers] = useState<Player[]>([]);
  const [idols, setIdols] = useState<any[]>([]);
  const [advantages, setAdvantages] = useState<any[]>([]);
  const [alliances, setAlliances] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  // Idol form
  const [idolPlayerId, setIdolPlayerId] = useState(0);
  const [idolLabel, setIdolLabel] = useState('Hidden Immunity Idol');
  const [idolFoundEp, setIdolFoundEp] = useState('');
  const [idolNotes, setIdolNotes] = useState('');

  // Advantage form
  const [advPlayerId, setAdvPlayerId] = useState(0);
  const [advType, setAdvType] = useState('');
  const [advFoundEp, setAdvFoundEp] = useState('');
  const [advNotes, setAdvNotes] = useState('');

  // Alliance form
  const [allianceName, setAllianceName] = useState('');
  const [allianceEp, setAllianceEp] = useState('');
  const [allianceNotes, setAllianceNotes] = useState('');
  const [allianceMemberIds, setAllianceMemberIds] = useState<number[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = () => {
    api.getPlayers().then(setPlayers).catch(console.error);
    api.getIdols().then(setIdols).catch(console.error);
    api.getAdvantages().then(setAdvantages).catch(console.error);
    api.getAlliances().then(setAlliances).catch(console.error);
  };

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 4000); };
  const activePlayers = players.filter(p => !p.is_eliminated);

  const handleAddIdol = async () => {
    if (!idolPlayerId) return;
    try {
      await api.addIdol({
        player_id: idolPlayerId,
        label: idolLabel || 'Hidden Immunity Idol',
        found_episode: idolFoundEp ? parseInt(idolFoundEp) : undefined,
        notes: idolNotes || undefined,
      });
      setIdolPlayerId(0); setIdolLabel('Hidden Immunity Idol'); setIdolFoundEp(''); setIdolNotes('');
      loadAll();
      flash('Idol added');
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handlePlayIdol = async (id: number, ep: string) => {
    const played_episode = prompt('Which episode was it played?', ep || '');
    if (!played_episode) return;
    try {
      await api.updateIdol(id, { played_episode: parseInt(played_episode), is_active: false });
      loadAll();
      flash('Idol marked as played');
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handleAddAdvantage = async () => {
    if (!advPlayerId || !advType) return;
    try {
      await api.addAdvantage({
        player_id: advPlayerId,
        advantage_type: advType,
        found_episode: advFoundEp ? parseInt(advFoundEp) : undefined,
        notes: advNotes || undefined,
      });
      setAdvPlayerId(0); setAdvType(''); setAdvFoundEp(''); setAdvNotes('');
      loadAll();
      flash('Advantage added');
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handlePlayAdvantage = async (id: number, ep: string) => {
    const played_episode = prompt('Which episode was it used?', ep || '');
    if (!played_episode) return;
    try {
      await api.updateAdvantage(id, { played_episode: parseInt(played_episode), is_active: false });
      loadAll();
      flash('Advantage marked as used');
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handleAddAlliance = async () => {
    if (!allianceName || allianceMemberIds.length === 0) return;
    try {
      await api.createAlliance({
        name: allianceName,
        formed_episode: allianceEp ? parseInt(allianceEp) : undefined,
        notes: allianceNotes || undefined,
        member_ids: allianceMemberIds,
      });
      setAllianceName(''); setAllianceEp(''); setAllianceNotes(''); setAllianceMemberIds([]);
      loadAll();
      flash('Alliance created');
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const toggleAllianceMember = (id: number) => {
    setAllianceMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const advantageTypes = ['Steal-a-Vote', 'Extra Vote', 'Shot in the Dark', 'Safety Without Power', 'Knowledge is Power', 'Bank Your Vote', 'Immunity Idol Nullifier', 'Other'];

  return (
    <div className="admin-tab-content">
      {message && (
        <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="challenge-type-grid">
        <button className={`challenge-type-btn ${section === 'idols' ? 'active' : ''}`} onClick={() => setSection('idols')}>
          <span className="challenge-type-label">Idols</span>
          <span className="challenge-type-sub">{idols.filter(i => i.is_active).length} active</span>
        </button>
        <button className={`challenge-type-btn ${section === 'advantages' ? 'active' : ''}`} onClick={() => setSection('advantages')}>
          <span className="challenge-type-label">Advantages</span>
          <span className="challenge-type-sub">{advantages.filter(a => a.is_active).length} active</span>
        </button>
        <button className={`challenge-type-btn ${section === 'alliances' ? 'active' : ''}`} onClick={() => setSection('alliances')}>
          <span className="challenge-type-label">Alliances</span>
          <span className="challenge-type-sub">{alliances.filter(a => a.is_active).length} active</span>
        </button>
      </div>

      {section === 'idols' && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="scoring-form">
            <h3>Add Idol</h3>
            <div className="form-group">
              <label>Player</label>
              <select value={idolPlayerId} onChange={e => setIdolPlayerId(parseInt(e.target.value))} className="form-select">
                <option value={0}>-- Select player --</option>
                {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Label</label>
              <input type="text" value={idolLabel} onChange={e => setIdolLabel(e.target.value)} className="form-input" placeholder="Hidden Immunity Idol" />
            </div>
            <div className="form-row-inline">
              <div className="form-group">
                <label>Found Episode</label>
                <input type="number" min="1" value={idolFoundEp} onChange={e => setIdolFoundEp(e.target.value)} className="form-input" placeholder="#" style={{ maxWidth: 100 }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Notes</label>
                <input type="text" value={idolNotes} onChange={e => setIdolNotes(e.target.value)} className="form-input" placeholder="Optional details" />
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleAddIdol} disabled={!idolPlayerId}>Add Idol</button>
          </div>

          {idols.length > 0 && (
            <div className="recent-events" style={{ marginTop: '1.5rem' }}>
              <h3>Idol Tracker</h3>
              <table className="log-table">
                <thead>
                  <tr><th>Player</th><th>Label</th><th>Found</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {idols.map(idol => (
                    <tr key={idol.id} style={{ opacity: idol.is_active ? 1 : 0.5 }}>
                      <td>{idol.player_name}</td>
                      <td>{idol.label}{idol.notes ? ` (${idol.notes})` : ''}</td>
                      <td>Ep {idol.found_episode || '?'}</td>
                      <td>{idol.is_active ? 'In pocket' : `Played ep ${idol.played_episode}`}</td>
                      <td>
                        {idol.is_active && (
                          <button className="btn btn-sm" onClick={() => handlePlayIdol(idol.id, '')}>Mark Played</button>
                        )}
                        <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={async () => { await api.deleteIdol(idol.id); loadAll(); }}>Delete</button>
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
            <h3>Add Advantage</h3>
            <div className="form-group">
              <label>Player</label>
              <select value={advPlayerId} onChange={e => setAdvPlayerId(parseInt(e.target.value))} className="form-select">
                <option value={0}>-- Select player --</option>
                {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Advantage Type</label>
              <select value={advType} onChange={e => setAdvType(e.target.value)} className="form-select">
                <option value="">-- Select type --</option>
                {advantageTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {advType === 'Other' && (
                <input type="text" value={advType === 'Other' ? '' : advType} onChange={e => setAdvType(e.target.value)} className="form-input" placeholder="Custom advantage name" style={{ marginTop: 8 }} />
              )}
            </div>
            <div className="form-row-inline">
              <div className="form-group">
                <label>Found Episode</label>
                <input type="number" min="1" value={advFoundEp} onChange={e => setAdvFoundEp(e.target.value)} className="form-input" placeholder="#" style={{ maxWidth: 100 }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Notes</label>
                <input type="text" value={advNotes} onChange={e => setAdvNotes(e.target.value)} className="form-input" placeholder="Optional details" />
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleAddAdvantage} disabled={!advPlayerId || !advType}>Add Advantage</button>
          </div>

          {advantages.length > 0 && (
            <div className="recent-events" style={{ marginTop: '1.5rem' }}>
              <h3>Advantage Tracker</h3>
              <table className="log-table">
                <thead>
                  <tr><th>Player</th><th>Type</th><th>Found</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {advantages.map(adv => (
                    <tr key={adv.id} style={{ opacity: adv.is_active ? 1 : 0.5 }}>
                      <td>{adv.player_name}</td>
                      <td>{adv.advantage_type}{adv.notes ? ` (${adv.notes})` : ''}</td>
                      <td>Ep {adv.found_episode || '?'}</td>
                      <td>{adv.is_active ? 'Held' : `Used ep ${adv.played_episode}`}</td>
                      <td>
                        {adv.is_active && (
                          <button className="btn btn-sm" onClick={() => handlePlayAdvantage(adv.id, '')}>Mark Used</button>
                        )}
                        <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={async () => { await api.deleteAdvantage(adv.id); loadAll(); }}>Delete</button>
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
            <h3>Create Alliance</h3>
            <div className="form-row-inline">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Alliance Name</label>
                <input type="text" value={allianceName} onChange={e => setAllianceName(e.target.value)} className="form-input" placeholder='e.g. "The Legends Pact"' />
              </div>
              <div className="form-group">
                <label>Formed Episode</label>
                <input type="number" min="1" value={allianceEp} onChange={e => setAllianceEp(e.target.value)} className="form-input" placeholder="#" style={{ maxWidth: 100 }} />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input type="text" value={allianceNotes} onChange={e => setAllianceNotes(e.target.value)} className="form-input" placeholder="Optional details" />
            </div>
            <div className="form-group">
              <label>Members ({allianceMemberIds.length} selected)</label>
              <div className="bulk-player-grid">
                {activePlayers.map(p => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    compact
                    selected={allianceMemberIds.includes(p.id)}
                    onClick={() => toggleAllianceMember(p.id)}
                  />
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleAddAlliance} disabled={!allianceName || allianceMemberIds.length === 0}>Create Alliance</button>
          </div>

          {alliances.length > 0 && (
            <div className="recent-events" style={{ marginTop: '1.5rem' }}>
              <h3>Alliance Tracker</h3>
              {alliances.map(alliance => (
                <div key={alliance.id} className="scoring-form" style={{ marginBottom: '1rem', opacity: alliance.is_active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{alliance.name}</strong>
                      {alliance.formed_episode && <span style={{ marginLeft: 8, opacity: 0.7 }}>formed ep {alliance.formed_episode}</span>}
                      {alliance.notes && <span style={{ marginLeft: 8, opacity: 0.7 }}>— {alliance.notes}</span>}
                    </div>
                    <div>
                      {alliance.is_active && (
                        <button className="btn btn-sm" onClick={async () => { await api.updateAlliance(alliance.id, { is_active: false }); loadAll(); }}>Dissolve</button>
                      )}
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={async () => { await api.deleteAlliance(alliance.id); loadAll(); }}>Delete</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(alliance.members || []).map((m: any) => (
                      <span key={m.id} className="tribe-pill" style={{ fontSize: '0.85rem', opacity: m.is_eliminated ? 0.5 : 1 }}>
                        {m.name} {m.is_eliminated ? '(out)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTab() {
  // Show / season / league context
  const [shows, setShows] = useState<Show[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedShowSlug, setSelectedShowSlug] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(0);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(0);

  // Episode recap state
  const [episodes, setEpisodes] = useState<{ episode: number; event_count: number }[]>([]);
  const [selectedEp, setSelectedEp] = useState<number>(0);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [summary, setSummary] = useState('');
  const [epLoading, setEpLoading] = useState(false);
  const [epCopied, setEpCopied] = useState(false);
  const [epMessage, setEpMessage] = useState('');

  // Season recap state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recap, setRecap] = useState('');
  const [recapCopied, setRecapCopied] = useState(false);
  const [recapMessage, setRecapMessage] = useState('');

  useEffect(() => { api.getShows().then(setShows).catch(console.error); }, []);

  useEffect(() => {
    if (selectedShowSlug) {
      api.getSeasons(selectedShowSlug).then(setSeasons).catch(console.error);
    } else {
      setSeasons([]);
    }
    setSelectedSeasonId(0);
    setSelectedLeagueId(0);
  }, [selectedShowSlug]);

  useEffect(() => {
    if (selectedSeasonId) {
      api.getLeagues(selectedSeasonId).then(setLeagues).catch(console.error);
    } else {
      setLeagues([]);
    }
    setSelectedLeagueId(0);
  }, [selectedSeasonId]);

  useEffect(() => {
    if (selectedLeagueId) {
      api.getLeagueEpisodesWithEvents(selectedLeagueId).then(setEpisodes).catch(console.error);
      api.getLeagueTeams(selectedLeagueId).then(setTeams).catch(console.error);
    } else {
      setEpisodes([]);
      setTeams([]);
    }
    setSelectedEp(0);
    setSummary('');
    setSelectedTeamId(0);
    setRecap('');
  }, [selectedLeagueId]);

  useEffect(() => {
    if (selectedLeagueId && selectedEp > 0) {
      api.getLeagueEpisodeEvents(selectedLeagueId, selectedEp).then(setEvents).catch(console.error);
      setSummary('');
    } else {
      setEvents([]);
      setSummary('');
    }
  }, [selectedLeagueId, selectedEp]);

  const copyToClipboard = (text: string, onDone: () => void) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }).finally(onDone);
  };

  const handleGenerateEpisode = async () => {
    if (!selectedLeagueId || !selectedEp) return;
    setEpLoading(true);
    setSummary('');
    setEpMessage('');
    try {
      const result = await api.generateLeagueEpisodeSummary(selectedLeagueId, selectedEp);
      setSummary(result.summary);
    } catch (err: any) {
      setEpMessage(`Error: ${err.message}`);
      setTimeout(() => setEpMessage(''), 4000);
    } finally {
      setEpLoading(false);
    }
  };

  const handleGenerateRecap = async () => {
    if (!selectedLeagueId || !selectedTeamId) return;
    setRecapLoading(true);
    setRecap('');
    setRecapMessage('');
    try {
      const result = await api.generateTeamSeasonRecap(selectedLeagueId, selectedTeamId);
      setRecap(result.recap);
    } catch (err: any) {
      setRecapMessage(`Error: ${err.message}`);
      setTimeout(() => setRecapMessage(''), 4000);
    } finally {
      setRecapLoading(false);
    }
  };

  const leagueSelected = selectedLeagueId > 0;

  return (
    <div className="admin-tab-content">
      {/* Show / Season / League selector */}
      <div className="scoring-form">
        <h3>League Context</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Show</label>
            <select
              value={selectedShowSlug}
              onChange={e => setSelectedShowSlug(e.target.value)}
              className="form-select"
            >
              <option value="">-- Select Show --</option>
              {shows.map(s => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Season</label>
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(parseInt(e.target.value))}
              className="form-select"
              disabled={!selectedShowSlug}
            >
              <option value={0}>-- Select Season --</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  Season {s.season_number}{s.name ? ` — ${s.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>League</label>
            <select
              value={selectedLeagueId}
              onChange={e => setSelectedLeagueId(parseInt(e.target.value))}
              className="form-select"
              disabled={!selectedSeasonId}
            >
              <option value={0}>-- Select League --</option>
              {leagues.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!leagueSelected && (
        <div className="summary-empty" style={{ marginTop: '1rem' }}>
          <p>Select a show, season, and league above to generate recaps.</p>
        </div>
      )}

      {/* Episode Recap */}
      {leagueSelected && (
        <>
          <div className="scoring-form" style={{ marginTop: '1.5rem' }}>
            <h3>📺 Episode Recap Generator</h3>
            <p className="summary-desc">
              Generate a dramatic, funny episode recap to send to your league mates.
            </p>

            {episodes.length === 0 ? (
              <div className="summary-empty">
                <p>No episodes with scoring events yet for this league.</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Select Episode</label>
                  <select
                    value={selectedEp}
                    onChange={e => setSelectedEp(parseInt(e.target.value))}
                    className="form-select"
                  >
                    <option value={0}>-- Choose an Episode --</option>
                    {episodes.map(ep => (
                      <option key={ep.episode} value={ep.episode}>
                        Episode {ep.episode} ({ep.event_count} scoring events)
                      </option>
                    ))}
                  </select>
                </div>
                {selectedEp > 0 && (
                  <button
                    onClick={handleGenerateEpisode}
                    className="btn btn-primary btn-full"
                    disabled={epLoading}
                  >
                    {epLoading ? '🔮 Generating...' : '🔥 Generate Episode Recap'}
                  </button>
                )}
              </>
            )}

            {epMessage && (
              <div className={`form-message ${epMessage.startsWith('Error') ? 'error' : 'success'}`}>
                {epMessage}
              </div>
            )}
          </div>

          {epLoading && (
            <div className="summary-loading">
              <div className="summary-spinner"></div>
              <p>Claude is channeling their inner Jeff Probst...</p>
            </div>
          )}

          {summary && (
            <div className="summary-result">
              <div className="summary-header">
                <h3>🏝️ Episode {selectedEp} Recap</h3>
                <button
                  onClick={() => copyToClipboard(summary, () => { setEpCopied(true); setTimeout(() => setEpCopied(false), 2000); })}
                  className="btn btn-copy"
                >
                  {epCopied ? '✅ Copied!' : '📋 Copy'}
                </button>
              </div>
              <div className="summary-output">{summary}</div>
            </div>
          )}

          {selectedEp > 0 && events.length > 0 && (
            <div className="recent-events" style={{ marginTop: '1.5rem' }}>
              <h3>Raw Scoring Data — Episode {selectedEp}</h3>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Tribe</th>
                    <th>Event</th>
                    <th>Points</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(event => (
                    <tr key={event.id}>
                      <td>{event.player_name}</td>
                      <td>{event.tribe}</td>
                      <td>{event.event_type.replace(/_/g, ' ')}</td>
                      <td className={event.points >= 0 ? 'positive' : 'negative'}>
                        {event.points > 0 ? '+' : ''}{event.points}
                      </td>
                      <td>{event.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Season Recap */}
          <div className="scoring-form" style={{ marginTop: '1.5rem' }}>
            <h3>🏆 End-of-Season Team Recap</h3>
            <p className="summary-desc">
              Generate a personalized full-season recap for a specific team.
            </p>

            {teams.length === 0 ? (
              <div className="summary-empty">
                <p>No teams in this league yet.</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Select Team</label>
                  <select
                    value={selectedTeamId}
                    onChange={e => { setSelectedTeamId(parseInt(e.target.value)); setRecap(''); }}
                    className="form-select"
                  >
                    <option value={0}>-- Choose a Team --</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.owner_name})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTeamId > 0 && (
                  <button
                    onClick={handleGenerateRecap}
                    className="btn btn-primary btn-full"
                    disabled={recapLoading}
                  >
                    {recapLoading ? '🔮 Generating...' : '🏆 Generate Season Recap'}
                  </button>
                )}
              </>
            )}

            {recapMessage && (
              <div className={`form-message ${recapMessage.startsWith('Error') ? 'error' : 'success'}`}>
                {recapMessage}
              </div>
            )}
          </div>

          {recapLoading && (
            <div className="summary-loading">
              <div className="summary-spinner"></div>
              <p>Claude is reviewing the whole season...</p>
            </div>
          )}

          {recap && (
            <div className="summary-result">
              <div className="summary-header">
                <h3>🏝️ Season Recap — {teams.find(t => t.id === selectedTeamId)?.name}</h3>
                <button
                  onClick={() => copyToClipboard(recap, () => { setRecapCopied(true); setTimeout(() => setRecapCopied(false), 2000); })}
                  className="btn btn-copy"
                >
                  {recapCopied ? '✅ Copied!' : '📋 Copy'}
                </button>
              </div>
              <div className="summary-output">{recap}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ChallengeType = 'tribe_reward' | 'tribe_immunity' | 'individual_reward' | 'individual_immunity';

function ChallengesTab() {
  const { tribes } = useTribes();
  const [players, setPlayers] = useState<Player[]>([]);
  const [challengeType, setChallengeType] = useState<ChallengeType>('tribe_immunity');
  const [episode, setEpisode] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tribe challenge state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);

  // Individual reward state
  const [rewardWinnerId, setRewardWinnerId] = useState<number>(0);
  const [chosenForReward, setChosenForReward] = useState<number[]>([]);

  // Individual immunity state
  const [immunityWinners, setImmunityWinners] = useState<number[]>([]);

  useEffect(() => { api.getPlayers().then(setPlayers).catch(console.error); }, []);

  const activePlayers = players.filter(p => !p.is_eliminated);
  const activeTribes = tribes.filter(t => t.is_active);

  const reset = () => {
    setSelectedPlayerIds([]);
    setRewardWinnerId(0);
    setChosenForReward([]);
    setImmunityWinners([]);
    setEpisode('');
  };

  const selectTribe = (tribeName: string) => {
    const tribePlayerIds = activePlayers.filter(p => p.tribe === tribeName).map(p => p.id);
    const allSelected = tribePlayerIds.every(id => selectedPlayerIds.includes(id));
    if (allSelected) {
      setSelectedPlayerIds(prev => prev.filter(id => !tribePlayerIds.includes(id)));
    } else {
      setSelectedPlayerIds(prev => [...new Set([...prev, ...tribePlayerIds])]);
    }
  };

  const togglePlayer = (id: number) => {
    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleChosenForReward = (id: number) => {
    setChosenForReward(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleImmunityWinner = (id: number) => {
    setImmunityWinners(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    const ep = episode ? parseInt(episode) : undefined;
    setSubmitting(true);
    try {
      if (challengeType === 'tribe_reward' || challengeType === 'tribe_immunity') {
        if (selectedPlayerIds.length === 0) {
          setMessage('Error: Select at least one player');
          setSubmitting(false);
          return;
        }
        const event_type = challengeType === 'tribe_reward' ? 'tribe_wins_reward' : 'tribe_wins_immunity';
        await api.addBulkScoringEvents({ player_ids: selectedPlayerIds, event_type, episode: ep });
        setMessage(`${challengeType === 'tribe_reward' ? 'Tribe reward' : 'Tribe immunity'} logged for ${selectedPlayerIds.length} players`);

      } else if (challengeType === 'individual_reward') {
        if (!rewardWinnerId) {
          setMessage('Error: Select the challenge winner');
          setSubmitting(false);
          return;
        }
        await api.addScoringEvent({ player_id: rewardWinnerId, event_type: 'wins_individual_reward', episode: ep });
        for (const pid of chosenForReward) {
          await api.addScoringEvent({ player_id: pid, event_type: 'chosen_for_reward', episode: ep });
        }
        const winnerName = activePlayers.find(p => p.id === rewardWinnerId)?.name;
        setMessage(`Individual reward logged — winner: ${winnerName}${chosenForReward.length > 0 ? `, ${chosenForReward.length} chosen for reward` : ''}`);

      } else if (challengeType === 'individual_immunity') {
        if (immunityWinners.length === 0) {
          setMessage('Error: Select at least one immunity winner');
          setSubmitting(false);
          return;
        }
        for (const pid of immunityWinners) {
          await api.addScoringEvent({ player_id: pid, event_type: 'wins_individual_immunity', episode: ep });
        }
        const names = immunityWinners.map(id => activePlayers.find(p => p.id === id)?.name).join(', ');
        setMessage(`Individual immunity logged — winner${immunityWinners.length > 1 ? 's' : ''}: ${names}`);
      }

      reset();
      setTimeout(() => setMessage(''), 5000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const challengeOptions: { type: ChallengeType; label: string; sub: string }[] = [
    { type: 'tribe_immunity', label: 'Tribe Immunity', sub: '+1 pt / player' },
    { type: 'tribe_reward', label: 'Tribe Reward', sub: '+0.5 pts / player' },
    { type: 'individual_immunity', label: 'Individual Immunity', sub: 'Winner +3 pts' },
    { type: 'individual_reward', label: 'Individual Reward', sub: 'Win +2, chosen +0.5' },
  ];

  const isTribe = challengeType === 'tribe_reward' || challengeType === 'tribe_immunity';

  return (
    <div className="admin-tab-content">
      {message && (
        <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="challenge-type-grid">
        {challengeOptions.map(opt => (
          <button
            key={opt.type}
            className={`challenge-type-btn ${challengeType === opt.type ? 'active' : ''}`}
            onClick={() => { setChallengeType(opt.type); reset(); }}
          >
            <span className="challenge-type-label">{opt.label}</span>
            <span className="challenge-type-sub">{opt.sub}</span>
          </button>
        ))}
      </div>

      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <label>Episode (optional)</label>
        <input
          type="number"
          min="1"
          value={episode}
          onChange={e => setEpisode(e.target.value)}
          className="form-input"
          placeholder="Ep #"
          style={{ maxWidth: 120 }}
        />
      </div>

      {isTribe && (
        <>
          <div className="form-group">
            <label>Quick-select a tribe</label>
            <div className="challenge-tribe-pills">
              {activeTribes.map(t => {
                const tribePlayerIds = activePlayers.filter(p => p.tribe === t.name).map(p => p.id);
                const allSelected = tribePlayerIds.length > 0 && tribePlayerIds.every(id => selectedPlayerIds.includes(id));
                return (
                  <button
                    key={t.id}
                    className={`tribe-pill ${allSelected ? 'selected' : ''}`}
                    style={{ '--tribe-color': t.color } as React.CSSProperties}
                    onClick={() => selectTribe(t.name)}
                  >
                    {t.name} ({tribePlayerIds.length})
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label>{selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} selected — deselect any sit-outs</label>
            <div className="bulk-player-grid">
              {activePlayers.map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  compact
                  selected={selectedPlayerIds.includes(p.id)}
                  onClick={() => togglePlayer(p.id)}
                />
              ))}
            </div>
          </div>
          {selectedPlayerIds.length > 0 && (
            <div className="points-preview">
              {selectedPlayerIds.length} × {challengeType === 'tribe_reward' ? '0.5' : '1'} = +{(selectedPlayerIds.length * (challengeType === 'tribe_reward' ? 0.5 : 1)).toFixed(1)} total pts
            </div>
          )}
        </>
      )}

      {challengeType === 'individual_reward' && (
        <>
          <div className="form-group">
            <label>Challenge Winner <span className="pts-badge positive">+2 pts</span></label>
            <select
              value={rewardWinnerId}
              onChange={e => setRewardWinnerId(parseInt(e.target.value))}
              className="form-select"
            >
              <option value={0}>-- Select winner --</option>
              {activePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.tribe})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Also went on reward <span className="pts-badge positive">+0.5 pts each</span></label>
            <div className="bulk-player-grid">
              {activePlayers.filter(p => p.id !== rewardWinnerId).map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  compact
                  selected={chosenForReward.includes(p.id)}
                  onClick={() => toggleChosenForReward(p.id)}
                />
              ))}
            </div>
          </div>
          {(rewardWinnerId > 0 || chosenForReward.length > 0) && (
            <div className="points-preview">
              {rewardWinnerId > 0 && <span>{activePlayers.find(p => p.id === rewardWinnerId)?.name}: +2 pts</span>}
              {chosenForReward.length > 0 && (
                <span style={{ marginLeft: '1rem' }}>{chosenForReward.length} chosen: +{(chosenForReward.length * 0.5).toFixed(1)} pts</span>
              )}
            </div>
          )}
        </>
      )}

      {challengeType === 'individual_immunity' && (
        <>
          <div className="form-group">
            <label>
              Immunity Winner{immunityWinners.length !== 1 ? 's' : ''} <span className="pts-badge positive">+3 pts each</span>
              <span className="label-hint"> — tap to select</span>
            </label>
            <div className="bulk-player-grid">
              {activePlayers.map(p => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  compact
                  selected={immunityWinners.includes(p.id)}
                  onClick={() => toggleImmunityWinner(p.id)}
                />
              ))}
            </div>
          </div>
          {immunityWinners.length > 0 && (
            <div className="points-preview">
              {immunityWinners.length} winner{immunityWinners.length > 1 ? 's' : ''} × 3 = +{immunityWinners.length * 3} pts
            </div>
          )}
        </>
      )}

      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: '1.5rem' }}
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Submitting...' : 'Log Challenge Results'}
      </button>
    </div>
  );
}

// ── Shows/Seasons/Cast Management Tab ──

function ManageShowsTab() {
  const [shows, setShows] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedShowSlug, setSelectedShowSlug] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  // New show form
  const [newShowName, setNewShowName] = useState('');
  const [newShowSlug, setNewShowSlug] = useState('');
  const [newShowDesc, setNewShowDesc] = useState('');

  // New season form
  const [newSeasonNum, setNewSeasonNum] = useState('');
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonCastCount, setNewSeasonCastCount] = useState('');

  // Cast import
  const [castJson, setCastJson] = useState('');
  const [importPreview, setImportPreview] = useState<any[] | null>(null);

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 4000); };

  const loadShows = () => { api.getShows().then(setShows).catch(console.error); };

  useEffect(() => { loadShows(); }, []);

  useEffect(() => {
    if (selectedShowSlug) {
      api.getSeasons(selectedShowSlug).then(setSeasons).catch(console.error);
    } else {
      setSeasons([]);
    }
  }, [selectedShowSlug]);

  const handleCreateShow = async () => {
    if (!newShowName || !newShowSlug) return;
    try {
      await api.createShow({ name: newShowName, slug: newShowSlug, description: newShowDesc || undefined });
      flash('Show created!');
      setNewShowName(''); setNewShowSlug(''); setNewShowDesc('');
      loadShows();
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handleCreateSeason = async () => {
    if (!selectedShowSlug || !newSeasonNum) return;
    try {
      await api.createSeason(selectedShowSlug, {
        season_number: parseInt(newSeasonNum),
        name: newSeasonName || undefined,
        cast_count: newSeasonCastCount ? parseInt(newSeasonCastCount) : undefined,
      });
      flash('Season created!');
      setNewSeasonNum(''); setNewSeasonName(''); setNewSeasonCastCount('');
      api.getSeasons(selectedShowSlug).then(setSeasons);
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(castJson);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      setImportPreview(arr);
    } catch {
      flash('Error: Invalid JSON');
      setImportPreview(null);
    }
  };

  const handleImport = async () => {
    if (!selectedSeasonId || !importPreview) return;
    try {
      await api.bulkImportPlayers(selectedSeasonId, importPreview);
      flash(`Imported ${importPreview.length} players!`);
      setCastJson('');
      setImportPreview(null);
    } catch (err: any) { flash(`Error: ${err.message}`); }
  };

  return (
    <div className="admin-section">
      {message && <div className={`toast ${message.startsWith('Error') ? 'error' : 'success'}`}>{message}</div>}

      {/* ── Shows ── */}
      <h2 className="section-title">Shows</h2>
      <div className="admin-list">
        {shows.map(s => (
          <div key={s.id} className="admin-list-item">
            <strong>{s.name}</strong> <span className="text-muted">({s.slug})</span>
            <span className="badge">{s.season_count || 0} seasons</span>
          </div>
        ))}
      </div>
      <div className="admin-form-row" style={{ marginTop: '1rem' }}>
        <input className="form-input" placeholder="Show name" value={newShowName} onChange={e => { setNewShowName(e.target.value); setNewShowSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }} />
        <input className="form-input" placeholder="Slug" value={newShowSlug} onChange={e => setNewShowSlug(e.target.value)} />
        <input className="form-input" placeholder="Description (optional)" value={newShowDesc} onChange={e => setNewShowDesc(e.target.value)} />
        <button className="btn btn-primary" onClick={handleCreateShow} disabled={!newShowName || !newShowSlug}>Create Show</button>
      </div>

      {/* ── Seasons ── */}
      <h2 className="section-title" style={{ marginTop: '2rem' }}>Seasons</h2>
      <select className="form-input" value={selectedShowSlug} onChange={e => { setSelectedShowSlug(e.target.value); setSelectedSeasonId(null); }}>
        <option value="">Select a show...</option>
        {shows.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
      </select>

      {selectedShowSlug && (
        <>
          <div className="admin-list" style={{ marginTop: '1rem' }}>
            {seasons.map(s => (
              <div
                key={s.id}
                className={`admin-list-item ${selectedSeasonId === s.id ? 'selected' : ''}`}
                onClick={() => setSelectedSeasonId(s.id)}
                style={{ cursor: 'pointer' }}
              >
                <strong>Season {s.season_number}</strong>
                {s.name && <span> — {s.name}</span>}
                <span className="badge">{s.cast_count} players</span>
                <span className="badge">{s.league_count || 0} leagues</span>
              </div>
            ))}
            {seasons.length === 0 && <div className="empty-state">No seasons yet</div>}
          </div>

          <div className="admin-form-row" style={{ marginTop: '1rem' }}>
            <input className="form-input" type="number" placeholder="Season #" value={newSeasonNum} onChange={e => setNewSeasonNum(e.target.value)} />
            <input className="form-input" placeholder="Season name (optional)" value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} />
            <input className="form-input" type="number" placeholder="Cast count" value={newSeasonCastCount} onChange={e => setNewSeasonCastCount(e.target.value)} />
            <button className="btn btn-primary" onClick={handleCreateSeason} disabled={!newSeasonNum}>Create Season</button>
          </div>
        </>
      )}

      {/* ── Cast Import ── */}
      {selectedSeasonId && (
        <>
          <h2 className="section-title" style={{ marginTop: '2rem' }}>Cast Import</h2>
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
            Paste a JSON array of players. Each player needs: name, tribe. Optional: nickname, original_seasons, photo_url.
          </p>
          <textarea
            className="form-textarea"
            rows={8}
            placeholder={`[\n  { "name": "Player Name", "tribe": "Tribe A", "original_seasons": "1, 2" },\n  ...\n]`}
            value={castJson}
            onChange={e => setCastJson(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <button className="btn btn-secondary" onClick={handleParseJson} style={{ marginTop: '0.5rem' }} disabled={!castJson.trim()}>
            Preview Import
          </button>

          {importPreview && (
            <div style={{ marginTop: '1rem' }}>
              <h3>{importPreview.length} players to import:</h3>
              <table className="log-table" style={{ marginTop: '0.5rem' }}>
                <thead>
                  <tr><th>Name</th><th>Tribe</th><th>Seasons</th></tr>
                </thead>
                <tbody>
                  {importPreview.map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}{p.nickname ? ` (${p.nickname})` : ''}</td>
                      <td>{p.tribe}</td>
                      <td>{p.original_seasons || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-primary" onClick={handleImport} style={{ marginTop: '0.5rem' }}>
                Import {importPreview.length} Players
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
