/**
 * Pure, deterministic description patterns. The same rules the sync engine used (bank/card
 * detection, transfers, loans, insurance, fees, recurring bills) live here so the importer can
 * classify a row before it is saved, without AI and without a network call.
 */

/** A Hebrew word needs an explicit boundary: \b only understands Latin word characters. */
const he = (words: string) => new RegExp(`(^|[^\\u05d0-\\u05ea])(?:${words})(?![\\u05d0-\\u05ea])`);

const CARD_BILL_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /ישראכרט/i,
  /ישרא[\s־-]?כארד/i,
  /כ[\s.\-־]?א[\s.\-־]?ל/i,
  /מקסימום/i,
  /מקס[\s־-]*איט/i,
  /(^|\s)מקס(\s|$)/,
  /לאומי[\s־-]*קארד/i,
  /אמקס/i,
  /מאסטרקארד/i,
  /אמריקן\s*אקספרס/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  /כרטיס\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /חיוב\s*לכרטיס/i,
  /\bISRACARD\b/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bCAL\b/i,
  /\bMAX\b/i,
  /\bDINERS\b/i,
  /\bAMEX\b/i,
  /\bAMERICAN\s+EXPRESS\b/i,
];

const LOAN_REPAYMENT = /(?:החזר|פירעון)\s*הלוואה|החזר\s*הלו|loan\s*repay|repayment/i;
const LOAN_ANY = /הלוואה|הלוואת|\bloan\b/i;

const REFUND_PATTERN = /זיכוי|החזר|ביטול|החזרת|refund|reversal|chargeback|\breturn(?:ed)?\b/i;

const TRANSFER_PATTERN =
  /העבר[הת]?\s*כספים|העברה|בין\s*חשבונות|ביט|פייבוקס|paybox|bit\b|transfer|internal\s*transfer/i;

const ATM_PATTERN = /כספומט|משיכת\s*מזומן|משיכה\s*מכספומט|\batm\b|cash\s*withdrawal/i;

const SALARY_PATTERN = /משכורת|שכר\s*עבודה|שכר\s*חודש|salary|payroll|wage/i;

const PENSION_PATTERN = /פנסיה|קצבת\s*פנסיה|pension/i;

const BENEFITS_PATTERN =
  /קצבת\s*ילדים|דמי\s*לידה|דמי\s*אבטלה|קצבת\s*זקנה|קצבת\s*נכות|מענק\s*עבודה|ביטוח\s*לאומי|גמלת|allowance|benefit/i;

const TAX_REFUND_PATTERN = /החזר\s*מס|החזרי\s*מס|tax\s*refund/i;

const SAVINGS_PATTERN =
  /קרן\s*השתלמות|קופת\s*גמל|קופת\s*פנסיה|פיקדון|חיסכון|savings|gemel|hishtalmut|deposit\s*plan/i;

const BROKER_PATTERN =
  /אקסלנס|מיטב|פסגות|אי\.?בי\.?אי|\bibi\b|אינטראקטיב|interactive|בלינק|blink|excellence|meitav|psagot|broker|קרנות\s*נאמנות|תיק\s*השקעות/i;

const INSURER_PATTERN =
  /הראל|מגדל|כלל\s*ביטוח|כלל\s*חברה|הפניקס|מנורה|איילון|ביטוח\s*ישיר|9\s*מיליון|ליברה|שלמה\s*ביטוח|הכשרה|שירביט|ווישור|\baig\b|harel|migdal|clal|phoenix|menora|ayalon|wesure|libra/i;

const POLICY_KINDS: readonly { key: string; re: RegExp }[] = [
  { key: "long_term_care", re: /סיעוד/i },
  { key: "disability", re: /אובדן\s*כושר|א\.כ\.ע/i },
  { key: "life", re: /חיים|ריסק|risk|life/i },
  { key: "car", re: /רכב|מקיף|חובה|car|auto/i },
  { key: "home", re: /דירה|מבנה|תכולה|משכנתא|home/i },
  { key: "travel", re: /נסיע|travel/i },
  { key: "health", re: /בריאות|health/i },
];

const BANK_FEE_PATTERN =
  /עמלת|עמלה|דמי\s*ניהול\s*חשבון|דמי\s*כרטיס|דמי\s*טיפול|commission|service\s*charge/i;
const OVERDRAFT_PATTERN = /ריבית\s*חובה|ריבית\s*על\s*יתרת\s*חובה|ריבית\s*בגין|ריבית\s*משיכת\s*יתר/i;
const FX_FEE_PATTERN = /עמלת\s*המרה|עמלת\s*מט"ח|עמלת\s*חו"ל|עסקה\s*בחו"ל|foreign\s*transaction/i;

export const RENT_PATTERN = /שכר\s*דירה|שכירות|rent\b/i;
export const MORTGAGE_PATTERN = /משכנתא|משכנתה|mortgage/i;

