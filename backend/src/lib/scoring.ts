import { PoolClient } from 'pg';

export interface EventInput {
  player_id: number;
  event_type: string;
  episode?: number | null;
  notes?: string | null;
  /** For `placement` events: the finishing position (1 = winner). */
  placement?: number | null;
  /** Legacy alias for placement (older admin UI sent placement as custom_points). */
  custom_points?: number | null;
  /**
   * Record the event for history but score it 0 (e.g. an episode that aired before the draft).
   * Placement is never neutralised: a boot's finishing points stand regardless.
   */
  neutral?: boolean;
}

export class ScoringError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface SeasonInfo {
  id: number;
  show_id: number;
  cast_count: number;
}

/**
 * Insert one or more scoring events for players in a single season, inside the caller's transaction.
 * Validates that every player belongs to the season and that every event type has a rule for the show.
 * Placement events also update the player's placement / elimination status.
 */
export async function insertEvents(client: PoolClient, seasonId: number, events: EventInput[]) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new ScoringError('At least one event is required');
  }

  const seasonRes = await client.query<SeasonInfo>(
    'SELECT id, show_id, cast_count FROM seasons WHERE id = $1',
    [seasonId]
  );
  if (seasonRes.rows.length === 0) throw new ScoringError('Season not found', 404);
  const season = seasonRes.rows[0];

  const playerIds = [...new Set(events.map((e) => Number(e.player_id)))];
  if (playerIds.some((id) => !Number.isInteger(id))) throw new ScoringError('Invalid player_id');
  const playersRes = await client.query(
    'SELECT id, name FROM players WHERE season_id = $1 AND id = ANY($2)',
    [seasonId, playerIds]
  );
  const playerNames = new Map<number, string>(playersRes.rows.map((r: any) => [r.id, r.name]));
  const missing = playerIds.filter((id) => !playerNames.has(id));
  if (missing.length) throw new ScoringError(`Players not in this season: ${missing.join(', ')}`);

  const rulesRes = await client.query(
    'SELECT event_type, points, is_variable FROM scoring_rules WHERE show_id = $1',
    [season.show_id]
  );
  const rules = new Map<string, { points: number; is_variable: boolean }>(
    rulesRes.rows.map((r: any) => [r.event_type, { points: parseFloat(r.points), is_variable: r.is_variable }])
  );

  const inserted: any[] = [];
  for (const e of events) {
    if (!e.event_type) throw new ScoringError('event_type is required');
    const rule = rules.get(e.event_type);
    if (!rule) throw new ScoringError(`Unknown event type: ${e.event_type}`);

    let points = rule.points;
    if (e.event_type === 'placement') {
      const placement = Number(e.placement ?? e.custom_points);
      if (!Number.isInteger(placement) || placement < 1 || placement > season.cast_count) {
        throw new ScoringError(`Placement must be between 1 and ${season.cast_count}`);
      }
      points = season.cast_count + 1 - placement;
      await client.query(
        'UPDATE players SET placement = $1, is_eliminated = $2 WHERE id = $3',
        [placement, placement > 1, e.player_id]
      );
    }

    const neutral = Boolean(e.neutral) && e.event_type !== 'placement';
    if (neutral) points = 0;

    const res = await client.query(
      'INSERT INTO scoring_events (player_id, event_type, points, episode, notes, is_neutral) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [e.player_id, e.event_type, points, e.episode ?? null, e.notes ?? null, neutral]
    );
    inserted.push({ ...res.rows[0], player_name: playerNames.get(Number(e.player_id)) });
  }
  return inserted;
}

/** Resolve the season a player belongs to (or throw). */
export async function seasonForPlayer(client: PoolClient, playerId: number): Promise<number> {
  const r = await client.query('SELECT season_id FROM players WHERE id = $1', [playerId]);
  if (r.rows.length === 0) throw new ScoringError('Player not found', 404);
  return r.rows[0].season_id;
}

/**
 * Flip a whole episode between scored and neutral (recorded, 0 points). Neutral → points 0;
 * scored → points restored from the show's current rules. Placement events are left untouched.
 * Returns the number of events changed.
 */
export async function setEpisodeNeutral(client: PoolClient, seasonId: number, episode: number, neutral: boolean): Promise<number> {
  if (!Number.isInteger(episode) || episode < 1) throw new ScoringError('Invalid episode');
  const seasonRes = await client.query<SeasonInfo>('SELECT id, show_id, cast_count FROM seasons WHERE id = $1', [seasonId]);
  if (seasonRes.rows.length === 0) throw new ScoringError('Season not found', 404);
  const showId = seasonRes.rows[0].show_id;
  const res = neutral
    ? await client.query(
        `UPDATE scoring_events se SET points = 0, is_neutral = TRUE
         FROM players p WHERE p.id = se.player_id AND p.season_id = $1 AND se.episode = $2 AND se.event_type <> 'placement'`,
        [seasonId, episode]
      )
    : await client.query(
        `UPDATE scoring_events se SET points = r.points, is_neutral = FALSE
         FROM players p, scoring_rules r
         WHERE p.id = se.player_id AND p.season_id = $1 AND se.episode = $2 AND se.event_type <> 'placement'
           AND r.show_id = $3 AND r.event_type = se.event_type`,
        [seasonId, episode, showId]
      );
  return res.rowCount ?? 0;
}
