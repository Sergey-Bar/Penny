/**
 * Duplicate scoring shared by preview and save. The old importer matched on amount + day only,
 * which hid real repeat purchases and missed the same charge described differently. This one is
 * one-to-one and scores evidence: identifier, description similarity, date distance, installments.
 */

export interface DedupeRow {
  accountId: number;
  date: string;
  description: string;
  /** Expense negative, income positive, refund positive. */
  signedAmount: number;
  identifier?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}

export interface StoredCandidate extends DedupeRow {
  id: number;
}

type MatchStatus = "new" | "duplicate" | "possibleDuplicate";

export interface MatchResult {
  status: MatchStatus;
  matchedId: number | null;
  score: number;
}

const STOP_WORDS = new Set([
  "של",
  "את",
  "על",
  "the",
  "and",
  "ltd",
  "בע",
  "ממ",
  "בעמ",
  "חברה",
  "company",
]);

function normalizeMatchText(description: string): string {
  return description
    .normalize("NFC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(description: string): Set<string> {
  return new Set(
    normalizeMatchText(description)
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

const day = (date: string): number => Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000;

/**
 * 0..150. Identical identifier dominates; a very different description on the same amount and
 * day is penalised so two unrelated coffees are not merged.
 */
export function scoreMatch(a: DedupeRow, b: DedupeRow): number {
  let score = 0;
  if (a.identifier && b.identifier && a.identifier.trim() === b.identifier.trim()) score += 100;
  const na = normalizeMatchText(a.description);
  const nb = normalizeMatchText(b.description);
  if (na && na === nb) score += 40;
  else {
    const j = jaccard(tokenize(a.description), tokenize(b.description));
    if (j >= 0.6) score += 30;
    else if (j === 0) score -= 50;
  }
  const distance = Math.abs(day(a.date) - day(b.date));
  if (distance === 0) score += 20;
  else if (distance === 1) score += 10;
  if (
    a.installmentNumber != null &&
    b.installmentNumber != null &&
    a.installmentNumber === b.installmentNumber &&
    a.installmentTotal === b.installmentTotal
  )
    score += 10;
  return score;
}

const sameAmount = (a: DedupeRow, b: DedupeRow) =>
  Math.round(Math.abs(a.signedAmount) * 100) === Math.round(Math.abs(b.signedAmount) * 100);

const sameDirection = (a: DedupeRow, b: DedupeRow) => a.signedAmount < 0 === b.signedAmount < 0;

export interface MatchOptions {
  duplicateScore?: number;
  possibleScore?: number;
}

/**
 * One-to-one greedy matching: the strongest pair wins, then the next, and a stored row is used at
 * most once so two real coffees both survive.
 */
export function matchStored(
  rows: readonly DedupeRow[],
  stored: readonly StoredCandidate[],
  options: MatchOptions = {},
): MatchResult[] {
  const duplicateScore = options.duplicateScore ?? 60;
  const possibleScore = options.possibleScore ?? 30;
  const pool = new Map<number, { row: StoredCandidate; used: boolean }>(
    stored.map((row) => [row.id, { row, used: false }]),
  );
  // Index by account, amount and direction so a large statement does not compare every row
  // with every stored row. Date distance and description still decide within the bucket.
  const bucketKey = (row: DedupeRow) =>
    `${row.accountId}|${Math.round(Math.abs(row.signedAmount) * 100)}|${row.signedAmount < 0 ? "-" : "+"}`;
  const buckets = new Map<string, StoredCandidate[]>();
  for (const candidate of stored) {
    const key = bucketKey(candidate);
    const list = buckets.get(key);
    if (list) list.push(candidate);
    else buckets.set(key, [candidate]);
  }
  const pairs: { rowIndex: number; id: number; score: number; distance: number }[] = [];
  rows.forEach((row, rowIndex) => {
    for (const candidate of buckets.get(bucketKey(row)) ?? []) {
      const distance = Math.abs(day(row.date) - day(candidate.date));
      if (distance > 1) continue;
      const score = scoreMatch(row, candidate);
      if (score < possibleScore) continue;
      pairs.push({ rowIndex, id: candidate.id, score, distance });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.distance - b.distance || a.id - b.id);

  const out: MatchResult[] = rows.map(() => ({ status: "new", matchedId: null, score: 0 }));
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (out[pair.rowIndex].status !== "new" || taken.has(pair.id)) continue;
    const slot = pool.get(pair.id)!;
    if (slot.used) continue;
    slot.used = true;
    taken.add(pair.id);
    out[pair.rowIndex] = {
      status: pair.score >= duplicateScore ? "duplicate" : "possibleDuplicate",
      matchedId: pair.id,
      score: pair.score,
    };
  }
  return out;
}

/** Indices of rows that repeat an earlier row in the same file (both are kept). */
export function findRepeated(rows: readonly DedupeRow[]): boolean[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const key = `${row.accountId}|${row.date}|${normalizeMatchText(row.description)}|${Math.round(
      row.signedAmount * 100,
    )}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

/** Two rows in the file that are similar but not identical (amount and day), for a review chip. */
export function findPossibleRepeats(rows: readonly DedupeRow[]): boolean[] {
  return rows.map((row, index) => {
    for (let j = 0; j < index; j++) {
      const other = rows[j];
      if (other.accountId !== row.accountId) continue;
      if (!sameAmount(row, other) || !sameDirection(row, other)) continue;
      if (Math.abs(day(row.date) - day(other.date)) > 1) continue;
      if (scoreMatch(row, other) >= 30) return true;
    }
    return false;
  });
}
