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
  // Supermarkets and pharmacies
  [/אושר\s*עד|osher\s*ad/i, "א", "#e30613", "osherad.co.il"],
  [/יינות\s*ביתן|bitan/i, "ב", "#0b4ea2", "ybitan.co.il"],
  [/חצי\s*חינם/, "ח", "#e2001a", "hazi-hinam.co.il"],
  [/מחסני\s*השוק/, "מ", "#e30613", "mahsaneihashuk.co.il"],
  [/סטופ\s*מרקט|stop\s*market/i, "ס", "#e2001a", "stopmarket.co.il"],
  [/פרש\s*מרקט|fresh\s*market/i, "פ", "#4caf50", "freshmarket.co.il"],
  [/גוד\s*פארם|good\s*pharm/i, "ג", "#00a651", "goodpharm.co.il"],
  // Fuel and the road
  [/דור\s*אלון|dor\s*alon/i, "ד", "#00539f", "doralon.co.il"],
  [/(^|[\s-])טן([\s-]|$)/, "ט", "#e30613", "ten.co.il"],
  [/פנגו|pango/i, "P", "#00b2e3", "pango.co.il"],
  [/סלופארק|cellopark/i, "C", "#f7941d", "cellopark.co.il"],
  [/כביש\s*6|kvish\s*6/i, "6", "#00539f", "kvish6.co.il"],
  [/רכבת\s*ישראל|israel\s*rail/i, "ר", "#003a70", "rail.co.il"],
  [/אגד|egged/i, "א", "#00843d", "egged.co.il"],
  [/אל[\s-]*על|\bel\s*al\b/i, "E", "#0033a0", "elal.com"],
  [/ישראייר|israir/i, "I", "#e30613", "israir.co.il"],
  [/ארקיע|arkia/i, "A", "#e30613", "arkia.co.il"],
  [/wizz/i, "W", "#c6007e", "wizzair.com"],
  [/ryanair/i, "R", "#073590", "ryanair.com"],
  // Eating out and delivery
  [/קפה\s*קפה|cafe\s*cafe/i, "ק", "#6b3e26", "cafecafe.co.il"],
  [/לנדוור|landwer/i, "ל", "#3a2a1e", "landwer.co.il"],
  [/גרג|\bgreg\b/i, "G", "#8a5a2b", "greg.co.il"],
  [/קופיקס|cofix/i, "C", "#e30613", "cofix.co.il"],
  [/רולדין|roladin/i, "R", "#8b1e3f", "roladin.co.il"],
  [/גולדה|\bgolda\b/i, "G", "#f39ac0", "golda.co.il"],
  [/בורגר\s*קינג|burger\s*king/i, "B", "#d62300", "burgerking.co.il"],
  [/בורגראנץ|burgeranch/i, "B", "#e30613", "burgeranch.co.il"],
  [/\bkfc\b/i, "K", "#e4002b", "kfc.co.il"],
  [/דומינו|domino/i, "D", "#006491", "dominos.co.il"],
  [/פיצה\s*האט|pizza\s*hut/i, "P", "#ee3124", "pizzahut.co.il"],
  [/ג.פניקה|japanika/i, "J", "#111111", "japanika.net"],
  [/תן\s*ביס|10\s*bis/i, "1", "#f7941d", "10bis.co.il"],
  [/סיבוס|cibus|pluxee/i, "C", "#00eb5e", "pluxee.co.il"],
  [/משלוחה|mishloha/i, "מ", "#e30613", "mishloha.co.il"],
  // Shops
  [/\bksp\b/i, "K", "#e30613", "ksp.co.il"],
  [/אייבורי|ivory/i, "I", "#f7941d", "ivory.co.il"],
  [/(^|[\s-])באג([\s-]|$)|\bbug\b/i, "B", "#e30613", "bug.co.il"],
  [/הום\s*סנטר|home\s*center/i, "H", "#e30613", "homecenter.co.il"],
  [/\bace\b|אייס/i, "A", "#e30613", "ace.co.il"],
  [/מקס\s*סטוק|max\s*stock/i, "M", "#e30613", "maxstock.co.il"],
  [/רנואר|renuar/i, "R", "#111111", "renuar.co.il"],
  [/terminal\s*x|טרמינל/i, "X", "#111111", "terminalx.com"],
  [/shein|שיין/i, "S", "#111111", "shein.com"],
  [/\basos\b/i, "A", "#111111", "asos.com"],
  [/\bnext\b|נקסט/i, "N", "#111111", "next.co.il"],
  [/adidas|אדידס/i, "A", "#111111", "adidas.co.il"],
  [/\bnike\b|נייקי/i, "N", "#111111", "nike.com"],
  [/דקטלון|decathlon/i, "D", "#0082c3", "decathlon.co.il"],
  [/מגה\s*ספורט|mega\s*sport/i, "M", "#e30613", "megasport.co.il"],
  [/המשביר/, "ה", "#e30613", "365.co.il"],
  [/toys\s*r\s*us|טויס/i, "T", "#0055a5", "toysrus.co.il"],
  [/סטימצקי|steimatzky/i, "S", "#e30613", "steimatzky.co.il"],
  [/צומת\s*ספרים/, "צ", "#e30613", "booknet.co.il"],
  [/קרביץ|kravitz/i, "K", "#e30613", "kravitz.co.il"],
  [/אופיס\s*דיפו|office\s*depot/i, "O", "#cc0000", "officedepot.co.il"],
  [/ללין|laline/i, "L", "#111111", "laline.co.il"],
  [/\btemu\b/i, "T", "#fb7701", "temu.com"],
  [/\bebay\b/i, "E", "#e53238", "ebay.com"],
  // Home, phone and utilities
  [/מי\s*אביבים/, "מ", "#0082c8", "mei-avivim.co.il"],
  [/סופרגז|supergas/i, "S", "#e30613", "supergas.co.il"],
  [/פזגז|pazgas/i, "P", "#ffcc00", "pazgas.co.il"],
  [/אמישראגז|amisragas/i, "A", "#0055a5", "amisragas.co.il"],
  [/(^|[\s-])yes([\s-]|$)/i, "Y", "#00a0df", "yes.co.il"],
  [/הוט\s*מובייל|hot\s*mobile/i, "H", "#e4002b", "hotmobile.co.il"],
  [/019/, "0", "#f7941d", "019mobile.co.il"],
  [/ביטוח\s*לאומי/, "ב", "#0055a5", "btl.gov.il"],
  [/מאוחדת|meuhedet/i, "מ", "#00a3ad", "meuhedet.co.il"],
  [/לאומית|leumit/i, "ל", "#0055a5", "leumit.co.il"],
  // Online services
  [/paypal/i, "P", "#003087", "paypal.com"],
  [/paybox|פייבוקס/i, "P", "#00b2e3", "payboxapp.com"],
  [/microsoft|מיקרוסופט/i, "M", "#00a4ef", "microsoft.com"],
  [/adobe/i, "A", "#fa0f00", "adobe.com"],
  [/dropbox/i, "D", "#0061ff", "dropbox.com"],
  [/github/i, "G", "#111111", "github.com"],
  [/steam/i, "S", "#171a21", "steampowered.com"],
  [/playstation/i, "P", "#003791", "playstation.com"],
  [/canva/i, "C", "#00c4cc", "canva.com"],
  [/\bzoom\b/i, "Z", "#0b5cff", "zoom.us"],
  [/linkedin/i, "L", "#0a66c2", "linkedin.com"],
  [/facebook|\bmeta\b/i, "F", "#0866ff", "facebook.com"],
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
