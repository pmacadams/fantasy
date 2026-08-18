export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export type DraftStatus = "setup" | "live" | "paused" | "complete";

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export type League = {
  id: string;
  slug: string;
  name: string;
  rounds: number;
  team_count: number;
  status: DraftStatus;
  current_pick: number;
  created_at: string;
};

export type FantasyTeam = {
  id: string;
  league_id: string;
  name: string;
  draft_position: number;
};

export type Player = {
  id: string;
  name: string;
  position: Position;
  nfl_team: string;
  bye_week: number | null;
  rank: number | null;
  adp: number | null;
  pos_rank: string | null;
};

export type Pick = {
  id: string;
  league_id: string;
  fantasy_team_id: string;
  nfl_player_id: string;
  overall_pick: number;
  round: number;
  round_pick: number;
  created_at: string;
};
