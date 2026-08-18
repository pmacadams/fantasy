import type { Player } from "./types";

/**
 * The whole pool is a few hundred rows, so it is fetched once and searched in
 * memory. No round trip per keystroke, and it keeps working if the room's
 * Wi-Fi stutters mid-word.
 */

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.\-]/g, "");

export type IndexedPlayer = Player & {
  _full: string; // "jamarrchase"
  _parts: string[]; // ["jamarr", "chase"]
  _initials: string; // "jc"
};

export function buildIndex(players: Player[]): IndexedPlayer[] {
  return players.map((p) => {
    const parts = normalize(p.name).split(/\s+/).filter(Boolean);
    return {
      ...p,
      _full: parts.join(""),
      _parts: parts,
      _initials: parts.map((w) => w[0]).join(""),
    };
  });
}

/**
 * Match tiers, in units of "ranking places". A better tier is worth this many
 * spots in the rankings, which is what lets "chase" surface Ja'Marr Chase ahead
 * of Chase Brown: the surname match is one tier worse but sixty places better.
 * A name called out across a loud room is usually the famous one.
 */
const TIER = {
  firstName: 0,
  surname: 20,
  spansSpace: 40,
  initials: 60,
  nflTeam: 140,
  anywhere: 220,
} as const;

/**
 * Ranked prefix search. "jam" finds Ja'Marr Chase, "bij" finds Bijan Robinson,
 * "chase" finds him by surname, "jc" by initials, "cin" by NFL team.
 */
export function searchPlayers(
  index: IndexedPlayer[],
  query: string,
  limit = 40
): IndexedPlayer[] {
  const q = normalize(query).replace(/\s+/g, "");
  if (!q) return index.slice(0, limit);

  const scored: { p: IndexedPlayer; score: number }[] = [];

  for (const p of index) {
    let tier = -1;
    if (p._parts[0]?.startsWith(q)) tier = TIER.firstName;
    else if (p._parts.slice(1).some((w) => w.startsWith(q))) tier = TIER.surname;
    else if (p._full.startsWith(q)) tier = TIER.spansSpace;
    else if (p._initials === q) tier = TIER.initials;
    else if (normalize(p.nfl_team) === q) tier = TIER.nflTeam;
    else if (p._full.includes(q)) tier = TIER.anywhere;
    if (tier >= 0) scored.push({ p, score: tier + (p.rank ?? 999) });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.p);
}
