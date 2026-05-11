export interface Show {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  season_count?: number;
}

export interface Season {
  id: number;
  show_id: number;
  season_number: number;
  name: string | null;
  cast_count: number;
  is_active: boolean;
  show_name?: string;
  show_slug?: string;
  player_count?: number;
  league_count?: number;
}

export interface League {
  id: number;
  season_id: number;
  name: string;
  invite_code: string;
  team_count?: number;
  // Joined fields from league detail
  season_number?: number;
  season_name?: string;
  cast_count?: number;
  show_name?: string;
  show_slug?: string;
}

export interface TribeHistoryEntry {
  tribe_name: string;
  phase: string;
  episode: number | null;
}

export interface Tribe {
  id: number;
  season_id?: number;
  name: string;
  color: string;
  phase: string;
  introduced_episode: number | null;
  is_active: boolean;
}

export interface Player {
  id: number;
  season_id?: number;
  name: string;
  nickname: string | null;
  original_seasons: string;
  tribe: string;
  photo_url: string | null;
  is_eliminated: boolean;
  placement: number | null;
  total_points: number;
  team_id: number | null;
  tribe_history?: TribeHistoryEntry[];
}

export interface Team {
  id: number;
  league_id?: number;
  name: string;
  owner_name: string;
  draft_order: number | null;
  players: Player[];
  total_score: number;
}

export interface ScoringRule {
  id: number;
  show_id?: number;
  event_type: string;
  points: number;
  description: string;
  is_variable: boolean;
}

export interface ScoringEvent {
  id: number;
  player_id: number;
  player_name: string;
  event_type: string;
  points: number;
  episode: number | null;
  notes: string | null;
  tribe: string;
  created_at: string;
}

export interface DraftState {
  league_id?: number;
  is_active: boolean;
  is_complete: boolean;
  current_pick: number;
}
