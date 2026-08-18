import type { Position } from "@/lib/types";

/** The position class carries the colour token; everything else reads --pos. */
export const posClass = (p: string) => `pos-${p}`;

export function PositionTag({
  position,
  team,
  bye,
  className = "",
}: {
  position: Position | string;
  team?: string;
  bye?: number | null;
  className?: string;
}) {
  return (
    <span
      className={`${posClass(position)} inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${className}`}
    >
      <span className="pos-text font-semibold">{position}</span>
      {team ? <span className="text-dim">·</span> : null}
      {team ? <span className="text-muted">{team}</span> : null}
      {bye ? <span className="text-dim">· BYE {bye}</span> : null}
    </span>
  );
}
