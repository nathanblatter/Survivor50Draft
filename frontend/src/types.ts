export interface TribeHistoryEntry {
  tribe_name: string;
  phase: string;
  episode: number | null;
}

export interface Tribe {
  id: number;
  name: string;
  color: string;
  phase: string;
  introduced_episode: number | null;
  is_active: boolean;
}

export interface Player {
  id: number;
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
  name: string;
  owner_name: string;
  draft_order: number | null;
  players: Player[];
  total_score: number;
}

export interface ScoringRule {
  id: number;
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
  is_active: boolean;
  is_complete: boolean;
  current_pick: number;
}
