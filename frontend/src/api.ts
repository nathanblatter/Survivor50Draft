const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('survivor50_token');
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

  // Players
  getPlayers: () => request<any[]>('/players'),
  getPlayer: (id: number) => request<any>(`/players/${id}`),
  updatePlayer: (id: number, data: any) => request<any>(`/players/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),

  // Teams
  getTeams: () => request<any[]>('/teams'),
  getTeam: (id: number) => request<any>(`/teams/${id}`),
  createTeam: (data: { name: string; owner_name: string; draft_order?: number }) =>
    request<any>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: number, data: { name?: string; owner_name?: string }) =>
    request<any>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTeam: (id: number) => request<any>(`/teams/${id}`, { method: 'DELETE' }),

  // Draft
  getDraftState: () => request<any>('/draft/state'),
  startDraft: () => request<any>('/draft/start', { method: 'POST' }),
  makePick: (team_id: number, player_id: number) =>
    request<any>('/draft/pick', { method: 'POST', body: JSON.stringify({ team_id, player_id }) }),
  undoPick: (playerId: number) => request<any>(`/draft/pick/${playerId}`, { method: 'DELETE' }),
  resetDraft: () => request<any>('/draft/reset', { method: 'POST' }),

  // Scoring
  getScoringRules: () => request<any[]>('/scoring/rules'),
  createScoringRule: (data: { event_type: string; points: number; description: string; is_variable?: boolean }) =>
    request<any>('/scoring/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateScoringRule: (id: number, data: { event_type?: string; points?: number; description?: string; is_variable?: boolean }) =>
    request<any>(`/scoring/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteScoringRule: (id: number) => request<any>(`/scoring/rules/${id}`, { method: 'DELETE' }),
  getScoringEvents: (limit?: number) => request<any[]>(`/scoring/events?limit=${limit || 50}`),
  addScoringEvent: (data: {
    player_id: number; event_type: string; episode?: number; notes?: string; custom_points?: number;
  }) => request<any>('/scoring/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteScoringEvent: (id: number) => request<any>(`/scoring/events/${id}`, { method: 'DELETE' }),
  addBulkScoringEvents: (data: {
    player_ids: number[]; event_type: string; episode?: number; notes?: string;
  }) => request<any[]>('/scoring/events/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // Summary
  getEpisodesWithEvents: () => request<{ episode: number; event_count: number }[]>('/summary/episodes'),
  getEpisodeEvents: (episode: number) => request<any[]>(`/summary/episodes/${episode}`),
  generateEpisodeSummary: (episode: number) =>
    request<{ episode: number; summary: string; event_count: number }>('/summary/generate', {
      method: 'POST', body: JSON.stringify({ episode }),
    }),

  // Tribes
  getTribes: () => request<any[]>('/tribes'),
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
