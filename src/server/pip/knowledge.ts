import "server-only";

import type { PipLocale } from "@/lib/pip";

export const KNOWLEDGE_VERSION = 1;

export interface KnowledgeEntry {
  id: string;
  topic: string;
  audience: string;
  title: { he: string; en: string };
  body: { he: string; en: string };
  keywords: string[];
  source: string;
  reviewedAt: string;
  taxYear: number | null;
  href: string;
  calculator?: string;
}

const REVIEWED = "2026-11-01";

const KNOWLEDGE_SEED: KnowledgeEntry[] = [
  {
    id: "emergency-fund",
    topic: "saving",
    audience: "everyone",
    title: { he: "קרן חירום", en: "Emergency fund" },
    body: {
      he: "קרן חירום היא כסף נזיל לכיסוי הוצאות מחיה בעת אובדן הכנסה או הוצאה בלתי צפויה. רוב המשקיעים מחזיקים שלושה עד שישה חודשי הוצאות, ולעצמאים ולמשקי בית עם הכנסה לא יציבה טווח ארוך יותר.",
      en: "An emergency fund is liquid money that covers living costs after a lost income or an unexpected expense. Most households hold three to six months of expenses, and longer for self-employed or single-income households.",
    },
    keywords: ["emergency", "reserve", "runway", "חירום", "כרית", "רזרבה"],
    source: "Penny financial planning guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/calculators/emergency",
    calculator: "emergency_fund",
  },
  {
    id: "fifty-thirty-twenty",
    topic: "budgeting",
    audience: "everyone",
    title: { he: "כלל 50/30/20", en: "50/30/20 budget" },
    body: {
      he: "כלל 50/30/20 מחלק הכנסה נטו לחמישים אחוז צרכים, שלושים אחוז רצונות ועשרים אחוז חיסכון ופירעון חובות. הוא נקודת פתיחה, לא חוק: משקי בית עם שכר דירה או טיפול בילדים גבוהים יתחילו מחלוקה אחרת.",
      en: "The 50/30/20 rule splits net income into 50% needs, 30% wants and 20% saving or debt repayment. It is a starting point, not a law: households with high rent or care costs will start from a different split.",
    },
    keywords: ["budget", "50/30/20", "needs", "wants", "תקציב", "צרכים", "רצונות"],
    source: "Penny budgeting guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/budget",
  },
  {
    id: "pension-fees",
    topic: "pension",
    audience: "employees and self-employed",
    title: { he: "דמי ניהול בפנסיה", en: "Pension management fees" },
    body: {
      he: "דמי ניהול נגבים מההפקדה ומהצבירה, ולכן פער של עשירית אחוז מצטבר לסכום משמעותי לאורך שנים. בדקו את שני הרכיבים בדוח השנתי והשוו אותם לתעריפים המקובלים לשוק.",
      en: "Management fees are charged on deposits and on the accumulated balance, so a tenth of a percent compounds into a meaningful amount over decades. Check both parts in the annual report and compare them with common market rates.",
    },
    keywords: ["pension", "fee", "management", "pensia", "פנסיה", "דמי ניהול"],
    source: "Penny pension review",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/fees",
    calculator: "compound",
  },
  {
    id: "study-fund",
    topic: "pension",
    audience: "employees",
    title: { he: "קרן השתלמות", en: "Study fund" },
    body: {
      he: "קרן השתלמות היא אפיק חיסכון עם יתרון מס בתנאים מסוימים. תקרת ההפקדה הפטורה ממס תלויה בשכר ובשנת המס, ולכן יש לבדוק את התקרה המעודכנת לפני הגדלת ההפקדה.",
      en: "A study fund is a savings vehicle with a tax advantage under certain conditions. The tax-exempt deposit ceiling depends on salary and tax year, so check the current ceiling before increasing a deposit.",
    },
    keywords: ["study fund", "keren hishtalmut", "tax", "קרן השתלמות", "מס"],
    source: "Penny savings guide",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/learn",
  },
  {
    id: "mortgage-mix",
    topic: "mortgage",
    audience: "home buyers",
    title: { he: "תמהיל משכנתא", en: "Mortgage mix" },
    body: {
      he: "תמהיל משכנתא מפזר סיכון בין מסלול קבוע, משתנה וצמוד מדד. נתח קבוע גדול יותר מפחית אי ודאות בתשלום, ונתח צמוד מגדיל אותו כאשר המדד עולה.",
      en: "A mortgage mix spreads risk across fixed, variable and index-linked tracks. A larger fixed share reduces payment uncertainty, while an index-linked share increases the payment when the consumer price index rises.",
    },
    keywords: ["mortgage", "track", "prime", "משכנתא", "מסלול", "פריים"],
    source: "Penny mortgage guide",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/mortgage",
    calculator: "mortgage_payment",
  },
  {
    id: "purchase-tax",
    topic: "tax",
    audience: "home buyers",
    title: { he: "מס רכישה", en: "Purchase tax" },
    body: {
      he: "מס רכישה משולם בעת רכישת דירה, ושיעורו תלוי במדרגות, בסוג הרוכש ובמחיר. הזכאות למדרגות מופחתות תלויה בהיסטוריית הדירות וברצף הזכאות, ולכן יש לבדוק אותם לפני חתימה.",
      en: "Purchase tax is paid when buying a home, and the rate depends on brackets, buyer type and price. Eligibility for reduced brackets depends on prior home ownership and continuity, so verify it before signing.",
    },
    keywords: ["purchase tax", "mas rechisha", "buyer", "מס רכישה", "רוכש"],
    source: "Israel Tax Authority parameters",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/rentBuy",
  },
  {
    id: "income-tax-credits",
    topic: "tax",
    audience: "employees and self-employed",
    title: { he: "נקודות זיכוי", en: "Tax credit points" },
    body: {
      he: "נקודות זיכוי מפחיתות את המס המחושב. הן ניתנות לפי מצב אישי, ילדים, תושבות ותקופות מיוחדות, וכל נקודה שווה סכום חודשי קבוע לשנת המס.",
      en: "Tax credit points reduce calculated income tax. They depend on personal status, children, residency and special periods, and each point is worth a fixed monthly amount for the tax year.",
    },
    keywords: ["tax credits", "points", "income tax", "נקודות זיכוי", "מס הכנסה"],
    source: "Israel Tax Authority parameters",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/net",
    calculator: "gross_net",
  },
  {
    id: "self-employed-reserve",
    topic: "business",
    audience: "self-employed",
    title: { he: "רזרבה לעצמאי", en: "Self-employed reserve" },
    body: {
      he: "עצמאי צריך להפריד בין כספי העסק לכספי הבית, להחזיק רזרבה למס ולביטוח לאומי, ולשמור כרית לתקופות שבהן ההכנסות נמוכות. תזרים מזומנים ולא רווח חשבונאי הוא מה שקובע את היכולת לעמוד בהתחייבויות.",
      en: "A self-employed person should separate business and household money, hold a reserve for tax and national insurance, and keep a buffer for low-income months. Cash flow, not accounting profit, determines the ability to meet obligations.",
    },
    keywords: ["self-employed", "freelance", "reserve", "tax", "עצמאי", "פרילנס", "רזרבה"],
    source: "Penny business guide",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/business",
  },
  {
    id: "reservist-rights",
    topic: "rights",
    audience: "reservists",
    title: { he: "זכויות מילואים", en: "Reserve duty rights" },
    body: {
      he: "משרתי מילואים עשויים להיות זכאים לתגמול, להחזרי הוצאות, להטבות מס ולהגנות תעסוקה. הזכאות תלויה במשך השירות, בהכנסה ובמעמד, ולכן יש לשמור אישורים ולבדוק את התנאים העדכניים.",
      en: "Reservists may be entitled to compensation, expense reimbursements, tax benefits and employment protections. Eligibility depends on service length, income and status, so keep documents and check the current conditions.",
    },
    keywords: ["reserve", "miluim", "rights", "benefits", "מילואים", "זכויות", "תגמול"],
    source: "Israeli reserve duty guidance",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/life",
  },
  {
    id: "release-grant",
    topic: "rights",
    audience: "released soldiers",
    title: { he: "מענק שחרור", en: "Release grant" },
    body: {
      he: "מענק השחרור הוא סכום חד פעמי הניתן לחיילים משוחררים, ולעיתים ניתן להמירו לפיקדון או להשתמש בו למטרות מוגדרות. כדאי לתכנן את השימוש מראש ולשמור על מסגרת תקציבית לשנה הראשונה.",
      en: "The release grant is a one-time amount for released soldiers, sometimes convertible into a deposit or usable for defined purposes. Plan its use in advance and keep a budget for the first year.",
    },
    keywords: ["release", "grant", "soldier", "מענק שחרור", "חייל משוחרר"],
    source: "Israeli release grant guidance",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/life",
  },
  {
    id: "insurance-gap",
    topic: "insurance",
    audience: "families",
    title: { he: "פערי ביטוח", en: "Insurance gaps" },
    body: {
      he: "פער ביטוח הוא סיכון משמעותי שאינו מכוסה, כגון ביטוח חיים למפרנס או ביטוח דירה. לפני הוספת כיסוי, בדקו כפילויות, תקופת המתנה, החרגות והשתתפות עצמית.",
      en: "An insurance gap is a material risk that is not covered, such as life cover for a breadwinner or home insurance. Before adding cover, check duplicates, waiting periods, exclusions and deductibles.",
    },
    keywords: ["insurance", "coverage", "gap", "policy", "ביטוח", "כיסוי", "פער"],
    source: "Penny insurance review",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/insurance",
  },
  {
    id: "interest-cost",
    topic: "debt",
    audience: "borrowers",
    title: { he: "עלות הריבית", en: "The cost of interest" },
    body: {
      he: "הריבית היא מחיר הזמן של הכסף. פירעון מוקדם חוסך ריבית עתידית, אך כדאי להשוות אותו לתשואה חלופית ולוודא שאין קנס פירעון.",
      en: "Interest is the price of time. Early repayment saves future interest, but compare it with an alternative return and check whether an early-repayment penalty applies.",
    },
    keywords: ["interest", "debt", "loan", "ריבית", "חוב", "הלוואה"],
    source: "Penny debt guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/loans",
    calculator: "loan_payoff",
  },
  {
    id: "compound-return",
    topic: "investing",
    audience: "everyone",
    title: { he: "ריבית דריבית", en: "Compound return" },
    body: {
      he: "ריבית דריבית היא תשואה על התשואה. הזמן וההפקדה החודשית משפיעים על התוצאה יותר מאשר ניסיון לתזמן את השוק, במיוחד בטווחים ארוכים.",
      en: "Compound return is return on return. Time and monthly contributions matter more than trying to time the market, especially over long horizons.",
    },
    keywords: ["compound", "return", "invest", "ריבית דריבית", "תשואה", "השקעה"],
    source: "Penny investing guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/calculators/compound",
    calculator: "compound",
  },
  {
    id: "fees-matter",
    topic: "investing",
    audience: "everyone",
    title: { he: "דמי ניהול לאורך זמן", en: "Fees over time" },
    body: {
      he: "דמי ניהול שנתיים מוקטנים מהתשואה בכל שנה, ולכן פער קטן היום הופך לפער גדול בעת הפרישה. בדקו את דמי הניהול בכל מוצר, לא רק במסלול הכללי.",
      en: "Annual management fees reduce return every year, so a small gap today becomes a large gap at retirement. Check the fee on every product, not just the default track.",
    },
    keywords: ["fee", "cost", "return", "דמי ניהול", "עלות", "תשואה"],
    source: "Penny investing guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/calculators/fees",
    calculator: "compound",
  },
  {
    id: "budget-pace",
    topic: "budgeting",
    audience: "everyone",
    title: { he: "קצב הוצאות", en: "Spending pace" },
    body: {
      he: "קצב הוצאות משווה את מה שהוצאתם למה שחלף מהחודש. הוצאה גבוהה באמצע החודש אינה בהכרח בעיה אם היא חד פעמית, אך היא סימן לבדוק את היתרה לפני סוף החודש.",
      en: "Spending pace compares what you spent with how much of the month has passed. A high mid-month figure is not necessarily a problem if it is one-off, but it is a signal to check the remaining balance before month end.",
    },
    keywords: ["budget", "pace", "month", "תקציב", "קצב", "חודש"],
    source: "Penny budgeting guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/budget",
  },
  {
    id: "safe-to-spend",
    topic: "cashflow",
    audience: "everyone",
    title: { he: "בטוח להוציא", en: "Safe to spend" },
    body: {
      he: "בטוח להוציא הוא היתרה בבנק פחות חיובי כרטיס ופעולות צפויות עד המשכורת. הוא אינו כולל את המשכורת שטרם נכנסה, מפני שכסף שטרם הגיע אינו זמין להוצאה.",
      en: "Safe to spend is the bank balance minus card bills and known debits due before payday. It does not include salary that has not arrived yet, because money not received is not available to spend.",
    },
    keywords: ["safe to spend", "payday", "cash", "בטוח להוציא", "משכורת", "תזרים"],
    source: "Penny cash flow guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/",
  },
  {
    id: "concentration-risk",
    topic: "investing",
    audience: "investors",
    title: { he: "ריכוזיות השקעות", en: "Investment concentration" },
    body: {
      he: "ריכוזיות גבוהה במניה, במעסיק או במטבע מגדילה את התנודתיות ואת הסיכון לפגיעה חדה. פיזור נכון מתחשב בטווח, בצרכים הנזילים ובמיסוי, ולא רק במספר הניירות.",
      en: "High concentration in one stock, employer or currency increases volatility and the risk of a sharp loss. Sound diversification considers horizon, liquidity needs and tax, not just the number of holdings.",
    },
    keywords: ["concentration", "allocation", "diversify", "ריכוזיות", "הקצאה", "פיזור"],
    source: "Penny investing guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/investments",
  },
  {
    id: "income-stability",
    topic: "income",
    audience: "self-employed and freelancers",
    title: { he: "יציבות הכנסה", en: "Income stability" },
    body: {
      he: "הכנסה יציבה מאפשרת תכנון ארוך טווח; הכנסה משתנה דורשת כרית גדולה יותר ותקצוב לפי החודש החלש. תלות בלקוח אחד או במעסיק אחד היא סיכון שכדאי למדוד לפני שהוא מתממש.",
      en: "Stable income supports long-term planning; variable income needs a larger buffer and budgeting for the weakest month. Dependence on one client or employer is a risk worth measuring before it materializes.",
    },
    keywords: ["income", "stability", "client", "freelance", "הכנסה", "יציבות", "לקוח"],
    source: "Penny income guide",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/investments",
  },
  {
    id: "glossary-net-income",
    topic: "glossary",
    audience: "everyone",
    title: { he: "הכנסה נטו", en: "Net income" },
    body: {
      he: "הכנסה נטו היא מה שנשאר אחרי מס הכנסה, ביטוח לאומי, פנסיה וקרן השתלמות. היא הבסיס לתכנון תקציב, ולא השכר ברוטו.",
      en: "Net income is what remains after income tax, national insurance, pension and study fund. It is the basis for budgeting, not gross pay.",
    },
    keywords: ["net", "income", "salary", "נטו", "הכנסה", "משכורת"],
    source: "Penny glossary",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/net",
    calculator: "gross_net",
  },
  {
    id: "glossary-prime",
    topic: "glossary",
    audience: "borrowers",
    title: { he: "ריבית פריים", en: "Prime rate" },
    body: {
      he: "ריבית הפריים היא ריבית בסיס שמשתנה עם החלטות הריבית במשק. הלוואה שצמודה לפריים עולה או יורדת יחד איתה, ולכן התשלום אינו קבוע.",
      en: "The prime rate is a base rate that moves with policy rate decisions. A prime-linked loan moves with it, so the payment is not fixed.",
    },
    keywords: ["prime", "rate", "loan", "mortgage", "פריים", "ריבית", "הלוואה"],
    source: "Penny glossary",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/calculators/mortgage",
  },
  {
    id: "glossary-cpi",
    topic: "glossary",
    audience: "everyone",
    title: { he: "מדד המחירים לצרכן", en: "Consumer price index" },
    body: {
      he: "מדד המחירים לצרכן מודד את השינוי במחירי סל מוצרים ושירותים. הלוואה או חיסכון צמוד מדד משתנה בהתאם לשינוי במדד.",
      en: "The consumer price index measures the change in a basket of goods and services. An index-linked loan or saving changes with the index.",
    },
    keywords: ["cpi", "index", "inflation", "מדד", "אינפלציה", "צמוד"],
    source: "Penny glossary",
    reviewedAt: REVIEWED,
    taxYear: 2026,
    href: "/learn",
  },
  {
    id: "glossary-withdrawal-rate",
    topic: "glossary",
    audience: "retirement planners",
    title: { he: "שיעור משיכה", en: "Withdrawal rate" },
    body: {
      he: "שיעור המשיכה הוא החלק מהתיק שנמשך בשנה. הוא אינו הבטחה לתשואה, ותוחלת חיים ארוכה או תשואה נמוכה מחייבות שיעור שמרני יותר.",
      en: "The withdrawal rate is the share of the portfolio drawn in a year. It is not a return guarantee, and a long horizon or low return requires a more conservative rate.",
    },
    keywords: ["withdrawal", "retirement", "rate", "משיכה", "פרישה", "תשואה"],
    source: "Penny glossary",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/calculators/annuity",
    calculator: "retirement_gap",
  },
  {
    id: "glossary-liquidity",
    topic: "glossary",
    audience: "everyone",
    title: { he: "נזילות", en: "Liquidity" },
    body: {
      he: "נזילות היא היכולת להפוך נכס לכסף זמין במהירות ובלי הפסד משמעותי. קרן חירום צריכה להיות נזילה; נכסים לא נזילים מתאימים לטווח ארוך.",
      en: "Liquidity is the ability to turn an asset into available cash quickly and without a material loss. An emergency fund should be liquid; illiquid assets suit a long horizon.",
    },
    keywords: ["liquidity", "cash", "asset", "נזילות", "מזומן", "נכס"],
    source: "Penny glossary",
    reviewedAt: REVIEWED,
    taxYear: null,
    href: "/net-worth",
  },
];

interface Scored {
  entry: KnowledgeEntry;
  score: number;
}

export function searchKnowledge(query: string, locale: PipLocale, limit = 5): KnowledgeEntry[] {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return KNOWLEDGE_SEED.slice(0, limit);
  const scored: Scored[] = [];
  for (const entry of KNOWLEDGE_SEED) {
    const haystack = [
      entry.id,
      entry.topic,
      entry.audience,
      entry.title.he,
      entry.title.en,
      entry.body.he,
      entry.body.en,
      ...entry.keywords,
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 2;
      if (entry.keywords.some((k) => k.toLowerCase() === term)) score += 3;
      if (
        entry.title.he.toLowerCase().includes(term) ||
        entry.title.en.toLowerCase().includes(term)
      )
        score += 2;
    }
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map((r) => r.entry);
}

export function knowledgeCitation(entry: KnowledgeEntry): string {
  return `knowledge:${entry.id}@v${KNOWLEDGE_VERSION}@${entry.reviewedAt}`;
}
