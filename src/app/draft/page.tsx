"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { DraftBoard } from "@/components/DraftBoard";
import { AvailablePlayers } from "@/components/AvailablePlayers";
import { PickHistory, RosterPanel } from "@/components/Rosters";
import { Scoreboard } from "@/components/Scoreboard";
import {
  LeaguePicker,
  Loading,
  NoticeScreen,
  NotConfigured,
  useLeagueSlug,
} from "@/components/Gates";
import { isConfigured } from "@/lib/supabase";
import { useDraft, useLocalPref } from "@/lib/useDraft";

type Tab = "available" | "team" | "history";

export default function DraftPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DraftScreen />
    </Suspense>
  );
}

function DraftScreen() {
  const { slug, ready } = useLeagueSlug();
  const draft = useDraft(slug);
  const [myTeamId, setMyTeamId] = useLocalPref(`myteam:${slug ?? "none"}`);
  const [tab, setTab] = useState<Tab>("available");

  if (!isConfigured) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!slug) return <LeaguePicker target="draft" />;
  if (draft.loading) return <Loading />;

  const { league, teams, picks, playerById, available, rosters, teamById } = draft;
  if (!league)
    return (
      <NoticeScreen title="League not found">
        <p>{draft.error ?? "Nothing at that link."}</p>
        <LeaguePicker target="draft" />
      </NoticeScreen>
    );

  const myTeam = teams.find((t) => t.id === myTeamId) ?? null;
  const lastPick = draft.lastPick;
  const lastPlayer = lastPick ? playerById.get(lastPick.nfl_player_id) : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "available", label: "Available" },
    { id: "team", label: "My team" },
    { id: "history", label: "History" },
  ];

  return (
    <main className="flex min-h-dvh flex-col bg-base">
      <Scoreboard
        league={league}
        teams={teams}
        onTheClock={draft.onTheClock}
        onDeck={draft.onDeck}
        connection={draft.connection}
      />

      {/* Latest pick — the one line a remote watcher checks most often */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="eyebrow shrink-0">Last pick</span>
          {lastPick && lastPlayer ? (
            <span className="min-w-0 truncate">
              <span className="font-mono text-xs text-dim">{lastPick.overall_pick}</span>{" "}
              <span className="font-semibold text-ink">{lastPlayer.name}</span>{" "}
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {lastPlayer.position} · {lastPlayer.nfl_team} →{" "}
                {teamById.get(lastPick.fantasy_team_id)?.name}
              </span>
            </span>
          ) : (
            <span className="text-sm text-dim">None yet</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="myteam" className="eyebrow">
            My team
          </label>
          <select
            id="myteam"
            value={myTeamId}
            onChange={(e) => setMyTeamId(e.target.value)}
            className="border border-line bg-raised px-2 py-1 font-mono text-[11px] text-muted"
          >
            <option value="">Not set</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Link
            href={`/pick?l=${slug}`}
            className="font-mono text-[11px] uppercase tracking-wider text-dim hover:text-muted"
          >
            Quick pick
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="min-w-0">
          <h2 className="eyebrow mb-2">Draft board</h2>
          <DraftBoard
            league={league}
            teams={teams}
            picks={picks}
            playerById={playerById}
            myTeamId={myTeamId || null}
          />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-dim">
            Scroll sideways for the rest of the board · arrows show which way each
            round runs
          </p>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 lg:h-[calc(100dvh-13rem)] lg:sticky lg:top-40">
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 border px-2 py-2 font-display text-xs uppercase tracking-[0.14em] transition-colors ${
                  tab === t.id
                    ? "border-signal/50 bg-signal/10 text-signal"
                    : "border-line bg-panel text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {tab === "available" ? <AvailablePlayers available={available} /> : null}
            {tab === "team" ? (
              <RosterPanel
                team={myTeam}
                picks={myTeam ? (rosters.get(myTeam.id) ?? []) : []}
                playerById={playerById}
                currentPick={league.current_pick}
                teamCount={league.team_count}
                rounds={league.rounds}
              />
            ) : null}
            {tab === "history" ? (
              <PickHistory picks={picks} teams={teams} playerById={playerById} />
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
