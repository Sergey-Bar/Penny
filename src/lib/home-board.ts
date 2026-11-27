/** Home's tiles, in the order they are drawn. */
export const HOME_TILES = [
  "balance",
  "map",
  "savings",
  "budget",
  "latest",
  "cashFlow",
  "structure",
  "fire",
  "watchlist",
  "recurring",
  "attention",
  "goals",
  "credit",
  "members",
] as const;
export type HomeTileId = (typeof HOME_TILES)[number];

/**
 * What Home shows before anyone has chosen: the balance, the board, money on the table, the budget, the latest
 * transactions and cash flow. The rest are one tap away under "Customize" and each has its own screen.
 * Fewer things on the first screen is the point: every tile here answers a question people ask daily.
 */
export const HOME_HIDDEN_BY_DEFAULT: readonly HomeTileId[] = [
  "structure",
  "fire",
  "watchlist",
  "recurring",
  "attention",
  "goals",
  "credit",
  "members",
];

/** The hidden tiles to use: the saved list if there is one (unknown ids dropped), otherwise the default. */
export function hiddenHomeTiles(saved: unknown): HomeTileId[] {
  const raw = (saved as { hidden?: unknown } | null | undefined)?.hidden;
  if (!Array.isArray(raw)) return [...HOME_HIDDEN_BY_DEFAULT];
  return raw.filter((x): x is HomeTileId => (HOME_TILES as readonly unknown[]).includes(x));
}
