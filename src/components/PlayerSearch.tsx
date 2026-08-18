"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchPlayers, type IndexedPlayer } from "@/lib/search";
import { posClass } from "./PositionTag";

/**
 * Search box plus results. Tapping a row commits the pick — there is no
 * confirm step, because the undo button is the confirm step.
 */
export function PlayerSearch({
  available,
  onSelect,
  pendingId,
  disabled,
  autoFocus = false,
  limit = 25,
}: {
  available: IndexedPlayer[];
  onSelect: (player: IndexedPlayer) => void;
  pendingId: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  limit?: number;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchPlayers(available, query, limit),
    [available, query, limit]
  );

  // Clear the box as soon as a pick lands so the next name can be typed blind.
  const prevPending = useRef<string | null>(null);
  useEffect(() => {
    if (prevPending.current && !pendingId) setQuery("");
    prevPending.current = pendingId;
  }, [pendingId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-base px-4 pb-3 pt-3">
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0] && !disabled && !pendingId) {
                onSelect(results[0]);
              }
              if (e.key === "Escape") setQuery("");
            }}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="Search player…"
            aria-label="Search available players"
            disabled={disabled}
            className="h-14 w-full border border-edge bg-raised pl-4 pr-12 text-lg font-medium
                       text-ink placeholder:text-dim focus:border-signal disabled:opacity-50"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-0 top-0 flex h-14 w-12 items-center justify-center
                         font-display text-2xl text-dim hover:text-ink"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="scroll-x min-h-0 flex-1 overflow-y-auto px-4 pb-40">
        <div className="eyebrow flex items-baseline justify-between py-2">
          <span>{query ? "Matches" : "Best available"}</span>
          <span className="font-mono normal-case tracking-normal">
            {available.length} left
          </span>
        </div>

        {results.length === 0 ? (
          <p className="border border-dashed border-line px-4 py-8 text-center text-muted">
            No one left matching “{query}”. Check the spelling, or he may already
            be drafted.
          </p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {results.map((p) => {
              const isPending = pendingId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={disabled || Boolean(pendingId)}
                    onClick={() => onSelect(p)}
                    className={`${posClass(p.position)} pos-rule flex w-full items-center
                                gap-3 px-3 py-3.5 text-left transition-colors
                                active:bg-raised disabled:opacity-60
                                ${isPending ? "bg-signal/10" : "hover:bg-panel"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[19px] font-semibold leading-tight">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-wider">
                        <span className="pos-text font-semibold">{p.position}</span>
                        <span className="text-dim"> · </span>
                        <span className="text-muted">{p.nfl_team}</span>
                        {p.bye_week ? (
                          <span className="text-dim"> · BYE {p.bye_week}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-dim">
                      {isPending ? (
                        <span className="text-signal">SAVING…</span>
                      ) : (
                        p.pos_rank ?? ""
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
