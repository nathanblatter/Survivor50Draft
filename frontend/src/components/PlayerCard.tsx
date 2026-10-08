import { Link } from 'react-router-dom';
import { Player } from '../types';
import { useTribes } from '../context/TribeContext';
import { useAppContext } from '../context/AppContext';

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
  showScore?: boolean;
  /** Small caption rendered under the name (e.g. "3 votes"). */
  badge?: string;
  /** Don't show which fantasy team drafted the player (e.g. when the card already sits inside that team). */
  hideTeam?: boolean;
}

export default function PlayerCard({ player, onClick, selected, compact, showScore, badge, hideTeam }: PlayerCardProps) {
  const { getTribeColor } = useTribes();
  const { leagueBase } = useAppContext();
  const tribeColor = getTribeColor(player.tribe);
  const displayName = player.nickname || player.name.split(' ')[0];
  const history = player.tribe_history || [];
  const hasMultipleTribes = history.length > 1;
  const isWinner = player.placement === 1;
  const subline = player.original_seasons
    ? `S${player.original_seasons}`
    : (player.occupation || player.hometown || '');

  return (
    <div
      className={`player-card ${compact ? 'compact' : ''} ${selected ? 'selected' : ''} ${player.is_eliminated ? 'eliminated' : ''} ${isWinner ? 'winner' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{ '--tribe-color': tribeColor } as React.CSSProperties}
    >
      <div className="player-avatar" style={{ background: `linear-gradient(135deg, ${tribeColor}, ${tribeColor}88)` }}>
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name} loading="lazy" />
        ) : (
          <span className="avatar-initials">{getInitials(player.name)}</span>
        )}
        {player.is_eliminated && (
          player.quit
            ? <div className="eliminated-overlay quitter" title="Quit the game"><span className="quitter-stamp">QUITTER</span></div>
            : <div className="eliminated-overlay">OUT</div>
        )}
        {isWinner && <div className="winner-overlay">SOLE SURVIVOR</div>}
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
                  title={history.map(h => `${h.tribe_name} (${h.phase}${h.episode ? ` Ep.${h.episode}` : ''})`).join(' → ')}
                >
                  {history.map((h, i) => (
                    <span key={i} className="tribe-dot" style={{ backgroundColor: getTribeColor(h.tribe_name) }} />
                  ))}
                </span>
              )}
            </div>
            {subline && <div className="player-seasons">{subline}</div>}
            {!hideTeam && player.team_name && (
              leagueBase && player.team_id ? (
                <Link
                  to={`${leagueBase}/team/${player.team_id}`}
                  className="player-team"
                  title={[player.team_owner ? `Drafted by ${player.team_owner}` : null, player.team_mood, 'Open team'].filter(Boolean).join(' · ')}
                  onClick={e => e.stopPropagation()}
                >
                  <span className="player-team-icon">{player.team_emoji || '🏕'}</span> {player.team_name}
                </Link>
              ) : (
                <div className="player-team" title={[player.team_owner ? `Drafted by ${player.team_owner}` : null, player.team_mood].filter(Boolean).join(' · ') || undefined}>
                  <span className="player-team-icon">{player.team_emoji || '🏕'}</span> {player.team_name}
                </div>
              )
            )}
          </>
        )}
        {badge && <div className="player-badge">{badge}</div>}
        {showScore && (
          <div className="player-score">{Number(player.total_points).toFixed(1)} pts</div>
        )}
      </div>
      {player.placement && (
        <div className={`placement-badge ${isWinner ? 'gold' : ''}`}>{isWinner ? '👑' : `#${player.placement}`}</div>
      )}
    </div>
  );
}
