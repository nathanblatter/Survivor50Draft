import { useEffect, useState } from 'react';
import { api } from '../api';
import { Player } from '../types';
import { useTribes } from '../context/TribeContext';
import PlayerCard from '../components/PlayerCard';

export default function CastPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const { activeTribes, getTribeColor } = useTribes();

  useEffect(() => {
    api.getPlayers().then(setPlayers).catch(console.error);
  }, []);

  const activePlayers = players.filter(p => !p.is_eliminated);
  const eliminatedPlayers = players
    .filter(p => p.is_eliminated)
    .sort((a, b) => (b.placement ?? 0) - (a.placement ?? 0));

  const eliminatedCount = eliminatedPlayers.length;
  const tribeNames = activeTribes.map(t => t.name);
  const showTribes = filter === 'all' || tribeNames.includes(filter);
  const showVotedOut = filter === 'all' || filter === 'voted-out';

  return (
    <div className="cast-page">
      <h1 className="page-title">THE CASTAWAYS</h1>
      <p className="page-subtitle">24 returning players compete for the title of Sole Survivor</p>

      <div className="tribe-filters">
        <button
          className={`tribe-filter ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Tribes
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

      {/* Active tribe sections */}
      {showTribes && tribeNames.filter(t => filter === 'all' || filter === t).map(tribeName => {
        const tribePlayers = activePlayers.filter(p => p.tribe === tribeName);
        if (tribePlayers.length === 0) return null;
        return (
          <div key={tribeName} className="tribe-section">
            <h2 className="tribe-heading" style={{ color: getTribeColor(tribeName) }}>
              <span className="tribe-name">{tribeName} Tribe</span>
              <span className="tribe-count">{tribePlayers.length} remaining</span>
            </h2>
            <div className="cast-grid">
              {tribePlayers.map(player => (
                <PlayerCard key={player.id} player={player} showScore />
              ))}
            </div>
          </div>
        );
      })}

      {/* Voted Out section */}
      {showVotedOut && eliminatedCount > 0 && (
        <div className="tribe-section voted-out-section">
          <h2 className="tribe-heading voted-out-heading">
            <span className="tribe-name">Voted Out</span>
            <span className="tribe-count">{eliminatedCount} eliminated</span>
          </h2>
          <div className="cast-grid">
            {eliminatedPlayers.map(player => (
              <PlayerCard key={player.id} player={player} showScore />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
