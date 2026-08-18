/**
 * Parsing for pasted ranking exports. Kept out of the page file so it can be
 * tested on its own, and because Next pages may only export a component.
 */

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['\u2019.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Header names real ranking exports actually use. */
const ALIASES: Record<string, string[]> = {
  name: ["name", "player", "player name", "playername", "full name"],
  position: ["position", "pos"],
  nfl_team: ["nfl_team", "team", "tm", "nfl team"],
  bye_week: ["bye_week", "bye", "bye week", "byeweek"],
  rank: ["rank", "rk", "overall", "ovr", "overall rank"],
  adp: ["adp", "avg", "average", "avg pick"],
  pos_rank: ["pos_rank", "position rank", "posrank", "pos rank"],
};

/** Codes that vary by source. Left side is what shows up, right is ours. */
const TEAM_FIXES: Record<string, string> = {
  JAC: "JAX", WSH: "WAS", WFT: "WAS", LA: "LAR", STL: "LAR", SD: "LAC",
  OAK: "LV", LVR: "LV", ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU",
  NWE: "NE", NOR: "NO", TAM: "TB", SFO: "SF", KAN: "KC", GNB: "GB",
  NEP: "NE", TBB: "TB", SFO49: "SF",
};

const POSITIONS_OK = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);

function normalizePosition(raw: string): string | null {
  // "RB1" -> RB, "D/ST" -> DST, "PK" -> K, "DEF" -> DST
  const letters = (raw || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (letters === "DEF" || letters === "DST" || letters === "D") return "DST";
  if (letters === "PK") return "K";
  if (letters === "FB") return "RB";
  const base = letters.slice(0, letters.startsWith("DST") ? 3 : 2);
  if (POSITIONS_OK.has(letters)) return letters;
  if (POSITIONS_OK.has(base)) return base;
  if (POSITIONS_OK.has(letters.slice(0, 1))) return letters.slice(0, 1);
  return null;
}

/** Splits a line on tabs or commas, respecting quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

export type ParseResult = {
  rows: Record<string, string | number | null>[];
  skipped: number;
  problem: string | null;
};

/**
 * Accepts a pasted ranking export — comma or tab separated, so copying cells
 * straight out of a spreadsheet works with no file handling at all.
 */
export function parsePlayerPaste(text: string): ParseResult {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, problem: null };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase());

  const find = (field: string) => {
    for (const alias of ALIASES[field]) {
      const i = header.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iName = find("name");
  const iPos = find("position");
  const iTeam = find("nfl_team");
  if (iName < 0)
    return { rows: [], skipped: 0, problem: "No column called name or player." };
  if (iPos < 0) return { rows: [], skipped: 0, problem: "No column called position or pos." };
  if (iTeam < 0) return { rows: [], skipped: 0, problem: "No column called team." };

  const iBye = find("bye_week");
  const iRank = find("rank");
  const iAdp = find("adp");
  const iPosRank = find("pos_rank");

  const rows: ParseResult["rows"] = [];
  const seen = new Set<string>();
  let skipped = 0;

  lines.slice(1).forEach((line, n) => {
    const cells = splitLine(line, delimiter);
    const name = cells[iName];
    const position = normalizePosition(cells[iPos] ?? "");
    const teamRaw = (cells[iTeam] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const nfl_team = TEAM_FIXES[teamRaw] ?? teamRaw;

    // Free agents and anyone whose position we can't read get dropped rather
    // than failing the whole import.
    if (!name || !position || !nfl_team || nfl_team.length > 3) {
      skipped++;
      return;
    }

    const id = position === "DST" ? `dst-${nfl_team.toLowerCase()}` : slugify(name);
    if (seen.has(id)) {
      skipped++;
      return;
    }
    seen.add(id);

    const num = (i: number) => {
      if (i < 0) return null;
      const v = parseFloat((cells[i] ?? "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(v) ? v : null;
    };

    rows.push({
      id,
      name,
      position,
      nfl_team,
      bye_week: num(iBye),
      rank: num(iRank) ?? n + 1,
      adp: num(iAdp),
      pos_rank: iPosRank >= 0 ? (cells[iPosRank] || null) : null,
    });
  });

  return { rows, skipped, problem: null };
}
