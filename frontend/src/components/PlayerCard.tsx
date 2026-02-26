import { Player } from '../types';
import { useTribes } from '../context/TribeContext';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
  showScore?: boolean;
}

export default function PlayerCard({ player, onClick, selected, compact, showScore }: PlayerCardProps) {
  const { getTribeColor } = useTribes();
  const tribeColor = getTribeColor(player.tribe);
  const displayName = player.nickname || player.name.split(' ')[0];
  const history = player.tribe_history || [];
  const hasMultipleTribes = history.length > 1;

  return (
    <div
      className={`player-card ${compact ? 'compact' : ''} ${selected ? 'selected' : ''} ${player.is_eliminated ? 'eliminated' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      style={{ '--tribe-color': tribeColor } as React.CSSProperties}
    >
      <div className="player-avatar" style={{ background: `linear-gradient(135deg, ${tribeColor}, ${tribeColor}88)` }}>
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name} />
        ) : (
          <span className="avatar-initials">{getInitials(player.name)}</span>
        )}
        {player.is_eliminated && <div className="eliminated-overlay">OUT</div>}
      </div>
      <div className="player-info">
        <div className="player-name">{compact ? displayName : player.name}</div>
        {!compact && (
          <>
            <div className="player-tribe" style={{ color: tribeColor }}>
              {player.tribe}
              {hasMultipleTribes && (
                <span
                  className="tribe-history-dots"
                  title={history.map(h =>
                    `${h.tribe_name} (${h.phase}${h.episode ? ` Ep.${h.episode}` : ''})`
                  ).join(' → ')}
                >
                  {history.map((h, i) => (
                    <span
                      key={i}
                      className="tribe-dot"
                      style={{ backgroundColor: getTribeColor(h.tribe_name) }}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="player-seasons">S{player.original_seasons}</div>
          </>
        )}
        {showScore && (
          <div className="player-score">{Number(player.total_points).toFixed(1)} pts</div>
        )}
      </div>
      {player.placement && (
        <div className="placement-badge">#{player.placement}</div>
      )}
    </div>
  );
}
