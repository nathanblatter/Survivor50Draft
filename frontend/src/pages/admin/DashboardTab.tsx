import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { DraftState, ScoringEvent, Team } from '../../types';
import { useAdmin } from './AdminContext';

type Step = { key: string; label: string; done: boolean; detail: string; action?: { label: string; tab?: string; href?: string } };

/**
 * Dashboard: where the season stands and what to do next.
 */
export default function DashboardTab({ goTo }: { goTo: (tab: string) => void }) {
  const { season, league, leagues, players, activePlayers, tribes, episode, setEpisode } = useAdmin();
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [events, setEvents] = useState<ScoringEvent[]>([]);

  useEffect(() => {
    if (!league) { setTeams([]); setDraft(null); return; }
    api.getLeagueTeams(league.id).then(setTeams).catch(() => {});
    api.getLeagueDraftState(league.id).then(setDraft).catch(() => {});
  }, [league?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (season) api.getSeasonScoringEvents(season.id, { limit: 2000 }).then(setEvents).catch(() => {});
  }, [season?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loggedEpisodes = useMemo(() => [...new Set(events.map(e => e.episode).filter((e): e is number => e !== null))].sort((a, b) => a - b), [events]);
  const lastLogged = loggedEpisodes[loggedEpisodes.length - 1] || 0;
  const placeholderTribes = tribes.filter(t => t.is_active && /^(purple|yellow|orange|green|blue|red|teal|pink|tribe ?\d)$/i.test(t.name));
  const drafted = teams.reduce((n, t) => n + (t.players?.length || 0), 0);
  const draftDone = Boolean(draft?.is_complete);
  const leagueBase = season && league ? `/${season.show_slug}/${season.season_number}/leagues/${league.invite_code}` : '';

  if (!season) return null;

  const steps: Step[] = [
    { key: 'cast', label: 'Cast loaded', done: players.length > 0, detail: players.length ? `${players.length} castaways, ${players.filter(p => p.photo_url).length} with photos` : 'No players yet', action: { label: 'Cast & Tribes', tab: 'cast' } },
    { key: 'tribes', label: 'Tribes named', done: tribes.filter(t => t.is_active).length > 0 && placeholderTribes.length === 0, detail: placeholderTribes.length ? `${placeholderTribes.map(t => t.name).join(' / ')} are placeholder names — rename when CBS reveals them` : `${tribes.filter(t => t.is_active).length} active tribes`, action: { label: 'Rename tribes', tab: 'cast' } },
    { key: 'league', label: 'League created', done: leagues.length > 0, detail: leagues.length ? `${leagues.length} league${leagues.length === 1 ? '' : 's'} · invite link ready` : 'Create a league so people can join', action: { label: 'Leagues', tab: 'league' } },
    { key: 'teams', label: 'Teams in', done: teams.length >= 2, detail: league ? `${teams.length} teams in ${league.name}` : '—', action: { label: 'Add teams', tab: 'league' } },
    { key: 'draft', label: 'Draft complete', done: draftDone, detail: draftDone ? `${drafted} picks made` : draft?.is_active ? `Live — pick ${draft.current_pick} of ${draft.total_picks}` : teams.length >= 2 ? `${drafted} drafted · set order & start in the draft room` : 'Needs at least two teams', action: { label: 'Open draft room', href: `${leagueBase}/draft` } },
    { key: 'episodes', label: season.is_complete ? 'Season complete' : `Episodes logged: ${loggedEpisodes.length}`, done: season.is_complete, detail: lastLogged ? `Last logged: episode ${lastLogged} · ${activePlayers.length} still in the game` : 'Nothing logged yet', action: { label: `Log episode ${lastLogged + 1}`, tab: 'episode' } },
  ];
  const next = steps.find(s => !s.done);

  return (
    <div className="admin-tab-content">
      <div className="dash-hero">
        <div>
          <div className="dash-kicker">{season.show_name} {season.season_number}{season.name ? ` · ${season.name}` : ''}</div>
          <h2 className="dash-title">{season.is_complete ? 'Season complete' : next ? `Next: ${next.label.replace(/^Episodes logged: \d+$/, `log episode ${lastLogged + 1}`).toLowerCase()}` : 'All set'}</h2>
          <p className="dash-sub">
            {season.is_complete
              ? 'Standings are final. Write the season stories from the Recaps tab.'
              : next?.key === 'episodes'
                ? `${activePlayers.length} of ${players.length} still in the game. Log each episode the morning after it airs, then generate the recap.`
                : 'Work down the checklist before the premiere.'}
          </p>
        </div>
        {next?.action && !season.is_complete && (
          next.action.href
            ? <Link to={next.action.href} className="btn btn-primary">{next.action.label} →</Link>
            : <button className="btn btn-primary" onClick={() => { if (next.key === 'episodes') setEpisode(lastLogged + 1); goTo(next.action!.tab!); }}>{next.action.label} →</button>
        )}
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <h3>Season checklist</h3>
          <ol className="dash-steps">
            {steps.map(s => (
              <li key={s.key} className={s.done ? 'done' : ''}>
                <span className="dash-step-mark">{s.done ? '✓' : '○'}</span>
                <div className="dash-step-body">
                  <div className="dash-step-label">{s.label}</div>
                  <div className="dash-step-detail">{s.detail}</div>
                </div>
                {!s.done && s.action && (
                  s.action.href
                    ? <Link to={s.action.href} className="btn btn-secondary btn-small">{s.action.label}</Link>
                    : <button className="btn btn-secondary btn-small" onClick={() => goTo(s.action!.tab!)}>{s.action.label}</button>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="dash-card">
          <h3>Quick actions</h3>
          <div className="dash-actions">
            <button className="dash-action" onClick={() => { setEpisode(lastLogged + 1); goTo('episode'); }}>
              <span className="dash-action-icon">📺</span>
              <span><strong>Log episode {lastLogged + 1}</strong><small>Challenges, tribal council, idols — one submit</small></span>
            </button>
            <button className="dash-action" onClick={() => goTo('recap')}>
              <span className="dash-action-icon">📜</span>
              <span><strong>Generate a recap</strong><small>Group-chat episode recap from the scoring</small></span>
            </button>
            <button className="dash-action" onClick={() => goTo('scores')}>
              <span className="dash-action-icon">⚡</span>
              <span><strong>Fix a score</strong><small>Add a one-off event or delete a mistake</small></span>
            </button>
            {league && (
              <Link className="dash-action" to={leagueBase} target="_blank" rel="noreferrer">
                <span className="dash-action-icon">↗</span>
                <span><strong>View the league</strong><small>What everyone else sees</small></span>
              </Link>
            )}
          </div>
        </div>

        <div className="dash-card">
          <h3>At a glance</h3>
          <div className="dash-stats">
            <div><span className="dash-stat">{activePlayers.length}</span><small>still in</small></div>
            <div><span className="dash-stat">{players.length - activePlayers.length}</span><small>voted out</small></div>
            <div><span className="dash-stat">{loggedEpisodes.length}</span><small>episodes logged</small></div>
            <div><span className="dash-stat">{events.length}</span><small>scoring events</small></div>
            <div><span className="dash-stat">{teams.length}</span><small>teams in {league?.name || 'league'}</small></div>
            <div><span className="dash-stat">{episode}</span><small>episode selected</small></div>
          </div>
          {teams.length > 0 && (
            <ol className="dash-standings">
              {teams.slice(0, 5).map((t, i) => (
                <li key={t.id}><span>#{i + 1} {t.name}</span><span>{t.total_score.toFixed(1)}</span></li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
