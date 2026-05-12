import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Team, ScoringEvent, ScoringRule } from '../types';
import { useAppContext } from '../context/AppContext';
import ShareButton from '../components/ShareButton';

const RULE_ICONS: Record<string, string> = {
  merge: '🏝️', jury: '⚖️', final_tribal: '🏆', ftc: '🏆',
  vote_correct: '🗳️', idol_found: '🗿', immunity_win: '🛡️',
  votes_received: '📝', idoled_out: '💀', reward_win: '🎁',
  advantage_found: '⚡', challenge_win: '🏅', elimination: '🔥',
  placement: '📊', sole_survivor: '👑',
};

function getRuleIcon(eventType: string): string {
  const key = eventType.toLowerCase();
  for (const [pattern, icon] of Object.entries(RULE_ICONS)) {
    if (key.includes(pattern)) return icon;
  }
  return '📌';
}

export default function HomePage() {
  const { show, season, league } = useAppContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [recentEvents, setRecentEvents] = useState<ScoringEvent[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);

  const leagueBase = show && season && league
    ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}`
    : '';

  useEffect(() => {
    if (league) {
      api.getLeagueTeams(league.id).then(setTeams).catch(() => {});
    } else {
      api.getTeams().then(setTeams).catch(() => {});
    }
    if (season) {
      api.getSeasonScoringEvents(season.id, 10).then(setRecentEvents).catch(() => {});
    } else {
      api.getScoringEvents(10).then(setRecentEvents).catch(() => {});
    }
    if (show) {
      api.getShowScoringRules(show.slug).then(setRules).catch(() => {});
    } else {
      api.getScoringRules().then(setRules).catch(() => {});
    }
  }, [league, season, show]);

  const showName = show ? show.name.toUpperCase() : 'FANTASY';
  const seasonNum = season ? ` ${season.season_number}` : '';
  const seasonSubtitle = season?.name || '';

  const formatStandingsText = () => {
    const title = `${showName}${seasonNum}${league ? ` — ${league.name}` : ''} Standings`;
    const lines = teams.map((t, i) => `${i + 1}. ${t.name} (${t.owner_name}) — ${t.total_score.toFixed(1)} pts`);
    const url = window.location.origin + leagueBase;
    return `${title}\n${lines.join('\n')}\n\n${url}`;
  };

  const formatActivityText = () => {
    const title = `${showName}${seasonNum} — Recent Scoring`;
    const lines = recentEvents.map(e =>
      `${e.player_name}: ${e.event_type.replace(/_/g, ' ')} (${e.points > 0 ? '+' : ''}${e.points})`
    );
    const url = window.location.origin + leagueBase;
    return `${title}\n${lines.join('\n')}\n\n${url}`;
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-fire-left">🔥</div>
        <div className="hero-content">
          <h1 className="hero-title">{showName}{seasonNum}</h1>
          {seasonSubtitle && <p className="hero-subtitle">{seasonSubtitle.toUpperCase()}</p>}
          <p className="hero-tagline">{league ? league.name : 'Fantasy Draft League'}</p>
          <div className="hero-actions">
            <Link to={`${leagueBase}/scoreboard`} className="btn btn-primary">View Scoreboard</Link>
            <Link to={`${leagueBase}/cast`} className="btn btn-secondary">Meet the Cast</Link>
          </div>
        </div>
        <div className="hero-fire-right">🔥</div>
      </section>

      {teams.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Standings</h2>
            <ShareButton getText={formatStandingsText} label="Share Standings" />
          </div>
          <div className="standings-preview">
            {teams.slice(0, 6).map((team, idx) => (
              <Link to={`${leagueBase}/team/${team.id}`} key={team.id} className="standing-row">
                <span className="standing-rank">#{idx + 1}</span>
                <span className="standing-name">{team.name}</span>
                <span className="standing-owner">{team.owner_name}</span>
                <span className="standing-score">{team.total_score.toFixed(1)}</span>
              </Link>
            ))}
          </div>
          <Link to={`${leagueBase}/scoreboard`} className="view-all-link">View Full Scoreboard &rarr;</Link>
        </section>
      )}

      {recentEvents.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Recent Activity</h2>
            <ShareButton getText={formatActivityText} label="Share Activity" />
          </div>
          <div className="activity-feed">
            {recentEvents.map(event => (
              <div key={event.id} className="activity-item">
                <span className="activity-player">{event.player_name}</span>
                <span className="activity-event">{event.event_type.replace(/_/g, ' ')}</span>
                <span className={`activity-points ${event.points >= 0 ? 'positive' : 'negative'}`}>
                  {event.points > 0 ? '+' : ''}{event.points}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Scoring Rules</h2>
        <div className="scoring-rules-grid">
          {rules.length > 0 ? (
            rules.map(rule => (
              <div key={rule.id} className={`rule-card ${rule.points < 0 ? 'negative' : ''}`}>
                <div className="rule-icon">{getRuleIcon(rule.event_type)}</div>
                <div className="rule-name">{rule.description}</div>
                <div className="rule-points">
                  {rule.is_variable ? 'Var' : `${rule.points > 0 ? '+' : ''}${rule.points}`}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              Scoring rules will appear once the admin configures them.
            </div>
          )}
        </div>
        <Link to={`${leagueBase}/scoreboard`} className="view-all-link">See full scoring details on the scoreboard &rarr;</Link>
      </section>
    </div>
  );
}
