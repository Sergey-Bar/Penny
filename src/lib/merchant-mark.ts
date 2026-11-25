import { LOCAL_MERCHANT_LOGOS } from "./merchant-logos.generated";

/**
 * A merchant's mark in transaction rows. Well-known merchants get their real logo, which ships inside the app
 * (public/merchants, downloaded once by scripts/fetch-merchant-icons.mjs), so showing it never tells anyone where
 * you shop. Everyone else gets a steady colour and an initial. Nothing is fetched at runtime.
 */
export interface MerchantMark {
  letter: string;
  color: string;
  /** Path of the bundled logo, when there is one. */
  logo?: string;
}

/** Pattern, fallback letter, brand colour, and the site whose icon is the logo. */
export const BRANDS: [RegExp, string, string, string][] = [
  [/שופרסל|shufersal/i, "ש", "#e2001a", "shufersal.co.il"],
  [/רמי\s*לוי|rami\s*levy/i, "ר", "#0057a8", "rami-levy.co.il"],
  [/ויקטורי/, "ו", "#e30613", "victoryonline.co.il"],
  [/יוחננוף/, "י", "#00843d", "yochananof.co.il"],
  [/טיב\s*טעם/, "ט", "#d6001c", "tivtaam.co.il"],
  [/קרפור|carrefour/i, "C", "#004e9f", "carrefour.co.il"],
  [/am\s*:?\s*pm/i, "A", "#f9b000", "ampm.co.il"],
  [/סופר[\s-]*פארם|super[\s-]*pharm/i, "ס", "#e4002b", "super-pharm.co.il"],
  // \b only knows Latin letters, so Hebrew words get explicit edges.
  [/(^|[\s-])פז([\s-]|$)|\bpaz\b/i, "פ", "#ffcc00", "paz.co.il"],
  [/דלק|delek/i, "ד", "#e30613", "delek.co.il"],
  [/סונול|sonol/i, "ס", "#0072ce", "sonol.co.il"],
  [/איקאה|ikea/i, "I", "#0058a3", "ikea.com"],
  [/מקדונלד|mcdonald/i, "M", "#da291c", "mcdonalds.co.il"],
  [/ארומה|aroma/i, "A", "#1a1a1a", "aroma.co.il"],
  [/וולט|wolt/i, "W", "#009de0", "wolt.com"],
  [/נטפליקס|netflix/i, "N", "#e50914", "netflix.com"],
  [/ספוטיפיי|spotify/i, "S", "#1db954", "spotify.com"],
  [/דיסני|disney/i, "D", "#113ccf", "disneyplus.com"],
  [/youtube|יוטיוב/i, "Y", "#ff0000", "youtube.com"],
  [/openai|chatgpt/i, "O", "#10a37f", "openai.com"],
  [/apple|אפל/i, "A", "#555555", "apple.com"],
  [/google|גוגל/i, "G", "#4285f4", "google.com"],
  [/amazon|אמזון/i, "A", "#ff9900", "amazon.com"],
  [/booking/i, "B", "#003580", "booking.com"],
  [/airbnb/i, "A", "#ff5a5f", "airbnb.com"],
  [/\buber\b|אובר/i, "U", "#111111", "uber.com"],
  [/בזק|bezeq/i, "ב", "#0047ba", "bezeq.co.il"],
  [/פרטנר|partner/i, "P", "#00b2a9", "partner.co.il"],
  [/סלקום|cellcom/i, "C", "#6a1b9a", "cellcom.co.il"],
  [/פלאפון|pelephone/i, "P", "#00a0df", "pelephone.co.il"],
  [/גולן\s*טלקום|golan\s*telecom/i, "G", "#e6007e", "golantelecom.co.il"],
  [/\bhot\b|הוט/i, "H", "#e4002b", "hot.net.il"],
  [/חברת\s*החשמל|electric/i, "ח", "#f4a300", "iec.co.il"],
  [/רב[\s-]*קו|rav[\s-]*kav/i, "ר", "#6cb33f", "ravkavonline.co.il"],
  [/יאנגו|yango/i, "Y", "#ff3d00", "yango.com"],
  [/(^|[\s-])גט([\s-]|$)|\bgett\b/i, "G", "#ffd700", "gett.com"],
  [/סינמה\s*סיטי|cinema\s*city/i, "C", "#e30613", "cinema-city.co.il"],
  [/זארה|zara/i, "Z", "#111111", "zara.com"],
  [/h\s*&\s*m\b/i, "H", "#e50010", "hm.com"],
  [/פוקס|\bfox\b/i, "F", "#111111", "fox.co.il"],
  [/קסטרו|castro/i, "C", "#111111", "castro.com"],
  [/כללית|clalit/i, "כ", "#0a7cc1", "clalit.co.il"],
  [/מכבי|maccabi/i, "מ", "#0033a0", "maccabi4u.co.il"],
  [/aliexpress|עליאקספרס/i, "A", "#ff4747", "aliexpress.com"],
];

const PALETTE = [
  "#7c5cff",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
  "#64748b",
];

/** First letter or digit of the name, for a mark with no brand. */
const initial = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase();

export function merchantMark(name: string): MerchantMark {
  for (const [re, letter, color, domain] of BRANDS)
    if (re.test(name))
      return LOCAL_MERCHANT_LOGOS.has(domain)
        ? { letter, color, logo: `/merchants/${domain}.png` }
        : { letter, color };
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { letter: initial(name), color: PALETTE[h % PALETTE.length] };
}
