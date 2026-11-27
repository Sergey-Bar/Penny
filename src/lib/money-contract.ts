/**
 * Boundary-exact money helpers. Amounts are stored as REAL shekels, so every write is checked
 * here before it reaches SQLite: at most two decimals and a magnitude that still fits a safe
 * integer number of agorot.
 */
export const MAX_ABS_MINOR = 10_000_000_000;

export class MoneyContractError extends Error {
  constructor(
    message: string,
    readonly code: "bad_money" | "money_precision" | "money_magnitude",
  ) {
    super(message);
    this.name = "MoneyContractError";
  }
}

const AMOUNT_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parses a number or a plain decimal string into integer agorot. Throws MoneyContractError. */
export function parseMoneyToMinor(value: unknown): number {
  let text: string;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!AMOUNT_RE.test(trimmed)) throw new MoneyContractError("Invalid amount", "bad_money");
    text = trimmed;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    // JSON numbers can carry binary-float noise (0.1 + 0.2). Anything beyond a rounding
    // remainder of a cent is a real third decimal, and is rejected.
    const scaled = value * 100;
    const nearest = Math.round(scaled);
    if (Math.abs(scaled - nearest) > 1e-6)
      throw new MoneyContractError("Amount has more than two decimals", "money_precision");
    const minor = nearest;
    if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_ABS_MINOR)
      throw new MoneyContractError("Amount is too large", "money_magnitude");
    return minor === 0 ? 0 : minor;
  } else {
    throw new MoneyContractError("Invalid amount", "bad_money");
  }

  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  if (fraction.length > 2)
    throw new MoneyContractError("Amount has more than two decimals", "money_precision");
  const digits = `${whole || "0"}${fraction.padEnd(2, "0")}`;
  if (digits.length > 12) throw new MoneyContractError("Amount is too large", "money_magnitude");
  const minor = Number(digits);
  if (!Number.isSafeInteger(minor) || minor > MAX_ABS_MINOR)
    throw new MoneyContractError("Amount is too large", "money_magnitude");
  return negative && minor !== 0 ? -minor : minor;
}

export function minorToAmount(minor: number): number {
  if (!Number.isFinite(minor) || !Number.isInteger(minor))
    throw new MoneyContractError("Minor units must be an integer", "bad_money");
  if (Math.abs(minor) > MAX_ABS_MINOR)
    throw new MoneyContractError("Amount is too large", "money_magnitude");
  return minor / 100;
}

/** Returns the canonical amount in shekels, or throws when the value is not boundary-exact. */
export function assertCanonicalAmount(value: unknown): number {
  return minorToAmount(parseMoneyToMinor(value));
}
