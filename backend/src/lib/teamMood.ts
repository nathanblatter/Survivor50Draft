import pool from '../db';

/**
 * Each team's "mood" for the week: an emoji picked from how it scored in the latest scored episode,
 * ranked against the other teams in its league. Rendered next to the team name across the site.
 */
export interface TeamWeek {
  /** The episode the mood is based on (null before anything has been scored). */
  episode: number | null;
  points: number;
  /** 1 = best week in the league; ties share a rank. */
  rank: number | null;
  emoji: string;
  label: string;
}

const FRESH: TeamWeek = { episode: null, points: 0, rank: null, emoji: '🌱', label: 'No episode scored yet' };

export async function teamWeeks(leagueId: number): Promise<Map<number, TeamWeek>> {
  const latest = await pool.query(
    `SELECT MAX(se.episode) AS episode
     FROM scoring_events se
     JOIN players p ON p.id = se.player_id
     JOIN leagues l ON l.season_id = p.season_id
     WHERE l.id = $1 AND NOT se.is_neutral AND se.event_type <> 'placement'`,
    [leagueId]
  );
  const episode: number | null = latest.rows[0]?.episode ?? null;
  const teamsRes = await pool.query('SELECT id FROM teams WHERE league_id = $1', [leagueId]);
  const out = new Map<number, TeamWeek>();
  if (episode === null) {
    for (const t of teamsRes.rows) out.set(t.id, FRESH);
    return out;
  }
  const pts = await pool.query(
    `SELECT t.id AS team_id, COALESCE(SUM(se.points), 0)::float AS points
     FROM teams t
     LEFT JOIN team_players tp ON tp.team_id = t.id
     LEFT JOIN scoring_events se ON se.player_id = tp.player_id AND se.episode = $2
     WHERE t.league_id = $1
     GROUP BY t.id`,
    [leagueId, episode]
  );
  const rows: { team_id: number; points: number }[] = pts.rows;
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  const avg = rows.length ? rows.reduce((s, r) => s + r.points, 0) / rows.length : 0;
  let rank = 0;
  sorted.forEach((r, i) => {
    if (i === 0 || r.points < sorted[i - 1].points) rank = i + 1;
    const last = rank === sorted.length && sorted.length > 1 && r.points < sorted[0].points;
    const [emoji, label] = mood(rank, last, r.points, avg, sorted.length);
    out.set(r.team_id, { episode, points: r.points, rank, emoji, label: `${label} · ${r.points >= 0 ? '+' : ''}${r.points.toFixed(1)} in ep ${episode}` });
  });
  return out;
}

function mood(rank: number, last: boolean, points: number, avg: number, n: number): [string, string] {
  if (n === 1) return ['🏕', 'Only team in the league'];
  if (rank === 1) return ['🔥', 'Hottest team this week'];
  if (last) return points < 0 ? ['💀', 'Rough week'] : ['🥶', 'Coldest team this week'];
  if (rank === 2) return ['🚀', 'Climbing'];
  if (points >= avg - 0.5) return ['😎', 'Solid week'];
  return ['😬', 'Below the pack this week'];
}
