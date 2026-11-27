/** Pure helpers for investment-house balances (no I/O), so they can be tested. */

/** Funds wired to scrapers (israeli-pension-scrapers + custom Altshuler, Phoenix and Excellence Trade). Ids match INVESTMENT_HOUSES. */
const PENSION_FUNDS = [
  "meitav",
  "altshuler",
  "phoenix",
  "excellence",
  "harel",
  "migdal",
  "clal",
  "menora",
] as const;
export type PensionFund = (typeof PENSION_FUNDS)[number];
export const isPensionFund = (id: string): id is PensionFund =>
  (PENSION_FUNDS as readonly string[]).includes(id);

/** Meitav and Menora open a visible browser window for the user to sign in (CAPTCHA); the others run headless. */
export const INTERACTIVE: Record<PensionFund, boolean> = {
  meitav: true,
  altshuler: false,
  phoenix: false,
  excellence: false,
  harel: false,
  migdal: false,
  clal: false,
  menora: true,
};
export type LoginField = "id" | "phone" | "username" | "password";
/** What a connection stores, encrypted: only the fields its fund asks for. */
export type PensionCredentials = Partial<Record<LoginField, string>>;
/** Which login fields each fund asks for. */
export const LOGIN_FIELDS: Record<PensionFund, LoginField[]> = {
  meitav: ["id", "phone"],
  altshuler: ["id", "phone"],
  phoenix: ["id", "phone"],
  excellence: ["username", "password"],
  harel: ["id", "phone"],
  migdal: ["id"],
  clal: ["id", "phone"],
  menora: ["id", "phone"],
};

export type SavingsType = "pension" | "study_fund" | "provident";

/** Maps a product label from the provider's portal to our asset type. */
export function savingsType(label: string): SavingsType {
  if (/השתלמות|hishtalmut|study/i.test(label)) return "study_fund";
  if (/גמל|provident|gemel/i.test(label)) return "provident";
  return "pension";
}

/** The marker kept in the asset's note so a re-sync updates the same asset instead of adding a new one. */
export const assetKey = (fundOrConnectionId: PensionFund | number, accountNumber: string) =>
  `pension:${fundOrConnectionId}:${accountNumber}`;
