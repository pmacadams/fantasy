"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DraftBoard } from "@/components/DraftBoard";
import { PlayerSearch } from "@/components/PlayerSearch";
import {
  LeaguePicker,
  Loading,
  NoticeScreen,
  NotConfigured,
  PinGate,
  useLeagueSlug,
} from "@/components/Gates";
import { isConfigured, readableError, rpc } from "@/lib/supabase";
import { useDraft, useLocalPref, usePin } from "@/lib/useDraft";
import { parsePlayerPaste } from "@/lib/importPlayers";
import { roundForPick } from "@/lib/snake";
import type { DraftStatus, League, Pick } from "@/lib/types";

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminScreen />
    </Suspense>
  );
}

function AdminScreen() {
  const { slug, ready } = useLeagueSlug();
  const draft = useDraft(slug);
  const { pin, setPin, clearPin } = usePin(slug);
  const [, setLeaguePref] = useLocalPref("league");

  if (!isConfigured) return <NotConfigured />;
  if (!ready) return <Loading />;
  if (!slug) return <CreateLeague onCreated={setLeaguePref} />;
  if (draft.loading) return <Loading />;
  if (!draft.league)
    return (
      <NoticeScreen title="League not found">
        <p>{draft.error ?? "Nothing at that link."}</p>
        <LeaguePicker target="admin" />
      </NoticeScreen>
    );

  return (
    <PinGate
      leagueId={draft.league.id}
      leagueName={draft.league.name}
      pin={pin}
      setPin={setPin}
    >
      <Manage draft={draft} pin={pin} slug={slug} onSignOut={clearPin} />
    </PinGate>
  );
}

/* ------------------------------------------------------------------ setup -- */

