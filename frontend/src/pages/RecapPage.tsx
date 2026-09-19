import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ordinal } from '../api';
import { SeasonRecap, RecapStanding } from '../types';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTribes } from '../context/TribeContext';
import RaceChart, { TEAM_COLORS } from '../components/RaceChart';
import ShareButton from '../components/ShareButton';
import { getInitials } from '../components/PlayerCard';

export default function RecapPage() {
  const { show, season, league, leagueBase } = useAppContext();
  const { isAdmin } = useAuth();
  const { getTribeColor } = useTribes();
  const [recap, setRecap] = useState<SeasonRecap | null>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState<number | null>(null);
  const [openRecap, setOpenRecap] = useState<number | null>(null);

  useEffect(() => {
    if (!league) return;
    api.getSeasonRecap(league.id).then(setRecap).catch(err => setError(err.message));
  }, [league]);

  // Colors follow the team (by id), never its rank.
  const colorFor = useMemo(() => {
    const ids = [...(recap?.standings || [])].map(t => t.id).sort((a, b) => a - b);
    return (teamId: number) => TEAM_COLORS[ids.indexOf(teamId) % TEAM_COLORS.length];
  }, [recap]);

  if (error) return <div className="error-state">{error}</div>;
  if (!recap || !show || !season || !league) return <div className="loading">Loading the season...</div>;

  const { standings, highlights, episodes } = recap;
  const champion = standings[0];
  const runnerUp = standings[1];
  const inProgress = !season.is_complete;
  const soleSurvivor = standings.flatMap(t => t.players).find(p => p.placement === 1);
  const finalists = standings.flatMap(t => t.players.map(p => ({ ...p, team: t }))).filter(p => p.placement && p.placement <= 3).sort((a, b) => a.placement! - b.placement!);

  const shareText = () => {
    const lines = standings.map(t => `${t.rank === 1 ? '👑' : `#${t.rank}`} ${t.name} (${t.owner_name}) — ${t.total_score.toFixed(1)}`);
    return `🔥 ${show.name.toUpperCase()} ${season.season_number} — ${league.name} FINAL\n${lines.join('\n')}\n\n${window.location.origin}${leagueBase}/recap`;
  };

  const generate = async (team: RecapStanding) => {
    setGenerating(team.id);
    try {
      const r = await api.generateTeamSeasonRecap(league.id, team.id);
      setRecap({ ...recap, recaps: { ...recap.recaps, [team.id]: r.recap } });
      setOpenRecap(team.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="recap-page">
      {/* ── Champion hero ── */}
      <section className="recap-hero">
        <div className="recap-hero-label">{show.name} {season.season_number}{season.name ? ` · ${season.name}` : ''} · {league.name}</div>
        <div className="recap-hero-crown">👑</div>
        <div className="recap-hero-kicker">{inProgress ? 'Currently leading' : 'League Champion'}</div>
        <h1 className="recap-hero-team">{champion?.name}</h1>
        <div className="recap-hero-owner">{champion?.owner_name}</div>
        <div className="recap-hero-score">
          <span className="recap-hero-points">{champion?.total_score.toFixed(1)}</span>
          <span className="recap-hero-unit">points</span>
        </div>
        {runnerUp && (
          <div className="recap-hero-margin">
            {highlights.margin.toFixed(1)} clear of {runnerUp.name} ({runnerUp.owner_name})
            {champion && runnerUp.total_score > 0 && ` · ${Math.round((highlights.margin / runnerUp.total_score) * 100)}% more points than second place`}
          </div>
        )}
        <div className="recap-hero-actions">
          <ShareButton getText={shareText} label="Share final standings" />
        </div>
      </section>

      {/* ── Stat tiles ── */}
      <section className="recap-tiles">
        {champion && (
          <div className="recap-tile">
            <div className="recap-tile-value">{champion.weeks_led}<span className="recap-tile-of">/{episodes.length}</span></div>
            <div className="recap-tile-label">episodes on top</div>
          </div>
        )}
        {highlights.biggest_episode && (
          <div className="recap-tile">
            <div className="recap-tile-value">+{highlights.biggest_episode.points.toFixed(1)}</div>
            <div className="recap-tile-label">biggest single episode · {highlights.biggest_episode.team_name}, Ep {highlights.biggest_episode.episode}</div>
          </div>
        )}
        {highlights.mvp && (
          <div className="recap-tile">
            <div className="recap-tile-value">{highlights.mvp.total_points.toFixed(1)}</div>
            <div className="recap-tile-label">MVP · {highlights.mvp.name} ({highlights.mvp.team_name})</div>
          </div>
        )}
        {highlights.bust && (
          <div className="recap-tile">
            <div className="recap-tile-value">{highlights.bust.total_points.toFixed(2)}</div>
            <div className="recap-tile-label">biggest bust · {highlights.bust.name} ({highlights.bust.team_name})</div>
          </div>
        )}
      </section>

      {/* ── The race ── */}
      {episodes.length > 0 && (
        <section className="section">
          <h2 className="section-title">The Race</h2>
          <p className="section-intro">Cumulative points after each episode. Hover to compare.</p>
          <div className="recap-chart-card">
            <RaceChart standings={standings} episodes={episodes} cumulative={recap.cumulative} colorFor={colorFor} />
          </div>
        </section>
      )}

      {/* ── Final standings ── */}
      <section className="section">
        <h2 className="section-title">{inProgress ? 'Standings' : 'Final Standings'}</h2>
        <div className="recap-standings">
          {standings.map(team => (
            <div key={team.id} className={`recap-team ${team.rank === 1 ? 'champion' : ''}`} style={{ '--team-color': colorFor(team.id) } as React.CSSProperties}>
              <div className="recap-team-head">
                <div className="recap-team-rank">{team.rank === 1 ? '👑' : `#${team.rank}`}</div>
                <div className="recap-team-names">
                  <Link to={`${leagueBase}/team/${team.id}`} className="recap-team-name">{team.name}</Link>
                  <div className="recap-team-owner">{team.owner_name}{team.draft_order ? ` · drafted ${ordinal(team.draft_order)}` : ''}</div>
                </div>
                <div className="recap-team-score">{team.total_score.toFixed(1)}</div>
              </div>
              <div className="recap-roster">
                {team.players.map(p => (
                  <div key={p.id} className={`recap-player ${p.placement === 1 ? 'winner' : p.is_eliminated ? 'out' : ''}`}>
                    <div className="recap-player-photo" style={{ borderColor: getTribeColor(p.tribe) }}>
                      {p.photo_url ? <img src={p.photo_url} alt={p.name} loading="lazy" /> : <span>{getInitials(p.name)}</span>}
                    </div>
                    <div className="recap-player-name">{p.nickname || p.name.split(' ')[0]}</div>
                    <div className="recap-player-meta">
                      {p.placement === 1 ? 'Sole Survivor' : p.placement ? ordinal(p.placement) : 'In the game'} · {Number(p.total_points).toFixed(1)}
                    </div>
                    {p.pick_number && <div className="recap-player-pick">Pick {p.pick_number}</div>}
                  </div>
                ))}
              </div>
              {(recap.recaps[team.id] || isAdmin) && (
                <div className="recap-team-story">
                  {recap.recaps[team.id] ? (
                    <>
                      <button className="recap-story-toggle" onClick={() => setOpenRecap(openRecap === team.id ? null : team.id)}>
                        {openRecap === team.id ? '▾ Hide season story' : '▸ Read the season story'}
                      </button>
                      {openRecap === team.id && <div className="summary-output recap-prose">{recap.recaps[team.id]}</div>}
                    </>
                  ) : null}
                  {isAdmin && (
                    <button className="btn btn-secondary btn-small" onClick={() => generate(team)} disabled={generating !== null}>
                      {generating === team.id ? 'Writing...' : recap.recaps[team.id] ? 'Rewrite story' : 'Write season story'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── The show's finish ── */}
      {finalists.length > 0 && (
        <section className="section">
          <h2 className="section-title">How the Season Ended</h2>
          <div className="recap-podium">
            {finalists.map(p => (
              <div key={p.id} className={`recap-podium-slot place-${p.placement}`}>
                <div className="recap-podium-photo">
                  {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <span>{getInitials(p.name)}</span>}
                </div>
                <div className="recap-podium-place">{p.placement === 1 ? '👑 Sole Survivor' : ordinal(p.placement!)}</div>
                <div className="recap-podium-name">{p.name}</div>
                <div className="recap-podium-team">drafted by {p.team.owner_name}</div>
              </div>
            ))}
          </div>
          {soleSurvivor && champion && champion.players.some(p => p.id === soleSurvivor.id) && (
            <p className="recap-footnote">The champion drafted the Sole Survivor. That is how you win a fantasy league.</p>
          )}
        </section>
      )}

      <div className="recap-links">
        <Link to={`${leagueBase}/scoreboard`} className="view-all-link">Full scoreboard &rarr;</Link>
        <Link to="/hall-of-fame" className="view-all-link">Hall of Fame &rarr;</Link>
      </div>
    </div>
  );
}
