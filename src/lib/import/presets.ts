import { guessImportMapping } from "@/lib/import/detect";
import { emptyImportMapping } from "@/lib/import/profile";
import type { DateOrder, ImportMapping, MappingField, SignConvention } from "@/lib/import/types";

export interface ImportPreset {
  id: string;
  provider: string;
  kind: "bank" | "card";
  label: { he: string; en: string };
  /** File-name hints, for a browser that knows the file name. */
  fileHints: readonly RegExp[];
  /** Header words that identify this institution's export. */
  headerHints: readonly string[];
  dateOrder: DateOrder;
  signConvention: SignConvention;
  /** Column words per field; resolved against the actual header row. */
  mappingWords: Partial<Record<MappingField, readonly string[]>>;
}

const CARD_COLUMNS: ImportPreset["mappingWords"] = {
  date: ["תאריך עסקה", "תאריך רכישה", "תאריך"],
  processedDate: ["תאריך חיוב", "תאריך ערך"],
  description: ["שם בית העסק", "בית עסק", "תיאור"],
  amount: ["סכום חיוב", "סכום"],
  originalAmount: ["סכום עסקה", "סכום מקורי"],
  originalCurrency: ["מטבע", "מטבע עסקה"],
  installmentNumber: ["תשלום נוכחי"],
  installmentTotal: ["מס' תשלומים", "מספר תשלומים"],
  memo: ["הערה", "פירוט נוסף"],
  identifier: ["אסמכתא", "מספר אסמכתא"],
  categoryRaw: ["קטגוריה", "סיווג"],
};

const BANK_COLUMNS: ImportPreset["mappingWords"] = {
  date: ["תאריך", "תאריך תנועה", "תאריך פעולה"],
  processedDate: ["תאריך ערך", "תאריך חיוב"],
  description: ["תיאור", "תאור", "פרטים", "תיאור התנועה"],
  amount: ["סכום", "סכום התנועה"],
  debit: ["חובה", "חיוב", "בחובה"],
  credit: ["זכות", "זיכוי", "בזכות"],
  memo: ["הערה", "הערות", "פירוט נוסף"],
  balance: ["יתרה", "יתרת חשבון"],
  identifier: ["אסמכתא", "מספר אסמכתא"],
  categoryRaw: ["קטגוריה", "סיווג"],
};

const IMPORT_PRESETS: readonly ImportPreset[] = [
  {
    id: "leumi",
    provider: "leumi",
    kind: "bank",
    label: { he: "לאומי", en: "Leumi" },
    fileHints: [/leumi/i, /לאומי/],
    headerHints: ["תאריך ערך", "אסמכתא", "יתרה", "חובה", "זכות"],
    dateOrder: "dmy",
    signConvention: "explicit",
    mappingWords: BANK_COLUMNS,
  },
  {
    id: "hapoalim",
    provider: "hapoalim",
    kind: "bank",
    label: { he: "הפועלים", en: "Hapoalim" },
    fileHints: [/hapoalim/i, /פועלים/],
    headerHints: ["תאריך", "תיאור", "אסמכתא", "חובה", "זכות"],
    dateOrder: "dmy",
    signConvention: "explicit",
    mappingWords: BANK_COLUMNS,
  },
  {
    id: "discount",
    provider: "discount",
    kind: "bank",
    label: { he: "דיסקאונט", en: "Discount" },
    fileHints: [/discount/i, /דיסקאונט/],
    headerHints: ["תאריך", "תיאור", "חובה", "זכות", "יתרה"],
    dateOrder: "dmy",
    signConvention: "explicit",
    mappingWords: BANK_COLUMNS,
  },
  {
    id: "mizrahi",
    provider: "mizrahi",
    kind: "bank",
    label: { he: "מזרחי", en: "Mizrahi" },
    fileHints: [/mizrahi/i, /מזרחי/],
    headerHints: ["תאריך", "תיאור", "חובה", "זכות"],
    dateOrder: "dmy",
    signConvention: "explicit",
    mappingWords: BANK_COLUMNS,
  },
  {
    id: "isracard",
    provider: "isracard",
    kind: "card",
    label: { he: "ישראכרט", en: "Isracard" },
    fileHints: [/isracard/i, /ישראכרט/],
    headerHints: ["שם בית העסק", "סכום עסקה", "סכום חיוב", "מס' תשלומים"],
    dateOrder: "dmy",
    signConvention: "cardPositive",
    mappingWords: CARD_COLUMNS,
  },
  {
    id: "max",
    provider: "max",
    kind: "card",
    label: { he: "מקס", en: "Max" },
    fileHints: [/max/i, /מקס/],
    headerHints: ["שם בית העסק", "סכום עסקה", "סכום חיוב", "תאריך חיוב"],
    dateOrder: "dmy",
    signConvention: "cardPositive",
    mappingWords: CARD_COLUMNS,
  },
  {
    id: "cal",
    provider: "cal",
    kind: "card",
    label: { he: "כאל", en: "Cal" },
    fileHints: [/cal\b/i, /כאל/],
    headerHints: ["שם בית העסק", "סכום עסקה", "סכום חיוב"],
    dateOrder: "dmy",
    signConvention: "cardPositive",
    mappingWords: CARD_COLUMNS,
  },
  {
    id: "amex",
    provider: "amex",
    kind: "card",
    label: { he: "אמקס", en: "Amex" },
    fileHints: [/amex/i, /אמקס/],
    headerHints: ["שם בית העסק", "סכום", "מטבע"],
    dateOrder: "dmy",
    signConvention: "cardPositive",
    mappingWords: CARD_COLUMNS,
  },
];

const norm = (value: string) =>
  value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\s"'׳״:*()₪%]+/g, " ")
    .trim()
    .toLowerCase();

/** Header words -> column index, using the preset's exact words before a loose match. */
export function presetMapping(preset: ImportPreset, header: readonly string[]): ImportMapping {
  const map = emptyImportMapping();
  const used = new Set<number>();
  const cols = header.map(norm);
  for (const [field, words] of Object.entries(preset.mappingWords) as [
    MappingField,
    readonly string[],
  ][]) {
    for (const word of words) {
      const key = norm(word);
      const exact = cols.findIndex((c, i) => !used.has(i) && c === key);
      const loose = exact >= 0 ? exact : cols.findIndex((c, i) => !used.has(i) && c.includes(key));
      if (loose >= 0) {
        map[field] = loose;
        used.add(loose);
        break;
      }
    }
  }
  // The preset only knew the fields it names; fill anything it missed from the generic guesser.
  const fallback = guessImportMapping([...header]);
  for (const field of Object.keys(map) as MappingField[]) {
    if (map[field] == null && fallback[field] != null && !used.has(fallback[field]!)) {
      map[field] = fallback[field];
      used.add(fallback[field]!);
    }
  }
  return map;
}

export interface PresetMatch {
  preset: ImportPreset;
  score: number;
}

/** Best preset for a header (and file name when known), or null when nothing is close. */
export function detectPreset(
  header: readonly string[],
  fileName?: string | null,
): PresetMatch | null {
  const text = header.map(norm).join(" | ");
  let best: PresetMatch | null = null;
  for (const preset of IMPORT_PRESETS) {
    let score = 0;
    for (const hint of preset.headerHints) if (text.includes(norm(hint))) score += 2;
    if (fileName && preset.fileHints.some((re) => re.test(fileName))) score += 5;
    if (score > 0 && (!best || score > best.score)) best = { preset, score };
  }
  return best;
}
