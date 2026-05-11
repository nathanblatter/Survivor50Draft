import { Show, Season, League } from './types';

const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('fantasydraft_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (password: string) => request<{ token: string }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ password }),
  }),
  verifyToken: () => request<{ valid: boolean }>('/auth/verify'),

  // ── Shows ──
  getShows: () => request<Show[]>('/shows'),
  getShow: (slug: string) => request<Show>(`/shows/${slug}`),
  createShow: (data: { name: string; slug: string; description?: string }) =>
    request<Show>('/shows', { method: 'POST', body: JSON.stringify(data) }),
  updateShow: (slug: string, data: { name?: string; description?: string }) =>
    request<Show>(`/shows/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteShow: (slug: string) => request<any>(`/shows/${slug}`, { method: 'DELETE' }),

  // ── Seasons ──
  getSeasons: (showSlug: string) => request<Season[]>(`/shows/${showSlug}/seasons`),
  getSeason: (seasonId: number) => request<Season>(`/seasons/${seasonId}`),
  getSeasonBySlug: (showSlug: string, seasonNum: number) =>
    request<Season>(`/shows/${showSlug}/seasons/${seasonNum}`),
  createSeason: (showSlug: string, data: { season_number: number; name?: string; cast_count?: number }) =>
    request<Season>(`/shows/${showSlug}/seasons`, { method: 'POST', body: JSON.stringify(data) }),
  updateSeason: (seasonId: number, data: { name?: string; cast_count?: number; is_active?: boolean }) =>
    request<Season>(`/seasons/${seasonId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Leagues ──
  getLeagues: (seasonId: number) => request<League[]>(`/seasons/${seasonId}/leagues`),
  getLeague: (leagueId: number) => request<League>(`/leagues/${leagueId}`),
  getLeagueByInviteCode: (inviteCode: string) => request<League>(`/leagues/join/${inviteCode}`),
  createLeague: (seasonId: number, data: { name: string; invite_code?: string }) =>
    request<League>(`/seasons/${seasonId}/leagues`, { method: 'POST', body: JSON.stringify(data) }),
  updateLeague: (leagueId: number, data: { name: string }) =>
    request<League>(`/leagues/${leagueId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLeague: (leagueId: number) => request<any>(`/leagues/${leagueId}`, { method: 'DELETE' }),

  // ── Players (scoped + legacy) ──
  getPlayers: () => request<any[]>('/players'),
  getSeasonPlayers: (seasonId: number) => request<any[]>(`/seasons/${seasonId}/players`),
  getPlayer: (id: number) => request<any>(`/players/${id}`),
  updatePlayer: (id: number, data: any) => request<any>(`/players/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  createPlayer: (seasonId: number, data: { name: string; nickname?: string; original_seasons: string; tribe: string; photo_url?: string }) =>
    request<any>(`/seasons/${seasonId}/players`, { method: 'POST', body: JSON.stringify(data) }),
  bulkImportPlayers: (seasonId: number, players: any[]) =>
    request<any[]>(`/seasons/${seasonId}/players/bulk`, { method: 'POST', body: JSON.stringify({ players }) }),
  deletePlayer: (id: number) => request<any>(`/players/${id}`, { method: 'DELETE' }),

  // ── Teams (scoped + legacy) ──
  getTeams: () => request<any[]>('/teams'),
  getLeagueTeams: (leagueId: number) => request<any[]>(`/leagues/${leagueId}/teams`),
  getTeam: (id: number) => request<any>(`/teams/${id}`),
  createTeam: (data: { name: string; owner_name: string; draft_order?: number; league_id?: number }) =>
    request<any>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  createLeagueTeam: (leagueId: number, data: { name: string; owner_name: string; draft_order?: number }) =>
    request<any>(`/leagues/${leagueId}/teams`, { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: number, data: { name?: string; owner_name?: string }) =>
    request<any>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTeam: (id: number) => request<any>(`/teams/${id}`, { method: 'DELETE' }),

  // ── Draft (scoped + legacy) ──
  getDraftState: () => request<any>('/draft/state'),
  getLeagueDraftState: (leagueId: number) => request<any>(`/leagues/${leagueId}/draft/state`),
  startDraft: () => request<any>('/draft/start', { method: 'POST' }),
  startLeagueDraft: (leagueId: number) => request<any>(`/leagues/${leagueId}/draft/start`, { method: 'POST' }),
  makePick: (team_id: number, player_id: number) =>
    request<any>('/draft/pick', { method: 'POST', body: JSON.stringify({ team_id, player_id }) }),
  makeLeaguePick: (leagueId: number, team_id: number, player_id: number) =>
    request<any>(`/leagues/${leagueId}/draft/pick`, { method: 'POST', body: JSON.stringify({ team_id, player_id }) }),
  undoPick: (playerId: number) => request<any>(`/draft/pick/${playerId}`, { method: 'DELETE' }),
  undoLeaguePick: (leagueId: number, playerId: number) =>
    request<any>(`/leagues/${leagueId}/draft/pick/${playerId}`, { method: 'DELETE' }),
  resetDraft: () => request<any>('/draft/reset', { method: 'POST' }),
  resetLeagueDraft: (leagueId: number) => request<any>(`/leagues/${leagueId}/draft/reset`, { method: 'POST' }),

  // ── Scoring (scoped + legacy) ──
  getScoringRules: () => request<any[]>('/scoring/rules'),
  getShowScoringRules: (showSlug: string) => request<any[]>(`/shows/${showSlug}/rules`),
  createScoringRule: (data: { event_type: string; points: number; description: string; is_variable?: boolean; show_id?: number }) =>
    request<any>('/scoring/rules', { method: 'POST', body: JSON.stringify(data) }),
  createShowScoringRule: (showSlug: string, data: { event_type: string; points: number; description: string; is_variable?: boolean }) =>
    request<any>(`/shows/${showSlug}/rules`, { method: 'POST', body: JSON.stringify(data) }),
  updateScoringRule: (id: number, data: { event_type?: string; points?: number; description?: string; is_variable?: boolean }) =>
    request<any>(`/scoring/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteScoringRule: (id: number) => request<any>(`/scoring/rules/${id}`, { method: 'DELETE' }),
  getScoringEvents: (limit?: number) => request<any[]>(`/scoring/events?limit=${limit || 50}`),
  getSeasonScoringEvents: (seasonId: number, limit?: number) =>
    request<any[]>(`/seasons/${seasonId}/scoring/events?limit=${limit || 50}`),
  addScoringEvent: (data: {
    player_id: number; event_type: string; episode?: number; notes?: string; custom_points?: number;
  }) => request<any>('/scoring/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteScoringEvent: (id: number) => request<any>(`/scoring/events/${id}`, { method: 'DELETE' }),
  addBulkScoringEvents: (data: {
    player_ids: number[]; event_type: string; episode?: number; notes?: string;
  }) => request<any[]>('/scoring/events/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // ── Summary (scoped + legacy) ──
  getEpisodesWithEvents: () => request<{ episode: number; event_count: number }[]>('/summary/episodes'),
  getLeagueEpisodesWithEvents: (leagueId: number) =>
    request<{ episode: number; event_count: number }[]>(`/leagues/${leagueId}/summary/episodes`),
  getEpisodeEvents: (episode: number) => request<any[]>(`/summary/episodes/${episode}`),
  getLeagueEpisodeEvents: (leagueId: number, episode: number) =>
    request<any[]>(`/leagues/${leagueId}/summary/episodes/${episode}`),
  generateEpisodeSummary: (episode: number) =>
    request<{ episode: number; summary: string; event_count: number }>('/summary/generate', {
      method: 'POST', body: JSON.stringify({ episode }),
    }),
  generateLeagueEpisodeSummary: (leagueId: number, episode: number) =>
    request<{ episode: number; summary: string; event_count: number }>(`/leagues/${leagueId}/summary/generate`, {
      method: 'POST', body: JSON.stringify({ episode }),
    }),

  // ── Game State (legacy — works for backward compat) ──
  getIdols: () => request<any[]>('/gamestate/idols'),
  addIdol: (data: { player_id: number; label?: string; found_episode?: number; notes?: string }) =>
    request<any>('/gamestate/idols', { method: 'POST', body: JSON.stringify(data) }),
  updateIdol: (id: number, data: { played_episode?: number; is_active?: boolean; notes?: string }) =>
    request<any>(`/gamestate/idols/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteIdol: (id: number) => request<any>(`/gamestate/idols/${id}`, { method: 'DELETE' }),

  getAdvantages: () => request<any[]>('/gamestate/advantages'),
  addAdvantage: (data: { player_id: number; advantage_type: string; found_episode?: number; notes?: string }) =>
    request<any>('/gamestate/advantages', { method: 'POST', body: JSON.stringify(data) }),
  updateAdvantage: (id: number, data: { played_episode?: number; is_active?: boolean; notes?: string }) =>
    request<any>(`/gamestate/advantages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAdvantage: (id: number) => request<any>(`/gamestate/advantages/${id}`, { method: 'DELETE' }),

  getAlliances: () => request<any[]>('/gamestate/alliances'),
  createAlliance: (data: { name: string; formed_episode?: number; notes?: string; member_ids?: number[] }) =>
    request<any>('/gamestate/alliances', { method: 'POST', body: JSON.stringify(data) }),
  updateAlliance: (id: number, data: { name?: string; is_active?: boolean; notes?: string; member_ids?: number[] }) =>
    request<any>(`/gamestate/alliances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAlliance: (id: number) => request<any>(`/gamestate/alliances/${id}`, { method: 'DELETE' }),

  // ── Tribes (legacy) ──
  getTribes: () => request<any[]>('/tribes'),
  getSeasonTribes: (seasonId: number) => request<any[]>(`/seasons/${seasonId}/tribes`),
  createTribe: (data: { name: string; color: string; phase?: string; introduced_episode?: number }) =>
    request<any>('/tribes', { method: 'POST', body: JSON.stringify(data) }),
  performSwap: (data: {
    episode: number;
    assignments: { player_id: number; tribe_name: string }[];
    new_tribes?: { name: string; color: string }[];
  }) => request<any>('/tribes/swap', { method: 'POST', body: JSON.stringify(data) }),
  performMerge: (data: { episode: number; tribe_name: string; tribe_color: string }) =>
    request<any>('/tribes/merge', { method: 'POST', body: JSON.stringify(data) }),
};
