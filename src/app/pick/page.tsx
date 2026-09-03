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
import { POSITIONS, type Position } from "@/lib/types";
import type { IndexedPlayer } from "@/lib/search";
import { posClass } from "@/components/PositionTag";

type Flash = { tone: "confirm" | "alert"; text: string } | null;

/**
 * Mirrors the slug rules in scripts/build-players.mjs and the admin importer,
 * so adding a player who is already in the pool updates his row rather than
 * creating a second copy of him.
 */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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
  const [addingName, setAddingName] = useState<string | null>(null);
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

  /**
   * The one path every pick goes through. `before` runs inside the same guarded
   * window — used to write a brand new player into the pool immediately before
   * drafting him, so a slow connection can't let a second tap slip in between.
   */
  const commitPlayer = useCallback(
    async (id: string, name: string, before?: () => Promise<unknown>) => {
      if (inFlight.current || !league) return; // second tap lands here and stops
      inFlight.current = true;
      setPendingId(id);
      const teamName = onTheClock?.name ?? "the clock";
      setOptimistic((s) => new Set(s).add(id));

      try {
        if (before) await withRetry(before);
        await withRetry(() =>
          rpc("make_pick", { p_league: league.id, p_player: id, p_pin: pin })
        );
        showFlash({ tone: "confirm", text: `${name} drafted by ${teamName}` });
        if (navigator.vibrate) navigator.vibrate(15);
      } catch (err) {
        setOptimistic((s) => {
          const next = new Set(s);
          next.delete(id);
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

  const commit = useCallback(
    (player: IndexedPlayer) => void commitPlayer(player.id, player.name),
    [commitPlayer]
  );

  const addAndDraft = useCallback(
    async (input: {
      name: string;
      position: Position;
      nfl_team: string;
      bye_week: string;
    }) => {
      if (!league) return;
      const name = input.name.trim();
      const id = slugify(name);
      setAddingName(null);

      if (!id) {
        showFlash({ tone: "alert", text: "That name needs some letters or numbers." });
        return;
      }

      // Already in the pool under this name — draft him rather than overwriting
      // a real row with hand-typed data. If he's gone, make_pick says so.
      const known = playerById.get(id);
      if (known) {
        await commitPlayer(id, known.name);
        return;
      }

      const row = {
        id,
        name,
        position: input.position,
        nfl_team: input.nfl_team.trim().toUpperCase() || "FA",
        bye_week: input.bye_week.trim() || null,
        rank: null,
        adp: null,
        pos_rank: null,
      };

      await commitPlayer(id, name, () =>
        rpc("import_players", { p_rows: [row], p_pin: pin, p_league: league.id })
      );
    },
    [league, playerById, pin, commitPlayer, showFlash]
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
          onSelect={commit}
          pendingId={pendingId}
          disabled={closed}
          autoFocus={false}
          onAddMissing={setAddingName}
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

      {addingName !== null ? (
        <AddPlayerSheet
          initialName={addingName}
          onCancel={() => setAddingName(null)}
          onConfirm={(input) => void addAndDraft(input)}
        />
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------ add player -- */

/**
 * Bottom sheet, because this happens on a phone held one-handed at a table.
 * Position is the only required field: it drives the board colour and the
 * roster counts, and it's the one thing nobody can infer later.
 */
function AddPlayerSheet({
  initialName,
  onCancel,
  onConfirm,
}: {
  initialName: string;
  onCancel: () => void;
  onConfirm: (input: {
    name: string;
    position: Position;
    nfl_team: string;
    bye_week: string;
  }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [position, setPosition] = useState<Position | null>(null);
  const [team, setTeam] = useState("");
  const [bye, setBye] = useState("");

  const ready = Boolean(name.trim()) && position !== null;

  const submit = () => {
    if (!ready || !position) return;
    onConfirm({ name, position, nfl_team: team, bye_week: bye });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-base/90"
      role="dialog"
      aria-modal="true"
      aria-label="Add a player to the pool"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="flex-1 cursor-default"
      />

      <div className="border-t border-edge bg-panel px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl uppercase tracking-wide text-ink">
            Add a player
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[11px] uppercase tracking-wider text-dim hover:text-ink"
          >
            Cancel
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          He goes into the pool and straight onto the board. Fix the details in
          Manage draft whenever you like.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="eyebrow">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              className="field mt-1.5 h-12 text-lg"
            />
          </label>

          <div>
            <span className="eyebrow">Position</span>
            <div className="mt-1.5 grid grid-cols-6 gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  aria-pressed={position === p}
                  className={`${posClass(p)} h-12 border font-mono text-xs uppercase tracking-wider transition-colors ${
                    position === p
                      ? "border-signal bg-signal/15"
                      : "border-line bg-raised hover:border-edge"
                  }`}
                >
                  <span className={position === p ? "text-signal" : "pos-text"}>{p}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow">NFL team</span>
              <input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="JAX"
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="field mt-1.5 h-12 font-mono uppercase"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Bye week</span>
              <input
                value={bye}
                onChange={(e) => setBye(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="optional"
                maxLength={2}
                className="field mt-1.5 h-12 font-mono"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="btn-primary h-14 w-full"
          >
            Add and draft him
          </button>
        </div>
      </div>
    </div>
  );
}
