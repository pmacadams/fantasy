"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { buildIndex, type IndexedPlayer } from "./search";
import { slotForPick, roundForPick, roundPickForPick, totalPicks } from "./snake";
import type { FantasyTeam, League, Pick, Player } from "./types";

export type Connection = "connecting" | "live" | "offline";

export type DraftState = {
  league: League | null;
  teams: FantasyTeam[];
  players: Player[];
  picks: Pick[];
  loading: boolean;
  error: string | null;
  connection: Connection;
  refresh: () => Promise<void>;
  // derived
  index: IndexedPlayer[];
  playerById: Map<string, Player>;
  teamById: Map<string, FantasyTeam>;
  draftedIds: Set<string>;
  available: IndexedPlayer[];
  onTheClock: FantasyTeam | null;
  onDeck: FantasyTeam | null;
  round: number;
  roundPick: number;
  lastPick: Pick | null;
  total: number;
  rosters: Map<string, Pick[]>;
};

const EMPTY: FantasyTeam[] = [];

export function useDraft(slug: string | null): DraftState {
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<FantasyTeam[]>(EMPTY);
  const [players, setPlayers] = useState<Player[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const leagueIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (!slug) return;
      if (!isConfigured) {
        setError("Supabase is not configured. Add your keys to .env.local.");
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      try {
        const { data: lg, error: lgErr } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();
        if (lgErr) throw lgErr;
        if (!lg) {
          setError(`No league at "${slug}".`);
          setLeague(null);
          setLoading(false);
          return;
        }
        leagueIdRef.current = lg.id;

        const [teamsRes, picksRes, playersRes] = await Promise.all([
          supabase
            .from("fantasy_teams")
            .select("*")
            .eq("league_id", lg.id)
            .order("draft_position"),
          supabase
            .from("draft_picks")
            .select("*")
            .eq("league_id", lg.id)
            .order("overall_pick"),
          supabase
            .from("nfl_players")
            .select("*")
            .order("rank", { nullsFirst: false })
            .limit(2000),
        ]);
        if (teamsRes.error) throw teamsRes.error;
        if (picksRes.error) throw picksRes.error;
        if (playersRes.error) throw playersRes.error;

        setLeague(lg as League);
        setTeams((teamsRes.data ?? []) as FantasyTeam[]);
        setPicks((picksRes.data ?? []) as Pick[]);
        setPlayers((playersRes.data ?? []) as Player[]);
        setError(null);
      } catch (err) {
        setError((err as { message?: string })?.message ?? "Could not load the draft.");
      } finally {
        setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  // Realtime: picks and league state. Everything else is static during a draft.
  useEffect(() => {
    if (!slug || !league?.id || !isConfigured) return;
    const id = league.id;

    const channel = supabase
      .channel(`draft:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_picks", filter: `league_id=eq.${id}` },
        (payload) => {
          setPicks((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Pick;
              if (prev.some((p) => p.id === row.id)) return prev;
              return [...prev, row].sort((a, b) => a.overall_pick - b.overall_pick);
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as { id: string };
              return prev.filter((p) => p.id !== row.id);
            }
            const row = payload.new as Pick;
            return prev
              .map((p) => (p.id === row.id ? row : p))
              .sort((a, b) => a.overall_pick - b.overall_pick);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leagues", filter: `id=eq.${id}` },
        (payload) => setLeague(payload.new as League)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fantasy_teams", filter: `league_id=eq.${id}` },
        () => {
          void supabase
            .from("fantasy_teams")
            .select("*")
            .eq("league_id", id)
            .order("draft_position")
            .then(({ data }) => data && setTeams(data as FantasyTeam[]));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("offline");
        else setConnection("connecting");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [slug, league?.id]);

  // Safety net. Realtime sockets die quietly on hotel and bar Wi-Fi; a cheap
  // poll means the board is never more than 12 seconds stale, and it silently
  // repairs any event that was missed while the socket was down.
  useEffect(() => {
    if (!slug) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(false);
    };
    const timer = setInterval(tick, 12000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [slug, load]);

  const refresh = useCallback(() => load(false), [load]);

  // ------------------------------------------------------------- derived --
  const index = useMemo(() => buildIndex(players), [players]);
  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const draftedIds = useMemo(
    () => new Set(picks.map((p) => p.nfl_player_id)),
    [picks]
  );
  const available = useMemo(
    () => index.filter((p) => !draftedIds.has(p.id)),
    [index, draftedIds]
  );

  const teamCount = league?.team_count ?? teams.length ?? 0;
  const current = league?.current_pick ?? 1;
  const total = league ? totalPicks(league.rounds, league.team_count) : 0;
  const done = !league || current > total;

  const onTheClock = useMemo(() => {
    if (done || !teamCount) return null;
    const slot = slotForPick(current, teamCount);
    return teams.find((t) => t.draft_position === slot) ?? null;
  }, [teams, current, teamCount, done]);

  const onDeck = useMemo(() => {
    if (!teamCount || current + 1 > total) return null;
    const slot = slotForPick(current + 1, teamCount);
    return teams.find((t) => t.draft_position === slot) ?? null;
  }, [teams, current, teamCount, total]);

  const rosters = useMemo(() => {
    const map = new Map<string, Pick[]>();
    for (const t of teams) map.set(t.id, []);
    for (const p of picks) {
      const list = map.get(p.fantasy_team_id);
      if (list) list.push(p);
      else map.set(p.fantasy_team_id, [p]);
    }
    return map;
  }, [teams, picks]);

  const lastPick = picks.length ? picks[picks.length - 1] : null;

  return {
    league,
    teams,
    players,
    picks,
    loading,
    error,
    connection,
    refresh,
    index,
    playerById,
    teamById,
    draftedIds,
    available,
    onTheClock,
    onDeck,
    round: teamCount ? roundForPick(Math.min(current, total || current), teamCount) : 1,
    roundPick: teamCount ? roundPickForPick(Math.min(current, total || current), teamCount) : 1,
    lastPick,
    total,
    rosters,
  };
}

/** The commissioner PIN, remembered per browser so it is typed once a night. */
export function usePin(leagueSlug: string | null) {
  const storageKey = leagueSlug ? `draftroom:pin:${leagueSlug}` : null;
  const [pin, setPinState] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    setPinState(window.localStorage.getItem(storageKey) ?? "");
    setReady(true);
  }, [storageKey]);

  const setPin = useCallback(
    (value: string) => {
      setPinState(value);
      if (storageKey) window.localStorage.setItem(storageKey, value);
    },
    [storageKey]
  );

  const clearPin = useCallback(() => {
    setPinState("");
    if (storageKey) window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { pin, setPin, clearPin, ready };
}

/** Remembers which league and which fantasy team belong to this browser. */
export function useLocalPref(key: string, fallback = "") {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(window.localStorage.getItem(`draftroom:${key}`) ?? fallback);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      window.localStorage.setItem(`draftroom:${key}`, next);
    },
    [key]
  );

  return [value, update, ready] as const;
}
