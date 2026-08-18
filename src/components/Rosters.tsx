"use client";

import { useState } from "react";
import { POSITIONS, type FantasyTeam, type Pick, type Player } from "@/lib/types";
import { picksUntilSlot } from "@/lib/snake";
import { posClass } from "./PositionTag";

/** One team's roster, grouped by position so holes are obvious at a glance. */
export function RosterPanel({
  team,
  picks,
  playerById,
  currentPick,
  teamCount,
  rounds,
  title = "My team",
}: {
  team: FantasyTeam | null;
  picks: Pick[];
  playerById: Map<string, Player>;
  currentPick: number;
  teamCount: number;
  rounds: number;
  title?: string;
}) {
  if (!team) {
    return (
      <section className="border border-line bg-panel p-4">
        <h2 className="eyebrow mb-2">{title}</h2>
        <p className="text-sm text-muted">
          Pick your team from the menu above and your roster stays pinned here.
        </p>
      </section>
    );
  }

  const away = picksUntilSlot(team.draft_position, currentPick, teamCount, rounds);
  const counts = POSITIONS.map((pos) => ({
    pos,
    n: picks.filter((p) => playerById.get(p.nfl_player_id)?.position === pos).length,
  }));

  return (
    <section className="flex min-h-0 flex-col border border-line bg-panel">
      <div className="border-b border-line px-3 py-2">
        <h2 className="eyebrow">{title}</h2>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-xl uppercase text-ink">{team.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-dim">
            {away === null ? "Done" : away === 0 ? "ON THE CLOCK" : `${away} away`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
        {counts.map(({ pos, n }) => (
          <span
            key={pos}
            className={`${posClass(pos)} border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider`}
          >
            <span className="pos-text font-semibold">{pos}</span>
            <span className={n ? "text-ink" : "text-dim"}> {n}</span>
          </span>
        ))}
      </div>

      <ul className="scroll-x min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {picks.map((pick) => {
          const player = playerById.get(pick.nfl_player_id);
          if (!player) return null;
          return (
            <li
              key={pick.id}
              className={`${posClass(player.position)} pos-rule flex items-center gap-2 px-3 py-2`}
            >
              <span className="w-10 shrink-0 font-mono text-[11px] text-dim">
                R{pick.round}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {player.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  <span className="pos-text font-semibold">{player.position}</span>
                  <span className="text-dim"> · {player.nfl_team}</span>
                  {player.bye_week ? (
                    <span className="text-dim"> · BYE {player.bye_week}</span>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
        {picks.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted">No picks yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** Every pick in order, newest first, filterable by team. */
export function PickHistory({
  picks,
  teams,
  playerById,
}: {
  picks: Pick[];
  teams: FantasyTeam[];
  playerById: Map<string, Player>;
}) {
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rows = [...picks]
    .reverse()
    .filter((p) => teamFilter === "ALL" || p.fantasy_team_id === teamFilter);

  return (
    <section className="flex min-h-0 flex-col border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="eyebrow">Pick history</h2>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          aria-label="Filter history by team"
          className="border border-line bg-raised px-2 py-1 font-mono text-[11px] text-muted"
        >
          <option value="ALL">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <ol className="scroll-x min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {rows.map((pick) => {
          const player = playerById.get(pick.nfl_player_id);
          return (
            <li
              key={pick.id}
              className={`${player ? posClass(player.position) : ""} flex items-baseline gap-3 px-3 py-2`}
            >
              <span className="w-8 shrink-0 font-mono text-[11px] text-dim">
                {pick.overall_pick}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {player?.name ?? pick.nfl_player_id}
                </span>
                <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted">
                  {teamById.get(pick.fantasy_team_id)?.name ?? "—"}
                  {player ? (
                    <>
                      <span className="text-dim"> · </span>
                      <span className="pos-text font-semibold">{player.position}</span>
                      <span className="text-dim"> {player.nfl_team}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted">Nothing here yet.</li>
        ) : null}
      </ol>
    </section>
  );
}
