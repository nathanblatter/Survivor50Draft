import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTribes } from '../context/TribeContext';
import { api } from '../api';
import { Player, Team, ScoringRule, ScoringEvent, Tribe } from '../types';
import PlayerCard from '../components/PlayerCard';

type AdminTab = 'scoring' | 'eliminate' | 'teams' | 'draft' | 'tribes' | 'summary';

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
        <button className={`tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
          Recap
        </button>
      </div>

      {tab === 'scoring' && <ScoringTab />}
      {tab === 'eliminate' && <EliminateTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'draft' && <DraftTab />}
      {tab === 'tribes' && <TribesTab />}
      {tab === 'summary' && <SummaryTab />}
    </div>
  );
}

function EliminateTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<Player | null>(null);
  const [placement, setPlacement] = useState('');
  const [votesReceived, setVotesReceived] = useState('');
  const [episode, setEpisode] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setShowModal(true);
  };

  const handleEliminate = async () => {
    if (!targetPlayer || !placement) return;
    const placementNum = parseInt(placement);
    if (placementNum < 1 || placementNum > 24) {
      setMessage('Error: Placement must be between 1 and 24');
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
        notes: `Eliminated — placed ${placementNum} of 24`,
      });

      // 2. Add votes received scoring events (one per vote, each at -0.25)
      const votes = parseInt(votesReceived);
      if (votes > 0) {
        // Use bulk-style: add one receives_votes event with notes showing count
        for (let i = 0; i < votes; i++) {
          await api.addScoringEvent({
            player_id: targetPlayer.id,
            event_type: 'receives_votes',
            episode: episode ? parseInt(episode) : undefined,
            notes: i === 0 ? `Received ${votes} vote${votes > 1 ? 's' : ''} at tribal` : undefined,
          });
        }
      }

      setMessage(`🔥 ${targetPlayer.name} has been voted out! (Placement: ${placementNum}${votes > 0 ? `, ${votes} vote${votes > 1 ? 's' : ''}` : ''})`);
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
              {placement && parseInt(placement) >= 1 && parseInt(placement) <= 24 && (
                <div className="placement-preview">
                  Placement points: +{25 - parseInt(placement)}
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

            {placement && parseInt(placement) >= 1 && (
              <div className="eliminate-summary">
                <strong>Summary:</strong> {targetPlayer.name} finishes {placement}{placement === '1' ? 'st' : placement === '2' ? 'nd' : placement === '3' ? 'rd' : 'th'} →{' '}
                <span className="positive">+{25 - parseInt(placement)} placement pts</span>
                {votesReceived && parseInt(votesReceived) > 0 && (
                  <>, <span className="negative">{(parseInt(votesReceived) * -0.25).toFixed(2)} vote pts</span></>
                )}
                {' '}= <strong>{(
                  (25 - parseInt(placement)) + (parseInt(votesReceived || '0') * -0.25)
                ).toFixed(2)} net pts</strong>
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
                Points awarded: {25 - parseInt(placement || '0')}
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

function SummaryTab() {
  const [episodes, setEpisodes] = useState<{ episode: number; event_count: number }[]>([]);
  const [selectedEp, setSelectedEp] = useState<number>(0);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getEpisodesWithEvents().then(setEpisodes).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedEp > 0) {
      api.getEpisodeEvents(selectedEp).then(setEvents).catch(console.error);
      setSummary('');
    } else {
      setEvents([]);
      setSummary('');
    }
  }, [selectedEp]);

  const handleGenerate = async () => {
    if (!selectedEp) return;
    setLoading(true);
    setSummary('');
    setMessage('');
    try {
      const result = await api.generateEpisodeSummary(selectedEp);
      setSummary(result.summary);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = summary;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="admin-tab-content">
      <div className="scoring-form">
        <h3>📺 Episode Recap Generator</h3>
        <p className="summary-desc">
          Select an episode to generate a dramatic, funny recap powered by AI. Copy and send it to your league mates!
        </p>

        {episodes.length === 0 ? (
          <div className="summary-empty">
            <p>No episodes with scoring events yet. Add some scores first!</p>
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
                onClick={handleGenerate}
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? '🔮 Generating Recap...' : '🔥 Generate Episode Recap'}
              </button>
            )}
          </>
        )}

        {message && (
          <div className={`form-message ${message.startsWith('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </div>

      {loading && (
        <div className="summary-loading">
          <div className="summary-spinner"></div>
          <p>Claude is channeling their inner Jeff Probst...</p>
        </div>
      )}

      {summary && (
        <div className="summary-result">
          <div className="summary-header">
            <h3>🏝️ Episode {selectedEp} Recap</h3>
            <button onClick={handleCopy} className="btn btn-copy">
              {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
            </button>
          </div>
          <div className="summary-output">
            {summary}
          </div>
        </div>
      )}

      {selectedEp > 0 && events.length > 0 && (
        <div className="recent-events" style={{ marginTop: '2rem' }}>
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
    </div>
  );
}
