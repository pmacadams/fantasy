"use client";

import { pickForCell } from "@/lib/snake";
import type { FantasyTeam, League, Pick, Player } from "@/lib/types";
import { posClass } from "./PositionTag";

/**
 * Columns are fantasy teams, rows are rounds — the wall chart everyone already
 * knows. The round rail on the left shows which way each round runs, so the
 * snake is legible without counting cells.
 */
export function DraftBoard({
  league,
  teams,
  picks,
  playerById,
  myTeamId,
  onCellClick,
}: {
  league: League;
  teams: FantasyTeam[];
  picks: Pick[];
  playerById: Map<string, Player>;
  myTeamId?: string | null;
  onCellClick?: (overall: number, existing: Pick | null) => void;
}) {
  const byOverall = new Map(picks.map((p) => [p.overall_pick, p]));
  const rounds = Array.from({ length: league.rounds }, (_, i) => i + 1);
  const slots = Array.from({ length: league.team_count }, (_, i) => i + 1);

  return (
    <div className="scroll-x overflow-x-auto">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `3rem repeat(${league.team_count}, minmax(9.5rem, 1fr))` }}
      >
        {/* Header: team names in draft order */}
        <div className="sticky left-0 z-10 border-b border-r border-line bg-base" />
        {slots.map((slot) => {
          const team = teams.find((t) => t.draft_position === slot);
          const mine = team?.id === myTeamId;
          return (
            <div
              key={slot}
              className={`border-b border-r border-line px-2 py-2 ${
                mine ? "bg-signal/10" : "bg-panel"
              }`}
            >
              <div className="font-mono text-[10px] text-dim">{slot}</div>
              <div
                className={`truncate font-display text-sm uppercase tracking-wide ${
                  mine ? "text-signal" : "text-ink"
                }`}
                title={team?.name}
              >
                {team?.name ?? "—"}
              </div>
            </div>
          );
        })}

        {/* Body */}
        {rounds.map((round) => (
          <BoardRow
            key={round}
            round={round}
            slots={slots}
            league={league}
            teams={teams}
            byOverall={byOverall}
            playerById={playerById}
            myTeamId={myTeamId}
            onCellClick={onCellClick}
          />
        ))}
      </div>
    </div>
  );
}

function BoardRow({
  round,
  slots,
  league,
  teams,
  byOverall,
  playerById,
  myTeamId,
  onCellClick,
}: {
  round: number;
  slots: number[];
  league: League;
  teams: FantasyTeam[];
  byOverall: Map<number, Pick>;
  playerById: Map<string, Player>;
  myTeamId?: string | null;
  onCellClick?: (overall: number, existing: Pick | null) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex flex-col items-center justify-center border-b border-r border-line bg-base py-2">
        <span className="font-display text-lg leading-none text-muted">{round}</span>
        <span className="font-mono text-[10px] leading-none text-dim" aria-hidden>
          {round % 2 === 1 ? "→" : "←"}
        </span>
      </div>

      {slots.map((slot) => {
        const overall = pickForCell(round, slot, league.team_count);
        const pick = byOverall.get(overall) ?? null;
        const player = pick ? playerById.get(pick.nfl_player_id) : null;
        const isCurrent = overall === league.current_pick;
        const team = teams.find((t) => t.draft_position === slot);
        const mine = team?.id === myTeamId;

        const Cell = onCellClick ? "button" : "div";

        return (
          <Cell
            key={slot}
            {...(onCellClick
              ? { type: "button" as const, onClick: () => onCellClick(overall, pick) }
              : {})}
            className={`${player ? posClass(player.position) : ""} ${
              player ? "pos-wash pos-rule" : ""
            } relative min-h-[3.75rem] border-b border-r border-line px-2 py-1.5 text-left
              ${isCurrent ? "bg-signal/15 ring-1 ring-inset ring-signal/60" : ""}
              ${!player && !isCurrent && mine ? "bg-signal/[0.04]" : ""}
              ${onCellClick ? "hover:bg-raised" : ""}`}
          >
            <span className="absolute right-1.5 top-1 font-mono text-[10px] text-dim">
              {overall}
            </span>
            {player ? (
              <>
                <span className="block truncate pr-6 text-[13px] font-semibold leading-tight text-ink">
                  {player.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider">
                  <span className="pos-text font-semibold">{player.position}</span>
                  <span className="text-dim"> · {player.nfl_team}</span>
                </span>
              </>
            ) : isCurrent ? (
              <span className="font-display text-xs uppercase tracking-[0.16em] text-signal pulse-clock">
                On the clock
              </span>
            ) : null}
          </Cell>
        );
      })}
    </>
  );
}
