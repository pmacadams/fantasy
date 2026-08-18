/**
 * Snake order, mirrored exactly from snake_position() in the database.
 * The server is the source of truth; this is only for showing what comes next.
 */

/** 1-based draft slot on the clock at a given overall pick. */
export function slotForPick(overall: number, teamCount: number): number {
  const indexInRound = (overall - 1) % teamCount;
  const round = Math.floor((overall - 1) / teamCount);
  return round % 2 === 0 ? indexInRound + 1 : teamCount - indexInRound;
}

export function roundForPick(overall: number, teamCount: number): number {
  return Math.floor((overall - 1) / teamCount) + 1;
}

export function roundPickForPick(overall: number, teamCount: number): number {
  return ((overall - 1) % teamCount) + 1;
}

/** Overall pick number for a board cell. Inverse of the above. */
export function pickForCell(round: number, slot: number, teamCount: number): number {
  const indexInRound = round % 2 === 1 ? slot - 1 : teamCount - slot;
  return (round - 1) * teamCount + indexInRound + 1;
}

export function totalPicks(rounds: number, teamCount: number): number {
  return rounds * teamCount;
}

/** How many picks until this slot is up again. Null once the draft is over. */
export function picksUntilSlot(
  slot: number,
  currentPick: number,
  teamCount: number,
  rounds: number
): number | null {
  const total = totalPicks(rounds, teamCount);
  for (let p = currentPick; p <= total; p++) {
    if (slotForPick(p, teamCount) === slot) return p - currentPick;
  }
  return null;
}
