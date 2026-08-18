"use client";

import { useMemo, useState } from "react";
import { searchPlayers, type IndexedPlayer } from "@/lib/search";
import { POSITIONS, type Position } from "@/lib/types";
import { posClass } from "./PositionTag";

type Sort = "rank" | "adp" | "position" | "name";

const SORTS: { id: Sort; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "adp", label: "ADP" },
  { id: "position", label: "Pos" },
  { id: "name", label: "Name" },
];

export function AvailablePlayers({ available }: { available: IndexedPlayer[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Position | "ALL">("ALL");
  const [sort, setSort] = useState<Sort>("rank");

  const rows = useMemo(() => {
    let list = searchPlayers(available, query, 500);
    if (filter !== "ALL") list = list.filter((p) => p.position === filter);
    const sorted = [...list];
    if (sort === "rank") sorted.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    if (sort === "adp") sorted.sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999));
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "position")
      sorted.sort(
        (a, b) =>
          POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
          (a.rank ?? 9999) - (b.rank ?? 9999)
      );
    return sorted.slice(0, 200);
  }, [available, query, filter, sort]);

  return (
    <section className="flex min-h-0 flex-col border border-line bg-panel">
      <div className="flex items-baseline justify-between border-b border-line px-3 py-2">
        <h2 className="eyebrow">Available</h2>
        <span className="font-mono text-[11px] text-dim">{available.length}</span>
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter available players"
          className="field text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {(["ALL", ...POSITIONS] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilter(p)}
              className={`${p === "ALL" ? "" : posClass(p)} border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                filter === p
                  ? "border-edge bg-raised text-ink"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              <span className={p === "ALL" ? "" : "pos-text"}>{p}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="eyebrow">Sort</span>
          <div className="flex gap-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={`border px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${
                  sort === s.id
                    ? "border-edge bg-raised text-ink"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="scroll-x min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {rows.map((p) => (
          <li
            key={p.id}
            className={`${posClass(p.position)} pos-rule flex items-center gap-2 px-3 py-2`}
          >
            <span className="w-8 shrink-0 font-mono text-[11px] text-dim">{p.rank ?? "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight">
                {p.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider">
                <span className="pos-text font-semibold">{p.pos_rank ?? p.position}</span>
                <span className="text-dim"> · {p.nfl_team}</span>
                {p.bye_week ? <span className="text-dim"> · BYE {p.bye_week}</span> : null}
              </span>
            </span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">
            Nobody left matching that.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
