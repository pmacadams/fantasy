"use client";

import type { Connection } from "@/lib/useDraft";
import type { DraftStatus, FantasyTeam, League } from "@/lib/types";
import { slotForPick } from "@/lib/snake";

const STATUS_COPY: Record<DraftStatus, { label: string; tone: string }> = {
  setup: { label: "Setup", tone: "text-muted border-edge" },
  live: { label: "Live", tone: "text-signal border-signal/50" },
  paused: { label: "Paused", tone: "text-alert border-alert/50" },
  complete: { label: "Complete", tone: "text-confirm border-confirm/50" },
};

export function ConnectionDot({ connection }: { connection: Connection }) {
  const map = {
    live: { color: "bg-confirm", label: "Synced" },
    connecting: { color: "bg-signal", label: "Connecting" },
    offline: { color: "bg-alert", label: "Reconnecting" },
  } as const;
  const s = map[connection];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted">
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.color} ${connection !== "live" ? "pulse-clock" : ""}`}
      />
      {s.label}
    </span>
  );
}

/**
 * The snake rail. One tick per draft slot for the round in progress, drawn in
 * the direction the round actually runs. It is the fastest way to answer "how
 * far away am I" without reading a single number.
 */
function SnakeRail({
  teams,
  teamCount,
  currentPick,
  round,
}: {
  teams: FantasyTeam[];
  teamCount: number;
  currentPick: number;
  round: number;
}) {
  const slots = Array.from({ length: teamCount }, (_, i) => i + 1);
  const order = round % 2 === 1 ? slots : [...slots].reverse();
  const activeSlot = slotForPick(currentPick, teamCount);
  const roundStart = (round - 1) * teamCount + 1;

  return (
    <div className="flex items-stretch gap-px overflow-hidden border-t border-line">
      {order.map((slot, i) => {
        const pickNo = roundStart + i;
        const done = pickNo < currentPick;
        const active = slot === activeSlot && !done;
        return (
          <div
            key={slot}
            title={teams.find((t) => t.draft_position === slot)?.name ?? `Slot ${slot}`}
            className={`h-1.5 flex-1 ${
              active ? "bg-signal" : done ? "bg-edge" : "bg-line/60"
            }`}
          />
        );
      })}
    </div>
  );
}

export function Scoreboard({
  league,
  teams,
  onTheClock,
  onDeck,
  connection,
  compact = false,
}: {
  league: League;
  teams: FantasyTeam[];
  onTheClock: FantasyTeam | null;
  onDeck: FantasyTeam | null;
  connection: Connection;
  compact?: boolean;
}) {
  const status = STATUS_COPY[league.status];
  const round = Math.min(
    Math.floor((league.current_pick - 1) / league.team_count) + 1,
    league.rounds
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-base/95 backdrop-blur-[2px]">
      <div className="flex items-center justify-between px-4 pt-2.5">
        <span className="eyebrow truncate">{league.name}</span>
        <div className="flex items-center gap-3">
          <span
            className={`border px-1.5 py-0.5 font-display text-eyebrow uppercase tracking-[0.18em] ${status.tone}`}
          >
            {status.label}
          </span>
          <ConnectionDot connection={connection} />
        </div>
      </div>

      <div className="flex items-end gap-4 px-4 pb-3 pt-1">
        {/* Round / pick, in scoreboard numerals */}
        <div className="shrink-0 leading-none">
          <div className="font-display text-[13px] uppercase tracking-[0.16em] text-dim">
            Round
          </div>
          <div className="font-display text-5xl font-semibold leading-[0.85] text-ink">
            {round}
          </div>
        </div>
        <div className="shrink-0 leading-none">
          <div className="font-display text-[13px] uppercase tracking-[0.16em] text-dim">
            Pick
          </div>
          <div className="font-display text-5xl font-semibold leading-[0.85] text-muted">
            {Math.min(league.current_pick, league.rounds * league.team_count)}
          </div>
        </div>

        <div className="h-10 w-px bg-line" />

        {/* Who we are waiting on */}
        <div className="min-w-0 flex-1 leading-none">
          <div className="font-display text-[13px] uppercase tracking-[0.16em] text-signal">
            {league.status === "paused" ? "Paused on" : "On the clock"}
          </div>
          <div
            className={`truncate font-display font-semibold uppercase text-ink ${
              compact ? "text-3xl" : "text-4xl"
            } leading-[0.9]`}
          >
            {onTheClock?.name ?? (league.status === "complete" ? "Draft complete" : "—")}
          </div>
        </div>

        {onDeck && !compact ? (
          <div className="hidden shrink-0 text-right leading-none sm:block">
            <div className="font-display text-[13px] uppercase tracking-[0.16em] text-dim">
              On deck
            </div>
            <div className="max-w-[14rem] truncate font-display text-xl uppercase text-muted">
              {onDeck.name}
            </div>
          </div>
        ) : null}
      </div>

      <SnakeRail
        teams={teams}
        teamCount={league.team_count}
        currentPick={league.current_pick}
        round={round}
      />
    </header>
  );
}
