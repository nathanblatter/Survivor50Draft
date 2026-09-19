import {
  Show, Season, League, Player, Team, TeamDetail, ScoringRule, ScoringEvent, EventInput, DraftState,
  Tribe, Idol, Advantage, Alliance, Featured, HallOfFameEntry, SeasonRecap, Extraction,
} from './types';

const API_BASE = '/api';
export const TOKEN_KEY = 'fantasydraft_token';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T = { success: true }>(path: string) => request<T>(path, { method: 'DELETE' });

export const api = {
  // Auth
  login: (password: string) => post<{ token: string }>('/auth/login', { password }),
  verifyToken: () => request<{ valid: boolean }>('/auth/verify'),

  // Landing / archive
  getFeatured: () => request<Featured | null>('/featured'),
  getHallOfFame: () => request<HallOfFameEntry[]>('/hall-of-fame'),
  getSeasonRecap: (leagueId: number) => request<SeasonRecap>(`/leagues/${leagueId}/recap`),

  // Shows
  getShows: () => request<Show[]>('/shows'),
  getShow: (slug: string) => request<Show>(`/shows/${slug}`),
  createShow: (data: { name: string; slug: string; description?: string }) => post<Show>('/shows', data),
  updateShow: (slug: string, data: { name?: string; description?: string }) => patch<Show>(`/shows/${slug}`, data),
  deleteShow: (slug: string) => del(`/shows/${slug}`),

  // Seasons
  getSeasons: (showSlug: string) => request<Season[]>(`/shows/${showSlug}/seasons`),
  getSeason: (seasonId: number) => request<Season>(`/seasons/${seasonId}`),
  getSeasonBySlug: (showSlug: string, seasonNum: number) => request<Season>(`/shows/${showSlug}/seasons/${seasonNum}`),
  createSeason: (showSlug: string, data: { season_number: number; name?: string; cast_count?: number; premiere_date?: string }) =>
    post<Season>(`/shows/${showSlug}/seasons`, data),
  updateSeason: (seasonId: number, data: Partial<Pick<Season, 'name' | 'cast_count' | 'is_active' | 'is_complete' | 'current_episode' | 'premiere_date'>>) =>
    patch<Season>(`/seasons/${seasonId}`, data),
  deleteSeason: (seasonId: number) => del(`/seasons/${seasonId}`),

  // Leagues
  getLeagues: (seasonId: number) => request<League[]>(`/seasons/${seasonId}/leagues`),
  getLeague: (leagueId: number) => request<League>(`/leagues/${leagueId}`),
  getLeagueByInviteCode: (inviteCode: string) => request<League>(`/leagues/join/${inviteCode}`),
  createLeague: (seasonId: number, data: { name: string; invite_code?: string }) => post<League>(`/seasons/${seasonId}/leagues`, data),
  updateLeague: (leagueId: number, data: { name: string }) => patch<League>(`/leagues/${leagueId}`, data),
  deleteLeague: (leagueId: number) => del(`/leagues/${leagueId}`),

  // Players
  getSeasonPlayers: (seasonId: number, leagueId?: number) =>
    request<Player[]>(`/seasons/${seasonId}/players${leagueId ? `?league_id=${leagueId}` : ''}`),
  getPlayer: (id: number) => request<Player & { events: ScoringEvent[] }>(`/players/${id}`),
  createPlayer: (seasonId: number, data: Partial<Player> & { name: string; tribe: string }) => post<Player>(`/seasons/${seasonId}/players`, data),
  bulkImportPlayers: (seasonId: number, players: Partial<Player>[]) => post<Player[]>(`/seasons/${seasonId}/players/bulk`, { players }),
  updatePlayer: (id: number, data: Partial<Player>) => patch<Player>(`/players/${id}`, data),
  deletePlayer: (id: number) => del(`/players/${id}`),

  // Teams
  getLeagueTeams: (leagueId: number) => request<Team[]>(`/leagues/${leagueId}/teams`),
  getTeam: (id: number) => request<TeamDetail>(`/teams/${id}`),
  createLeagueTeam: (leagueId: number, data: { name: string; owner_name: string; draft_order?: number }) => post<Team>(`/leagues/${leagueId}/teams`, data),
  updateTeam: (id: number, data: { name?: string; owner_name?: string; draft_order?: number | null }) => patch<Team>(`/teams/${id}`, data),
  deleteTeam: (id: number) => del(`/teams/${id}`),

  // Draft
  getLeagueDraftState: (leagueId: number) => request<DraftState>(`/leagues/${leagueId}/draft/state`),
  startLeagueDraft: (leagueId: number) => post<DraftState>(`/leagues/${leagueId}/draft/start`),
  pauseLeagueDraft: (leagueId: number) => post<DraftState>(`/leagues/${leagueId}/draft/pause`),
  setDraftOrder: (leagueId: number, data: { team_ids?: number[]; randomize?: boolean; roster_size?: number | null; seconds_per_pick?: number | null; snake?: boolean }) =>
    post<DraftState>(`/leagues/${leagueId}/draft/order`, data),
  makeLeaguePick: (leagueId: number, team_id: number, player_id: number, force = false) =>
    post<{ success: boolean; pick_number: number; is_complete: boolean }>(`/leagues/${leagueId}/draft/pick`, { team_id, player_id, force }),
  undoLeaguePick: (leagueId: number, playerId: number) => del(`/leagues/${leagueId}/draft/pick/${playerId}`),
  resetLeagueDraft: (leagueId: number) => post(`/leagues/${leagueId}/draft/reset`),

  // Scoring
  getShowScoringRules: (showSlug: string) => request<ScoringRule[]>(`/shows/${showSlug}/rules`),
  createShowScoringRule: (showSlug: string, data: { event_type: string; points: number; description: string; is_variable?: boolean }) =>
    post<ScoringRule>(`/shows/${showSlug}/rules`, data),
  updateScoringRule: (id: number, data: Partial<ScoringRule>) => patch<ScoringRule>(`/rules/${id}`, data),
  deleteScoringRule: (id: number) => del(`/rules/${id}`),
  getSeasonScoringEvents: (seasonId: number, opts?: { limit?: number; episode?: number }) => {
    const q = new URLSearchParams();
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.episode) q.set('episode', String(opts.episode));
    const qs = q.toString();
    return request<ScoringEvent[]>(`/seasons/${seasonId}/scoring/events${qs ? `?${qs}` : ''}`);
  },
  /** Add one or many scoring events in a single transaction. */
  addScoringEvents: (seasonId: number, events: EventInput[]) =>
    post<ScoringEvent[]>(`/seasons/${seasonId}/scoring/events`, { events }),
  deleteScoringEvent: (id: number) => del(`/scoring/events/${id}`),
  extractScoring: (seasonId: number, data: { episode: number; urls?: string[]; text?: string }) =>
    post<Extraction>(`/seasons/${seasonId}/scoring/extract`, data),

  // Summary / recaps
  getLeagueEpisodesWithEvents: (leagueId: number) =>
    request<{ episode: number; event_count: number }[]>(`/leagues/${leagueId}/summary/episodes`),
  getLeagueEpisodeEvents: (leagueId: number, episode: number) => request<ScoringEvent[]>(`/leagues/${leagueId}/summary/episodes/${episode}`),
  generateLeagueEpisodeSummary: (leagueId: number, episode: number) =>
    post<{ episode: number; summary: string; event_count: number }>(`/leagues/${leagueId}/summary/generate`, { episode }),
  generateTeamSeasonRecap: (leagueId: number, teamId: number) =>
    post<{ team_name: string; owner_name: string; rank: number; total_score: number; recap: string }>(`/leagues/${leagueId}/teams/${teamId}/recap/generate`),

  // Game state
  getIdols: (seasonId: number) => request<Idol[]>(`/seasons/${seasonId}/gamestate/idols`),
  addIdol: (seasonId: number, data: { player_id: number; label?: string; found_episode?: number; notes?: string }) =>
    post<Idol>(`/seasons/${seasonId}/gamestate/idols`, data),
  updateIdol: (id: number, data: { played_episode?: number; is_active?: boolean; notes?: string }) => patch<Idol>(`/gamestate/idols/${id}`, data),
  deleteIdol: (id: number) => del(`/gamestate/idols/${id}`),
  getAdvantages: (seasonId: number) => request<Advantage[]>(`/seasons/${seasonId}/gamestate/advantages`),
  addAdvantage: (seasonId: number, data: { player_id: number; advantage_type: string; found_episode?: number; notes?: string }) =>
    post<Advantage>(`/seasons/${seasonId}/gamestate/advantages`, data),
  updateAdvantage: (id: number, data: { played_episode?: number; is_active?: boolean; notes?: string }) => patch<Advantage>(`/gamestate/advantages/${id}`, data),
  deleteAdvantage: (id: number) => del(`/gamestate/advantages/${id}`),
  getAlliances: (seasonId: number) => request<Alliance[]>(`/seasons/${seasonId}/gamestate/alliances`),
  createAlliance: (seasonId: number, data: { name: string; formed_episode?: number; notes?: string; member_ids?: number[] }) =>
    post<Alliance>(`/seasons/${seasonId}/gamestate/alliances`, data),
  updateAlliance: (id: number, data: { name?: string; is_active?: boolean; notes?: string; member_ids?: number[] }) => patch<Alliance>(`/gamestate/alliances/${id}`, data),
  deleteAlliance: (id: number) => del(`/gamestate/alliances/${id}`),

  // Tribes
  getSeasonTribes: (seasonId: number) => request<Tribe[]>(`/seasons/${seasonId}/tribes`),
  createTribe: (seasonId: number, data: { name: string; color: string; phase?: string; introduced_episode?: number }) =>
    post<Tribe>(`/seasons/${seasonId}/tribes`, data),
  updateTribe: (id: number, data: { name?: string; color?: string; is_active?: boolean }) => patch<Tribe>(`/tribes/${id}`, data),
  deleteTribe: (id: number) => del(`/tribes/${id}`),
  performSwap: (seasonId: number, data: { episode: number; assignments: { player_id: number; tribe_name: string }[]; new_tribes?: { name: string; color: string }[] }) =>
    post<{ success: boolean; message: string }>(`/seasons/${seasonId}/tribes/swap`, data),
  performMerge: (seasonId: number, data: { episode: number; tribe_name: string; tribe_color: string }) =>
    post<{ success: boolean; message: string }>(`/seasons/${seasonId}/tribes/merge`, data),
};

/** Human-readable label for an event type, preferring the rule's description. */
export function eventLabel(eventType: string, rules?: ScoringRule[]): string {
  const rule = rules?.find((r) => r.event_type === eventType);
  if (rule) return rule.description;
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPoints(points: number): string {
  const n = Number(points);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
  return n > 0 ? `+${s}` : s;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