function CreateLeague({ onCreated }: { onCreated: (slug: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState(16);
  const [teamText, setTeamText] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamNames = teamText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const league = await rpc<League>("create_league", {
        p_name: name.trim(),
        p_rounds: rounds,
        p_team_names: teamNames,
        p_pin: pin.trim(),
      });
      window.localStorage.setItem(`draftroom:pin:${league.slug}`, pin.trim());
      onCreated(league.slug);
      router.push(`/admin?l=${league.slug}`);
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-14">
      <p className="eyebrow">Manage draft</p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-tight text-ink">
        Set up a league
      </h1>
      <p className="mt-2 text-sm text-muted">
        Names in draft order, one per line. Snake order is worked out from there —
        round 1 runs top to bottom, round 2 runs back up.
      </p>

      <div className="mt-8 space-y-5">
        <label className="block">
          <span className="eyebrow">League name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunday Money League"
            className="field mt-1.5 h-11"
          />
        </label>

        <label className="block">
          <span className="eyebrow">Teams, in draft order</span>
          <textarea
            value={teamText}
            onChange={(e) => setTeamText(e.target.value)}
            rows={12}
            placeholder={"The Boys\nTeam Smith\nTeam Johnson\n…"}
            className="field mt-1.5 font-mono text-sm leading-relaxed"
          />
          <span className="mt-1 block font-mono text-[11px] text-dim">
            {teamNames.length} teams · {teamNames.length * rounds} total picks
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="eyebrow">Rounds</span>
            <input
              type="number"
              min={1}
              max={30}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="field mt-1.5 h-11 font-mono"
            />
          </label>
          <label className="block">
            <span className="eyebrow">Commissioner PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              placeholder="4 digits is plenty"
              className="field mt-1.5 h-11 font-mono"
            />
          </label>
        </div>

        {error ? <p className="text-sm text-alert">{error}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || teamNames.length < 2 || !name.trim() || !pin.trim()}
          className="btn-primary h-12 w-full"
        >
          {busy ? "Creating…" : "Create league"}
        </button>
      </div>

      <div className="mt-10 border-t border-line pt-6">
        <LeaguePicker target="admin" />
      </div>
    </main>
  );
}

/* ----------------------------------------------------------------- manage -- */

const STATUSES: DraftStatus[] = ["setup", "live", "paused", "complete"];

function Manage({
  draft,
  pin,
  slug,
  onSignOut,
}: {
  draft: ReturnType<typeof useDraft>;
  pin: string;
  slug: string;
  onSignOut: () => void;
}) {
  const { league, teams, picks, playerById, available } = draft;
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ overall: number; existing: Pick | null } | null>(
    null
  );

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMessage(ok);
      await draft.refresh();
    } catch (err) {
      setMessage(readableError(err));
    }
  };

  if (!league) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="eyebrow">Manage draft</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">
            {league.name}
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-dim">
            {league.team_count} teams · {league.rounds} rounds · pick{" "}
            {Math.min(league.current_pick, draft.total)} of {draft.total}
          </p>
        </div>
        <div className="flex gap-3 font-mono text-[11px] uppercase tracking-wider">
          <Link href={`/pick?l=${slug}`} className="text-muted hover:text-ink">
            Quick pick
          </Link>
          <Link href={`/draft?l=${slug}`} className="text-muted hover:text-ink">
            Board
          </Link>
          <button type="button" onClick={onSignOut} className="text-dim hover:text-alert">
            Forget PIN
          </button>
        </div>
      </div>

      {message ? (
        <p className="flash-in mt-4 border border-line bg-panel px-3 py-2 text-sm text-muted">
          {message}
        </p>
      ) : null}

      {/* ----------------------------------------------------------- status */}
      <Section title="Draft status" note="Pausing closes the pick screen without losing anything.">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                void run(
                  () => rpc("set_status", { p_league: league.id, p_status: s, p_pin: pin }),
                  `Draft is now ${s}.`
                )
              }
              className={`btn h-10 px-4 text-xs ${
                league.status === s
                  ? "border-signal bg-signal/15 text-signal"
                  : "border-edge bg-raised text-muted hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ teams */}
      <Section
        title="Teams and draft order"
        note={
          picks.length
            ? "Reordering is locked once picks exist — renaming is always safe."
            : "Drag order is set by these arrows. Round 1 runs top to bottom."
        }
      >
        <ul className="divide-y divide-line border border-line">
          {teams.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-6 shrink-0 font-mono text-xs text-dim">
                {t.draft_position}
              </span>
              <input
                defaultValue={t.name}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== t.name)
                    void run(
                      () => rpc("rename_team", { p_team: t.id, p_name: value, p_pin: pin }),
                      `Renamed to ${value}.`
                    );
                }}
                className="field h-9 flex-1"
                aria-label={`Name for draft slot ${t.draft_position}`}
              />
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={i === 0 || picks.length > 0}
                  onClick={() => {
                    const ids = teams.map((x) => x.id);
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    void run(
                      () =>
                        rpc("reorder_teams", {
                          p_league: league.id,
                          p_team_ids: ids,
                          p_pin: pin,
                        }),
                      "Draft order updated."
                    );
                  }}
                  className="btn-ghost h-9 w-9 text-sm"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === teams.length - 1 || picks.length > 0}
                  onClick={() => {
                    const ids = teams.map((x) => x.id);
                    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                    void run(
                      () =>
                        rpc("reorder_teams", {
                          p_league: league.id,
                          p_team_ids: ids,
                          p_pin: pin,
                        }),
                      "Draft order updated."
                    );
                  }}
                  className="btn-ghost h-9 w-9 text-sm"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------------------ board */}
      <Section title="Fix a pick" note="Tap any square to assign, replace or clear it.">
        <DraftBoard
          league={league}
          teams={teams}
          picks={picks}
          playerById={playerById}
          onCellClick={(overall, existing) => setEditing({ overall, existing })}
        />
      </Section>

      {/* ------------------------------------------------------------ clock */}
      <Section
        title="Move the clock"
        note="Undo on the pick screen handles the usual case. This is for when the board and the room have drifted apart."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={draft.total + 1}
            defaultValue={league.current_pick}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (value && value !== league.current_pick)
                void run(
                  () =>
                    rpc("set_current_pick", {
                      p_league: league.id,
                      p_overall: value,
                      p_pin: pin,
                    }),
                  `Clock set to pick ${value}.`
                );
            }}
            className="field h-10 w-28 font-mono"
            aria-label="Current overall pick"
          />
          <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
            round {roundForPick(Math.min(league.current_pick, draft.total), league.team_count)}
          </span>
        </div>
      </Section>

      <PlayerImport leagueId={league.id} pin={pin} onDone={(m) => setMessage(m)} />

      {editing ? (
        <CellEditor
          overall={editing.overall}
          existing={editing.existing}
          available={available}
          playerById={playerById}
          onClose={() => setEditing(null)}
          onAssign={(playerId) =>
            void run(
              () =>
                rpc("set_pick", {
                  p_league: league.id,
                  p_overall: editing.overall,
                  p_player: playerId,
                  p_pin: pin,
                }),
              `Pick ${editing.overall} updated.`
            ).then(() => setEditing(null))
          }
          onClear={() =>
            void run(
              () =>
                rpc("remove_pick", {
                  p_league: league.id,
                  p_overall: editing.overall,
                  p_pin: pin,
                }),
              `Pick ${editing.overall} cleared.`
            ).then(() => setEditing(null))
          }
        />
      ) : null}
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl uppercase tracking-wide text-ink">{title}</h2>
      {note ? <p className="mb-3 mt-0.5 text-sm text-muted">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function CellEditor({
  overall,
  existing,
  available,
  playerById,
  onAssign,
  onClear,
  onClose,
}: {
  overall: number;
  existing: Pick | null;
  available: ReturnType<typeof useDraft>["available"];
  playerById: Map<string, { name: string }>;
  onAssign: (playerId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const current = existing ? playerById.get(existing.nfl_player_id)?.name : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-base/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit pick ${overall}`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <span className="eyebrow">Pick {overall}</span>
          <p className="text-sm text-muted">
            {current ? `Currently ${current}` : "Empty square"}
          </p>
        </div>
        <div className="flex gap-2">
          {existing ? (
            <button type="button" onClick={onClear} className="btn-danger h-10 px-4 text-xs">
              Clear
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="btn-ghost h-10 px-4 text-xs">
            Close
          </button>
        </div>
      </div>
      <PlayerSearch
        available={available}
        onSelect={(p) => onAssign(p.id)}
        pendingId={null}
        autoFocus
      />
    </div>
  );
}

/* --------------------------------------------------------- player import -- */

function PlayerImport({
  leagueId,
  pin,
  onDone,
}: {
  leagueId: string;
  pin: string;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const { rows, skipped, problem } = useMemo(() => parsePlayerPaste(text), [text]);

  const submit = async () => {
    setBusy(true);
    try {
      const n = await rpc<number>("import_players", {
        p_rows: rows,
        p_pin: pin,
        p_league: leagueId,
      });
      onDone(`${n} players imported.`);
      setText("");
    } catch (err) {
      onDone(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Player pool"
      note="Paste a ranking export — from a file or straight out of a spreadsheet. Anyone already drafted keeps his square."
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Player,Pos,Team,Bye,ADP\nJa'Marr Chase,WR1,CIN,6,1.2"}
        className="field font-mono text-xs leading-relaxed"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || rows.length === 0}
          className="btn-ghost h-10 px-4 text-xs"
        >
          {busy ? "Importing…" : `Import ${rows.length || ""} players`}
        </button>

        {problem ? (
          <span className="font-mono text-[11px] text-alert">{problem}</span>
        ) : rows.length ? (
          <span className="font-mono text-[11px] text-muted">
            {rows.length} ready
            {skipped ? ` · ${skipped} skipped (free agents or unreadable rows)` : ""}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-dim">
            Header row required. Needs name, position and team columns — bye, rank
            and adp are used if present.
          </span>
        )}
      </div>

      {rows.length ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border border-line bg-panel px-3 py-2 font-mono text-[11px] text-muted">
          {rows.slice(0, 6).map((r) => (
            <li key={String(r.id)}>
              {String(r.name)}{" "}
              <span className="text-dim">
                {String(r.position)} · {String(r.nfl_team)}
              </span>
            </li>
          ))}
          {rows.length > 6 ? <li className="text-dim">+{rows.length - 6} more</li> : null}
        </ul>
      ) : null}
    </Section>
  );
}
