import type { MapArea } from "./money-map";

type LotId = Exclude<MapArea, "netWorth"> | "budget" | "transactions";
export interface BoardLot {
  id: LotId;
  /** Grid cell on the 3×3 board; the centre (0,0) is left for the mark. */
  gx: number;
  gy: number;
}

// Clockwise from the near corner, so the everyday lots (this month, transactions, budget) face the viewer
// and long-term wealth sits along the far side.
const RING: [LotId, number, number][] = [
  ["cashflow", 1, 1],
  ["transactions", 0, 1],
  ["budget", -1, 1],
  ["cushion", -1, 0],
  ["investments", -1, -1],
  ["pension", 0, -1],
  ["property", 1, -1],
  ["debts", 1, 0],
];

/** The eight lots around the board. In a right-to-left layout the board is mirrored across its vertical axis. */
export function boardLots(rtl = false): BoardLot[] {
  return RING.map(([id, gx, gy]) => (rtl ? { id, gx: gy, gy: gx } : { id, gx, gy }));
}

/**
 * How much is built on a lot: one house per order of magnitude from ₪10,000, up to four (drawn as one tall building).
 * Anything positive gets at least one, so a small balance is still a built lot; zero or less is an empty one.
 */
export function houseCount(value: number): 0 | 1 | 2 | 3 | 4 {
  if (!(value > 0)) return 0;
  if (value < 10_000) return 1;
  if (value < 100_000) return 2;
  if (value < 1_000_000) return 3;
  return 4;
}
