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
  is_complete: boolean;
  current_episode: number;
  premiere_date: string | null;
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
  roster_size?: number | null;
  team_count?: number;
  season_number?: number;
  season_name?: string;
  cast_count?: number;
  season_complete?: boolean;
  current_episode?: number;
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
  active_players?: number;
}

export interface Player {
  id: number;
  season_id?: number;
  name: string;
  nickname: string | null;
  original_seasons: string;
  tribe: string;
  photo_url: string | null;
  occupation?: string | null;
  hometown?: string | null;
  is_eliminated: boolean;
  placement: number | null;
  total_points: number;
  team_id: number | null;
  pick_number?: number | null;
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

export interface TeamDetail extends Team {
  events: ScoringEvent[];
  recap: string | null;
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

export interface EventInput {
  player_id: number;
  event_type: string;
  episode?: number | null;
  notes?: string | null;
  placement?: number | null;
}

export interface DraftState {
  league_id?: number;
  is_active: boolean;
  is_complete: boolean;
  current_pick: number;
  snake_draft?: boolean;
  seconds_per_pick?: number | null;
  pick_deadline?: string | null;
  roster_size: number;
  total_picks: number;
  round: number | null;
  order_set: boolean;
  on_the_clock_team_id: number | null;
  order: number[];
}

export interface Idol {
  id: number;
  player_id: number;
  player_name: string;
  tribe: string;
  label: string;
  found_episode: number | null;
  played_episode: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface Advantage {
  id: number;
  player_id: number;
  player_name: string;
  tribe: string;
  advantage_type: string;
  found_episode: number | null;
  played_episode: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface AllianceMember {
  id: number;
  name: string;
  tribe: string;
  is_eliminated: boolean;
}

export interface Alliance {
  id: number;
  name: string;
  formed_episode: number | null;
  is_active: boolean;
  notes: string | null;
  members: AllianceMember[] | null;
}

export interface Featured {
  season_id: number;
  season_number: number;
  season_name: string | null;
  premiere_date: string | null;
  current_episode: number;
  show_name: string;
  show_slug: string;
  league_id: number | null;
  league_name: string | null;
  invite_code: string | null;
}

export interface HallOfFameEntry {
  league_id: number;
  league_name: string;
  invite_code: string;
  season_id: number;
  season_number: number;
  season_name: string | null;
  show_name: string;
  show_slug: string;
  team_count: number;
  champion: { id: number; name: string; owner_name: string; total_score: number; players: Player[] };
  runner_up: { id: number; name: string; owner_name: string; total_score: number } | null;
  sole_survivor: { name: string; photo_url: string | null } | null;
}

export interface RecapStanding extends Team {
  rank: number;
  weeks_led: number;
  best_episode: { episode: number; points: number } | null;
}

export interface RecapHighlightPlayer {
  id: number;
  name: string;
  team_name: string;
  team_id: number;
  total_points: number;
  placement: number | null;
  photo_url: string | null;
}

export interface SeasonRecap {
  league: League;
  standings: RecapStanding[];
  episodes: number[];
  per_episode: Record<number, Record<number, number>>;
  cumulative: Record<number, Record<number, number>>;
  highlights: {
    biggest_episode: { team_id: number; team_name: string; episode: number; points: number } | null;
    mvp: RecapHighlightPlayer | null;
    bust: RecapHighlightPlayer | null;
    margin: number;
  };
  recaps: Record<number, string>;
}

export interface ExtractionProposal {
  player_id: number | null;
  player_name: string;
  event_type: string;
  count: number;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  problem: string | null;
}

export interface Extraction {
  episode: number;
  proposals: ExtractionProposal[];
  eliminated: { player_id: number | null; player_name: string; votes_received: number; had_idol: boolean; how: string }[];
  summary: string;
  warnings: string[];
  usage: { input_tokens: number; output_tokens: number; model: string };
}
