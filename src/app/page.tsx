import Link from "next/link";

const ROUTES = [
  {
    href: "/pick",
    label: "Quick pick",
    who: "For whoever is in the room",
    detail: "Search a name, tap it, done. Undo is one tap away.",
  },
  {
    href: "/draft",
    label: "Draft board",
    who: "For everyone watching",
    detail: "Live board, rosters and available players. No refresh, no login.",
  },
  {
    href: "/admin",
    label: "Manage draft",
    who: "For the commissioner",
    detail: "Set up the league, fix a bad pick, pause and resume.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow">Draft Room</p>
      <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-[0.95] tracking-tight text-ink">
        One person taps.
        <br />
        <span className="text-signal">Everyone sees it.</span>
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        Built for a live draft table: the room records picks on a phone, and the
        board updates for anyone watching from anywhere.
      </p>

      <nav className="mt-10 divide-y divide-line border-y border-line">
        {ROUTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex items-center gap-4 py-5 transition-colors hover:bg-panel"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-2xl uppercase tracking-wide text-ink">
                {r.label}
              </span>
              <span className="mt-0.5 block text-eyebrow uppercase tracking-[0.16em] text-dim">
                {r.who}
              </span>
              <span className="mt-1.5 block text-sm text-muted">{r.detail}</span>
            </span>
            <span
              className="shrink-0 font-display text-2xl text-dim transition-colors group-hover:text-signal"
              aria-hidden
            >
              →
            </span>
          </Link>
        ))}
      </nav>

      <p className="mt-8 text-xs leading-relaxed text-dim">
        Add <code className="text-muted">?l=your-league</code> to any of these to
        skip straight to a league. Share the draft board link freely — it is
        read-only. Only the PIN unlocks editing.
      </p>
    </main>
  );
}
