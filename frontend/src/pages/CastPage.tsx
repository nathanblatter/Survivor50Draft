import { useEffect, useState } from 'react';
import { api } from '../api';
import { Player } from '../types';
import { useTribes } from '../context/TribeContext';
import { useAppContext } from '../context/AppContext';
import PlayerCard from '../components/PlayerCard';

export default function CastPage() {
  const { season, league } = useAppContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const { activeTribes, getTribeColor } = useTribes();

  useEffect(() => {
    if (season) api.getSeasonPlayers(season.id, league?.id).then(setPlayers).catch(console.error);
  }, [season, league]);

  const winner = players.find(p => p.placement === 1);
  const activePlayers = players.filter(p => !p.is_eliminated && p.placement !== 1);
  const eliminatedPlayers = players
    .filter(p => p.is_eliminated)
    .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));

  const eliminatedCount = eliminatedPlayers.length;
  const tribeNames = activeTribes.map(t => t.name);
  const showTribes = filter === 'all' || tribeNames.includes(filter);
  const showVotedOut = filter === 'all' || filter === 'voted-out';

  return (
    <div className="cast-page">
      <h1 className="page-title">THE CAST</h1>
      <p className="page-subtitle">
        {season?.is_complete
          ? `${players.length} castaways · season complete`
          : `${activePlayers.length + (winner ? 1 : 0)} of ${season?.cast_count || players.length} still in the game`}
      </p>

      {winner && (
        <div className="tribe-section">
          <h2 className="tribe-heading winner-heading">
            <span className="tribe-name">👑 Sole Survivor</span>
          </h2>
          <div className="cast-grid winner-grid">
            <PlayerCard player={winner} showScore />
          </div>
        </div>
      )}

      {!season?.is_complete && (
        <div className="tribe-filters">
          <button className={`tribe-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          {activeTribes.map(tribe => (
            <button
              key={tribe.name}
              className={`tribe-filter ${filter === tribe.name ? 'active' : ''}`}
              onClick={() => setFilter(tribe.name)}
              style={{ '--tribe-color': tribe.color } as React.CSSProperties}
            >
              {tribe.name}
            </button>
          ))}
          {eliminatedCount > 0 && (
            <button
              className={`tribe-filter voted-out-filter ${filter === 'voted-out' ? 'active' : ''}`}
              onClick={() => setFilter('voted-out')}
              style={{ '--tribe-color': '#E8344E' } as React.CSSProperties}
            >
              Voted Out ({eliminatedCount})
            </button>
          )}
        </div>
      )}

      {showTribes && tribeNames.filter(t => filter === 'all' || filter === t).map(tribeName => {
        const tribePlayers = activePlayers.filter(p => p.tribe === tribeName);
        if (tribePlayers.length === 0) return null;
        return (
          <div key={tribeName} className="tribe-section">
            <h2 className="tribe-heading" style={{ color: getTribeColor(tribeName) }}>
              <span className="tribe-name">{tribeName}</span>
              <span className="tribe-count">{tribePlayers.length} remaining</span>
            </h2>
            <div className="cast-grid">
              {tribePlayers.map(player => <PlayerCard key={player.id} player={player} showScore />)}
            </div>
          </div>
        );
      })}

      {showVotedOut && eliminatedCount > 0 && (
        <div className="tribe-section voted-out-section">
          <h2 className="tribe-heading voted-out-heading">
            <span className="tribe-name">Voted Out</span>
            <span className="tribe-count">{eliminatedCount} eliminated · most recent first</span>
          </h2>
          <div className="cast-grid">
            {eliminatedPlayers.map(player => <PlayerCard key={player.id} player={player} showScore />)}
          </div>
        </div>
      )}
    </div>
  );
}