const UTILITY_PATTERNS: readonly { key: string; re: RegExp }[] = [
  { key: "arnona", re: /ארנונה|עירי[יה]ת|מועצה\s*מקומית|מועצה\s*אזורית/i },
  {
    key: "electricity",
    re: /חברת\s*החשמל|חשמל\s*לישראל|israel\s*electric|אלקטרה\s*פאוור|אמישראגז\s*חשמל/i,
  },
  {
    key: "water",
    re: he("מי אביבים|מי שבע|מי כרמל|מי רעננה|מי נתניה|הגיחון|תאגיד המים|מניב ראשון|מי עירון"),
  },
  { key: "gas", re: /סופרגז|פזגז|אמישראגז|דורגז|גז\s*יגל/i },
  { key: "building_committee", re: /ועד\s*בית|ועד\s*הבית/i },
  { key: "internet_tv", re: /בזק|הוט\b|\byes\b|סלקום\s*טי\s*וי|פרטנר\s*טי\s*וי|sting\s*tv/i },
  {
    key: "mobile_phone",
    re: /פרטנר|סלקום|פלאפון|גולן\s*טלקום|הוט\s*מובייל|we4g|019\s*מובייל|012\s*מובייל|xphone/i,
  },
  { key: "car_license", re: /טסט|רישוי|משרד\s*התחבורה|אגרת\s*רכב/i },
];

const STREAMING_PATTERN =
  /netflix|spotify|disney\+?|hbo|max\.com|youtube\s*premium|apple\s*tv|deezer|סטרימינג/i;
const SUBSCRIPTION_PATTERN =
  /icloud|google\s*one|google\s*storage|chatgpt|openai|microsoft\s*365|office\s*365|dropbox|adobe|canva|apple\.com\/bill|מנוי/i;

export function isCardBill(description: string): boolean {
  return CARD_BILL_PATTERNS.some((re) => re.test(description));
}

export function isLoanRepayment(description: string): boolean {
  return LOAN_REPAYMENT.test(description);
}

/** A loan landing in the account: borrowed money, never income. */
export function isLoanDeposit(description: string): boolean {
  return LOAN_ANY.test(description) && !isLoanRepayment(description);
}

export function isRefundLike(description: string): boolean {
  return REFUND_PATTERN.test(description);
}

export function isTransferLike(description: string): boolean {
  return TRANSFER_PATTERN.test(description);
}

function isCashWithdrawal(description: string): boolean {
  return ATM_PATTERN.test(description);
}

export function isSalaryLike(description: string): boolean {
  return SALARY_PATTERN.test(description);
}

export function isPensionLike(description: string): boolean {
  return PENSION_PATTERN.test(description);
}

export function isBenefitsLike(description: string): boolean {
  return BENEFITS_PATTERN.test(description);
}

export function isTaxRefund(description: string): boolean {
  return TAX_REFUND_PATTERN.test(description);
}

export function isSavingsLike(description: string): boolean {
  return SAVINGS_PATTERN.test(description);
}

export function isInvestmentLike(description: string): boolean {
  return BROKER_PATTERN.test(description);
}

export function insuranceCategoryKey(description: string): string | null {
  if (!INSURER_PATTERN.test(description) && !/ביטוח/i.test(description)) return null;
  const kind = POLICY_KINDS.find((p) => p.re.test(description))?.key;
  if (kind === "car") return "car_insurance";
  if (kind === "health" || kind === "disability" || kind === "long_term_care")
    return "health_insurance";
  if (kind === "life") return "life_insurance";
  // Home/travel policies share the general Insurance leaf.
  return "insurance";
}

export function feeCategoryKey(description: string): string | null {
  if (BANK_FEE_PATTERN.test(description)) return "bank_fees";
  if (OVERDRAFT_PATTERN.test(description) || FX_FEE_PATTERN.test(description)) return "interest";
  return null;
}

export function utilityCategoryKey(description: string): string | null {
  return UTILITY_PATTERNS.find((p) => p.re.test(description))?.key ?? null;
}

export function subscriptionCategoryKey(description: string): string | null {
  if (STREAMING_PATTERN.test(description)) return "streaming";
  if (SUBSCRIPTION_PATTERN.test(description)) return "subscriptions";
  return null;
}

/**
 * The category a specific pattern assigns, after the dictionary. Only unambiguous patterns are
 * listed; a generic "העברה" must stay for review instead of becoming a category.
 */
export function patternCategoryKey(description: string, kind: "expense" | "income"): string | null {
  const text = description.trim();
  if (!text) return null;
  if (kind === "income") {
    if (isSalaryLike(text)) return "salary";
    if (isTaxRefund(text)) return "tax_refunds";
    if (isPensionLike(text)) return "pension";
    if (isBenefitsLike(text)) return "benefits";
    if (isLoanDeposit(text)) return null;
    return null;
  }
  if (isCashWithdrawal(text)) return "cash_atm";
  if (isLoanRepayment(text)) return "loans";
  if (isSavingsLike(text)) return "savings";
  if (isInvestmentLike(text)) return "investments";
  const insurance = insuranceCategoryKey(text);
  if (insurance) return insurance;
  const fee = feeCategoryKey(text);
  if (fee) return fee;
  const utility = utilityCategoryKey(text);
  if (utility) return utility;
  if (RENT_PATTERN.test(text)) return "rent";
  if (MORTGAGE_PATTERN.test(text)) return "mortgage";
  const subscription = subscriptionCategoryKey(text);
  if (subscription) return subscription;
  return null;
}
