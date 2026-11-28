/**
 * Merchant-key normalization. V1 is the frozen algorithm learned categories were written with;
 * V2 is the rollout algorithm: processor prefixes, legal suffixes, branch/store numbers, trailing
 * dates, Hebrew final forms, punctuation and a small alias table. Reads try V2 then V1.
 */
const MAQAF = /\u05BE/g;
// Nikud and cantillation marks, U+0591-U+05C7 except the maqaf (U+05BE), which is a hyphen.
const NIKUD = /[\u0591-\u05BD\u05BF-\u05C7]/g;
// Invisible direction marks that issuers sometimes embed around Hebrew names.
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

const BIDI_AND_NIKUD = (s: string): string =>
  s
    .normalize("NFC")
    .replace(BIDI_MARKS, "")
    .replace(MAQAF, "-")
    .replace(NIKUD, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const V1_TRAILING = [
  /[\s*\-_.#]+$/, // separators: "wolt*", "name -"
  /\s*(?:סניף|branch)\s*\d*$/i, // explicit branch: "סניף 123"
  /\s+[*\-_#]\s*\d+$/, // separated number: "AMZN Mktp - 4421" (but not "7-11")
  // Bare branch number: "שופרסל 123". Kept from the original rule so existing learned keys still match,
  // which means "Office 365" also becomes "office".
  /\s+\d+$/,
];

export function normalizeMerchantV1(description: string): string {
  let s = BIDI_AND_NIKUD(description);
  for (let previous = ""; previous !== s;) {
    previous = s;
    for (const pattern of V1_TRAILING) s = s.replace(pattern, "");
    s = s.trim();
  }
  return s;
}

// Payment processors and wallets prepended by card issuers: "PAYPAL *SPOTIFY", "SQ *COFFEE".
const PROCESSOR_PREFIXES = [
  /^(?:paypal|pp|sq|square|stripe|sumup|worldpay|adyen|checkout)\s*[*#-]\s*/i,
  /^(?:google|apple)\s+pay\s*[*#-]\s*/i,
];

const LEGAL_SUFFIXES = [
  /\s+(?:ltd|limited|llc|inc|corp|corporation|co|company|gmbh|bv|nv|sa|sarl|plc|pte)\b\.?$/i,
  /\s*בע\s*["״']?\s*מ\s*["״']?\.?$/,
];

const BRANCH_SUFFIXES = [
  /\s+(?:branch|store|shop|no|number|סניף|חנות|שלוחה|מס'?)\s*#?\s*\d+$/i,
  /\s*#\s*\d+$/,
  /\s+\d+$/,
];

const TRAILING_DATES = [
  /\s+\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/,
  /\s+\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?$/,
  /\s+(?:19|20)\d{6}$/,
  /\s+\d{8}$/,
];

const FINAL_FORMS: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

const ALIASES: [RegExp, string][] = [
  [/^(?:amzn|amazon)\s+(?:mktp|marketplace|market)\b.*$/, "amazon"],
  [/^apple\s*(?:com|\.com)?\s*(?:\/|\s)?bill\b.*$/, "apple"],
  [/^google\s*(?:play|\*)/, "google"],
  [/^netflix\s*(?:com|\.com)?$/, "netflix"],
  [/^spotify\s+(?:ab|com|\.com)$/, "spotify"],
  [/^wolt\s+(?:com|\.com)$/, "wolt"],
];

function stripRepeated(s: string, patterns: RegExp[]): string {
  let out = s;
  for (let previous = ""; previous !== out;) {
    previous = out;
    for (const pattern of patterns) out = out.replace(pattern, "");
    out = out.trim();
  }
  return out;
}

export function normalizeMerchantV2(description: string): string {
  let s = BIDI_AND_NIKUD(description);

  for (const prefix of PROCESSOR_PREFIXES) s = s.replace(prefix, "");
  s = s
    .replace(/["'`׳״.,:;!?()[\]{}\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = stripRepeated(s, [...TRAILING_DATES, ...BRANCH_SUFFIXES, ...LEGAL_SUFFIXES]);
  s = s.replace(/[\s*\-_.#]+$/, "").trim();

  // Hebrew final letters are positional; folding them lets "חנות" and "חנותך" compare.
  s = s.replace(/[ךםןףץ]/g, (ch) => FINAL_FORMS[ch]!);

  for (const [pattern, replacement] of ALIASES) {
    if (pattern.test(s)) {
      s = replacement;
      break;
    }
  }

  return s.replace(/\s+/g, " ").trim();
}

/** The key every write uses after the rollout. */
export function normalizeMerchant(description: string): string {
  return normalizeMerchantV2(description) || normalizeMerchantV1(description);
}
