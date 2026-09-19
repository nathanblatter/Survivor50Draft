import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, eventLabel, formatPoints } from '../api';
import { Team, ScoringEvent, ScoringRule } from '../types';
import { useAppContext } from '../context/AppContext';
import ShareButton from '../components/ShareButton';

const RULE_ICONS: Record<string, string> = {
  merge: '🏝️', jury: '⚖️', ftc: '🏆', win_the_game: '👑', votes_for_winner: '🗳️', finds_idol: '🗿',
  immunity: '🛡️', receives_votes: '📝', voted_out_with: '💀', reward: '🎁', advantage: '⚡',
  placement: '📊', journey: '🧭', fire: '🔥', in_on_vote: '✅', f3: '🥉',
};

function getRuleIcon(eventType: string): string {
  const key = eventType.toLowerCase();
  for (const [pattern, icon] of Object.entries(RULE_ICONS)) {
    if (key.includes(pattern)) return icon;
  }
  return '📌';
}

function daysUntil(date: string): number {
  const target = new Date(date.slice(0, 10) + 'T20:00:00');
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

export default function HomePage() {
  const { show, season, league, leagueBase } = useAppContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [recentEvents, setRecentEvents] = useState<ScoringEvent[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);

  useEffect(() => {
    if (!league || !season || !show) return;
    api.getLeagueTeams(league.id).then(setTeams).catch(() => {});
    api.getSeasonScoringEvents(season.id, { limit: 10 }).then(setRecentEvents).catch(() => {});
    api.getShowScoringRules(show.slug).then(setRules).catch(() => {});
  }, [league, season, show]);

  if (!show || !season || !league) return null;

  const showName = show.name.toUpperCase();
  const seasonNum = ` ${season.season_number}`;
  const draftedCount = teams.reduce((n, t) => n + (t.players?.length || 0), 0);
  const preSeason = !season.is_complete && recentEvents.length === 0;
  const premiereDays = season.premiere_date ? daysUntil(season.premiere_date) : null;
  const champion = season.is_complete && teams.length > 0 ? teams[0] : null;

  const formatStandingsText = () => {
    const title = `${showName}${seasonNum} — ${league.name} Standings`;
    const lines = teams.map((t, i) => `${i + 1}. ${t.name} (${t.owner_name}) — ${t.total_score.toFixed(1)} pts`);
    return `${title}\n${lines.join('\n')}\n\n${window.location.origin + leagueBase}`;
  };

  const formatActivityText = () => {
    const title = `${showName}${seasonNum} — Recent Scoring`;
    const lines = recentEvents.map(e => `${e.player_name}: ${eventLabel(e.event_type, rules)} (${formatPoints(e.points)})`);
    return `${title}\n${lines.join('\n')}\n\n${window.location.origin + leagueBase}`;
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-fire-left">🔥</div>
        <div className="hero-content">
          <h1 className="hero-title">{showName}{seasonNum}</h1>
          {season.name && <p className="hero-subtitle">{season.name.toUpperCase()}</p>}
          <p className="hero-tagline">{league.name}</p>
          <div className="hero-actions">
            {season.is_complete ? (
              <Link to={`${leagueBase}/recap`} className="btn btn-primary">Season Recap</Link>
            ) : draftedCount < season.cast_count && teams.length > 0 ? (
              <Link to={`${leagueBase}/draft`} className="btn btn-primary">Go to the Draft</Link>
            ) : (
              <Link to={`${leagueBase}/scoreboard`} className="btn btn-primary">View Scoreboard</Link>
            )}
            <Link to={`${leagueBase}/cast`} className="btn btn-secondary">Meet the Cast</Link>
          </div>
        </div>
        <div className="hero-fire-right">🔥</div>
      </section>

      {champion && (
        <section className="champion-banner">
          <div className="champion-crown">👑</div>
          <div>
            <div className="champion-label">Season Champion</div>
            <div className="champion-name">{champion.name}</div>
            <div className="champion-owner">{champion.owner_name} · {champion.total_score.toFixed(1)} pts</div>
          </div>
          <Link to={`${leagueBase}/recap`} className="btn btn-secondary btn-small">Full recap &rarr;</Link>
        </section>
      )}

      {preSeason && (
        <section className="preseason-card">
          <div className="preseason-icon">🏝️</div>
          <div className="preseason-body">
            <h3>{premiereDays !== null && premiereDays > 0 ? `${premiereDays} day${premiereDays === 1 ? '' : 's'} until the premiere` : 'The season is underway'}</h3>
            <p>
              {teams.length === 0
                ? 'No teams yet. Head to the Draft to create your team and get ready.'
                : draftedCount < season.cast_count
                  ? `${draftedCount} of ${season.cast_count} castaways drafted. Finish the draft before the first episode.`
                  : 'The draft is done. Scores will appear here after the first episode.'}
            </p>
          </div>
          <Link to={`${leagueBase}/draft`} className="btn btn-primary btn-small">Draft room &rarr;</Link>
        </section>
      )}

      {teams.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Standings</h2>
            <ShareButton getText={formatStandingsText} label="Share Standings" />
          </div>
          <div className="standings-preview">
            {teams.slice(0, 8).map((team, idx) => (
              <Link to={`${leagueBase}/team/${team.id}`} key={team.id} className="standing-row">
                <span className="standing-rank">{idx === 0 && season.is_complete ? '👑' : `#${idx + 1}`}</span>
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
                <span className="activity-event">{eventLabel(event.event_type, rules)}{event.episode ? <span className="activity-ep"> · Ep {event.episode}</span> : null}</span>
                <span className={`activity-points ${event.points >= 0 ? 'positive' : 'negative'}`}>{formatPoints(event.points)}</span>
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
                <div className="rule-points">{rule.is_variable ? 'Var' : formatPoints(rule.points)}</div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              Scoring rules will appear once the commissioner configures them.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
