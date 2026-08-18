"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { PlayerSearch } from "@/components/PlayerSearch";
import { Scoreboard } from "@/components/Scoreboard";
import {
  LeaguePicker,
  Loading,
  NoticeScreen,
  NotConfigured,
  PinGate,
  useLeagueSlug,
} from "@/components/Gates";
import { isConfigured, readableError, rpc, withRetry } from "@/lib/supabase";
import { useDraft, usePin } from "@/lib/useDraft";
import type { IndexedPlayer } from "@/lib/search";

type Flash = { tone: "confirm" | "alert"; text: string } | null;

export default function PickPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PickScreen />
    </Suspense>
  );
}

function PickScreen() {
  const { slug, ready } = useLeagueSlug();
  const draft = useDraft(slug);
  const { pin, setPin } = usePin(slug);

  if (!isConfigured) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!slug) return <LeaguePicker target="pick" />;
  if (draft.loading) return <Loading />;
  if (!draft.league)
    return (
      <NoticeScreen title="League not found">
        <p>{draft.error ?? "Nothing at that link."}</p>
        <LeaguePicker target="pick" />
      </NoticeScreen>
    );

  return (
    <PinGate
      leagueId={draft.league.id}
      leagueName={draft.league.name}
      pin={pin}
      setPin={setPin}
    >
      <PickRoom draft={draft} pin={pin} slug={slug} />
    </PinGate>
  );
}

function PickRoom({
  draft,
  pin,
  slug,
}: {
  draft: ReturnType<typeof useDraft>;
  pin: string;
  slug: string;
}) {
  const { league, teams, onTheClock, onDeck, connection, lastPick, playerById, teamById } =
    draft;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [busyUndo, setBusyUndo] = useState(false);
  const inFlight = useRef(false);
  // Players we have committed but not yet seen echoed back. Keeps a name from
  // reappearing in the list during the round trip.
  const [optimistic, setOptimistic] = useState<Set<string>>(new Set());

  const available = useMemo(
    () => draft.available.filter((p) => !optimistic.has(p.id)),
    [draft.available, optimistic]
  );

  const showFlash = useCallback((next: Flash) => {
    setFlash(next);
    window.setTimeout(() => setFlash(null), 4500);
  }, []);

  const commit = useCallback(
    async (player: IndexedPlayer) => {
      if (inFlight.current || !league) return; // second tap lands here and stops
      inFlight.current = true;
      setPendingId(player.id);
      const teamName = onTheClock?.name ?? "the clock";
      setOptimistic((s) => new Set(s).add(player.id));

      try {
        await withRetry(() =>
          rpc("make_pick", { p_league: league.id, p_player: player.id, p_pin: pin })
        );
        showFlash({ tone: "confirm", text: `${player.name} drafted by ${teamName}` });
        if (navigator.vibrate) navigator.vibrate(15);
      } catch (err) {
        setOptimistic((s) => {
          const next = new Set(s);
          next.delete(player.id);
          return next;
        });
        showFlash({ tone: "alert", text: readableError(err) });
      } finally {
        inFlight.current = false;
        setPendingId(null);
        await draft.refresh();
      }
    },
    [league, onTheClock, pin, showFlash, draft]
  );

  const undo = useCallback(async () => {
    if (!league || !lastPick || busyUndo) return;
    setBusyUndo(true);
    const name = playerById.get(lastPick.nfl_player_id)?.name ?? "That pick";
    try {
      await withRetry(() => rpc("undo_last_pick", { p_league: league.id, p_pin: pin }));
      setOptimistic(new Set());
      showFlash({ tone: "alert", text: `${name} is back on the board` });
    } catch (err) {
      showFlash({ tone: "alert", text: readableError(err) });
    } finally {
      setBusyUndo(false);
      await draft.refresh();
    }
  }, [league, lastPick, busyUndo, playerById, pin, showFlash, draft]);

  const start = useCallback(async () => {
    if (!league) return;
    try {
      await rpc("set_status", { p_league: league.id, p_status: "live", p_pin: pin });
      await draft.refresh();
    } catch (err) {
      showFlash({ tone: "alert", text: readableError(err) });
    }
  }, [league, pin, draft, showFlash]);

  if (!league) return null;

  const lastPlayer = lastPick ? playerById.get(lastPick.nfl_player_id) : null;
  const lastTeam = lastPick ? teamById.get(lastPick.fantasy_team_id) : null;
  const closed = league.status !== "live";

  return (
    <main className="flex h-dvh flex-col bg-base">
      <Scoreboard
        league={league}
        teams={teams}
        onTheClock={onTheClock}
        onDeck={onDeck}
        connection={connection}
        compact
      />

      {flash ? (
        <div
          role="status"
          className={`flash-in shrink-0 border-b px-4 py-3 text-sm font-semibold ${
            flash.tone === "confirm"
              ? "border-confirm/40 bg-confirm/10 text-confirm"
              : "border-alert/40 bg-alert/10 text-alert"
          }`}
        >
          {flash.tone === "confirm" ? "✓ " : "↺ "}
          {flash.text}
        </div>
      ) : null}

      {closed ? (
        <div className="shrink-0 border-b border-line bg-panel px-4 py-4">
          <p className="text-sm text-muted">
            {league.status === "setup"
              ? "The draft hasn't started yet."
              : league.status === "paused"
                ? "The draft is paused. Picks are closed until it resumes."
                : "The draft is finished. Every pick is saved."}
          </p>
          {league.status !== "complete" ? (
            <button type="button" onClick={() => void start()} className="btn-primary mt-3 h-11 px-5">
              {league.status === "setup" ? "Start draft" : "Resume draft"}
            </button>
          ) : null}
        </div>
      ) : (
        <PlayerSearch
          available={available}
          onSelect={(p) => void commit(p)}
          pendingId={pendingId}
          disabled={closed}
          autoFocus={false}
        />
      )}

      {/* Last pick + undo, pinned so it never scrolls away */}
      <div className="shrink-0 border-t border-line bg-panel px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <span className="eyebrow">Last pick</span>
            {lastPick && lastPlayer ? (
              <>
                <div className="mt-0.5 truncate text-base font-semibold leading-tight text-ink">
                  <span className="font-mono text-xs text-dim">{lastPick.overall_pick}</span>{" "}
                  {lastPlayer.name}
                </div>
                <div className="truncate font-mono text-[11px] uppercase tracking-wider text-muted">
                  {lastTeam?.name ?? "—"}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-sm text-dim">Nothing drafted yet</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!lastPick || busyUndo}
            className="btn-danger h-14 shrink-0 px-5 text-sm"
          >
            {busyUndo ? "Undoing…" : "Undo last pick"}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
          <Link href={`/draft?l=${slug}`} className="hover:text-muted">
            Draft board
          </Link>
          <span>
            {draft.picks.length} of {draft.total} picks in
          </span>
          <Link href={`/admin?l=${slug}`} className="hover:text-muted">
            Manage
          </Link>
        </div>
      </div>
    </main>
  );
}
