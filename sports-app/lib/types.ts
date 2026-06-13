export type Sport = 'baseball' | 'softball';
export type PitchLimitMode = 'pitch_smart' | 'track_only' | 'custom';
export type GameStatus = 'scheduled' | 'live' | 'final';
export type InningHalf = 'top' | 'bottom';
export type BatHand = 'R' | 'L' | 'S';
export type LineupRole = 'standard' | 'DP' | 'FLEX' | 'EH';
export type FieldPosition =
  | 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF'
  | 'DP' | 'FLEX' | 'EH' | 'BN';

export interface Team {
  id: string;
  name: string;
  sport: Sport;
  age_group: string;
  pitch_limit_mode: PitchLimitMode;
  custom_pitch_limit: number | null;
  coach_code: string;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  name: string;
  jersey_number: string | null;
  bats: BatHand;
  can_pitch: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Game {
  id: string;
  team_id: string;
  opponent: string;
  game_date: string;
  game_time: string | null;
  our_score: number;
  their_score: number;
  current_inning: number;
  inning_half: InningHalf;
  current_batter_order: number;
  status: GameStatus;
  share_token: string;
  notes: string | null;
}

export interface GameLineup {
  id: string;
  game_id: string;
  player_id: string;
  batting_order: number;
  role: LineupRole;
  is_sub: boolean;
  subbed_in_inning: number | null;
  subbed_out_player_id: string | null;
  player?: Player;
}

export interface PitchLog {
  id: string;
  game_id: string;
  player_id: string;
  pitch_count: number;
  inning_started: number;
  inning_ended: number | null;
  created_at: string;
  player?: Player;
}

export interface PositionLog {
  id: string;
  game_id: string;
  player_id: string;
  inning: number;
  position: FieldPosition;
}

export interface ParentView {
  share_token: string;
  opponent: string;
  our_score: number;
  their_score: number;
  current_inning: number;
  inning_half: InningHalf;
  status: GameStatus;
  batter_name: string | null;
  batter_jersey: string | null;
  pitcher_name: string | null;
  current_pitch_count: number | null;
}

export interface PitchStatus {
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  daysRest: number;
  remaining: number;
  canPitch: boolean;
}

export interface PitcherAvailability {
  player: Player;
  totalPitches: number;
  status: PitchStatus;
}
