"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isConfigured, rpc, supabase } from "@/lib/supabase";
import { useLocalPref } from "@/lib/useDraft";
import type { League } from "@/lib/types";

/** Resolves which league this screen is pointed at: ?l=slug, then last used. */
export function useLeagueSlug() {
  const params = useSearchParams();
  const fromUrl = params.get("l");
  const [remembered, remember, ready] = useLocalPref("league");

  useEffect(() => {
    if (fromUrl && fromUrl !== remembered) remember(fromUrl);
  }, [fromUrl, remembered, remember]);

  return { slug: fromUrl ?? (ready ? remembered || null : null), ready: ready || !!fromUrl };
}

export function Loading({ label = "Loading draft…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="eyebrow pulse-clock">{label}</span>
    </div>
  );
}

export function NoticeScreen({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-3xl uppercase tracking-wide text-ink">{title}</h1>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <NoticeScreen title="Connect Supabase">
      <p>
        Add <code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
        <code className="text-ink">.env.local</code>, then restart the dev server.
        The README walks through it.
      </p>
    </NoticeScreen>
  );
}

/** Shown when no league is selected: lists what exists so you can pick one. */
export function LeaguePicker({ target }: { target: "pick" | "draft" | "admin" }) {
  const [leagues, setLeagues] = useState<League[] | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    void supabase
      .from("leagues")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setLeagues((data ?? []) as League[]));
  }, []);

  return (
    <NoticeScreen title="Choose a league">
      {leagues === null ? (
        <p>Loading…</p>
      ) : leagues.length === 0 ? (
        <p>
          No leagues yet.{" "}
          <Link href="/admin" className="text-signal underline">
            Set one up
          </Link>{" "}
          first.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                href={`/${target}?l=${l.slug}`}
                className="flex items-center justify-between px-1 py-3 hover:text-ink"
              >
                <span className="font-display text-lg uppercase text-ink">{l.name}</span>
                <span className="font-mono text-[11px] uppercase text-dim">{l.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </NoticeScreen>
  );
}

/**
 * PIN gate. Verified against the database so a typo is caught here rather than
 * on the first pick of the night.
 */
export function PinGate({
  leagueId,
  leagueName,
  pin,
  setPin,
  children,
}: {
  leagueId: string;
  leagueName: string;
  pin: string;
  setPin: (v: string) => void;
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pin) {
      setOk(false);
      return;
    }
    void rpc<boolean>("verify_pin", { p_league: leagueId, p_pin: pin }).then(
      (valid) => !cancelled && setOk(Boolean(valid)),
      () => !cancelled && setOk(false)
    );
    return () => {
      cancelled = true;
    };
  }, [pin, leagueId]);

  if (ok === null) return <Loading label="Checking PIN…" />;
  if (ok) return <>{children}</>;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const valid = await rpc<boolean>("verify_pin", {
        p_league: leagueId,
        p_pin: entry.trim(),
      });
      if (valid) setPin(entry.trim());
      else setMessage("That PIN doesn't match this league.");
    } catch {
      setMessage("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NoticeScreen title="Enter PIN">
      <p>
        Editing <span className="text-ink">{leagueName}</span> needs the commissioner
        PIN. It is stored on this device, so you only type it once.
      </p>
      <div className="flex gap-2 pt-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          inputMode="numeric"
          autoFocus
          placeholder="PIN"
          aria-label="Commissioner PIN"
          className="field h-12 flex-1 text-center font-mono text-xl tracking-[0.3em]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !entry.trim()}
          className="btn-primary h-12 px-5"
        >
          {busy ? "Checking" : "Unlock"}
        </button>
      </div>
      {message ? <p className="text-alert">{message}</p> : null}
    </NoticeScreen>
  );
}
