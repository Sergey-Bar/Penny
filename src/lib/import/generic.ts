import { dictionaryCategoryKey } from "@/lib/merchant-dictionary";
import {
  feeCategoryKey,
  insuranceCategoryKey,
  isBenefitsLike,
  isCardBill,
  isLoanDeposit,
  isLoanRepayment,
  isPensionLike,
  isSalaryLike,
  isSavingsLike,
  isInvestmentLike,
  isTaxRefund,
  isTransferLike,
  RENT_PATTERN,
  MORTGAGE_PATTERN,
  subscriptionCategoryKey,
  utilityCategoryKey,
} from "@/lib/import/patterns";

/**
 * Descriptions that say only what kind of movement it was ("העברה", "משיכת מזומן"), never who
 * it was with. They must not be auto-categorized: the category would be a guess. The server
 * merges the household's own generic patterns from `generic_descriptions` into this list.
 */
const BUILTIN_GENERIC_PATTERNS: readonly string[] = [
  "העברה",
  "העברת כספים",
  "משיכת מזומן",
  "משיכה מכספומט",
  "כספומט",
  "חיוב",
  "זיכוי",
  "תשלום",
  "הפקדה",
  "שיק",
  "המחאה",
  "bit",
  "פייבוקס",
  "paybox",
  "transfer",
  "deposit",
  "withdrawal",
  "payment",
];

const BUILTIN_MATCHERS: readonly RegExp[] = [
  /(^|[^\u05d0-\u05ea])העבר(?:ה|ות|ת כספים)(?![א-ת])/,
  /משיכת מזומן|משיכה מכספומט/,
  /כספומט/,
  /(^|[^\u05d0-\u05ea])(?:חיוב|זיכוי|תשלום|הפקדה|שיק|המחאה)(?![א-ת])/,
  /\b(?:bit|paybox|transfer|deposit|withdrawal|payment)\b/i,
];

/** Lowercase, strip bidi marks and punctuation noise, collapse spaces. */
export function normalizeGenericText(description: string): string {
  return description
    .normalize("NFC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A brand, salary, card bill, loan, insurer or utility is specific and beats a generic word. */
function hasSpecificMatch(description: string): boolean {
  const text = description.trim();
  if (!text) return false;
  return (
    dictionaryCategoryKey(text, "expense") !== null ||
    dictionaryCategoryKey(text, "income") !== null ||
    isCardBill(text) ||
    isSalaryLike(text) ||
    isPensionLike(text) ||
    isTaxRefund(text) ||
    isBenefitsLike(text) ||
    isLoanDeposit(text) ||
    isLoanRepayment(text) ||
    isSavingsLike(text) ||
    isInvestmentLike(text) ||
    insuranceCategoryKey(text) !== null ||
    utilityCategoryKey(text) !== null ||
    feeCategoryKey(text) !== null ||
    subscriptionCategoryKey(text) !== null ||
    RENT_PATTERN.test(text) ||
    MORTGAGE_PATTERN.test(text)
  );
}

/**
 * True when the description is generic AND has no specific brand/pattern. A generic transfer is
 * still classified (expense or transfer) but never auto-categorized; it lands in review.
 */
export function isGeneric(description: string, userPatterns: readonly string[] = []): boolean {
  const text = normalizeGenericText(description);
  if (!text) return true;
  if (hasSpecificMatch(description)) return false;
  if (BUILTIN_MATCHERS.some((re) => re.test(text))) return true;
  return userPatterns.some((pattern) => {
    const clean = normalizeGenericText(pattern);
    return clean.length > 0 && text.includes(clean);
  });
}

/** Generic words plus the household's own; the UI lists both so a user pattern can be removed. */
export function genericPatterns(userPatterns: readonly string[] = []): string[] {
  return [...new Set([...BUILTIN_GENERIC_PATTERNS, ...userPatterns])];
}

/** "העברה" that is a transfer-shaped movement but has no known payer. */
export function isGenericTransfer(
  description: string,
  userPatterns: readonly string[] = [],
): boolean {
  return isGeneric(description, userPatterns) && isTransferLike(description);
}
