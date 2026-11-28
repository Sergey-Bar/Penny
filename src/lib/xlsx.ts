/**
 * Minimal .xlsx reader with no dependencies: zip central directory + DecompressionStream,
 * then every worksheet in order (card exports split domestic/abroad by sheet) as rows of strings (numbers as their plain string, so Excel
 * date serials come through as e.g. "45292"). Formulas give their cached value.
 */

// shortcut: regex XML extraction instead of DOMParser so it also runs in node tests; fine for sheet/sharedStrings XML.
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[
          e.toLowerCase()
        ],
  );

/** 200MB uncompressed or a 100:1 ratio means a zip bomb, not a statement. */
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_RATIO = 100;

interface ZipEntry {
  compressed: number;
  load: () => Promise<string>;
}

/**
 * Reads a decompression stream while counting the bytes actually produced. The central
 * directory's uncompressed size is attacker-controlled, so the real limit is enforced here.
 */
async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<{ text: string; bytes: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error("zipBomb");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes };
  } finally {
    reader.releaseLock();
  }
}

export interface XlsxLimits {
  maxUncompressed?: number;
  maxRatio?: number;
}

async function unzip(bytes: Uint8Array, limits: XlsxLimits = {}): Promise<Map<string, ZipEntry>> {
  const maxUncompressed = limits.maxUncompressed ?? MAX_UNCOMPRESSED;
  const maxRatio = limits.maxRatio ?? MAX_RATIO;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, ZipEntry>();
  let total = 0;
  let loaded = 0;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const uncompressed = view.getUint32(p + 24, true);
    total += uncompressed;
    if (total > maxUncompressed || (compressed > 0 && uncompressed / compressed > maxRatio))
      throw new Error("zipBomb");
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    files.set(name, {
      compressed,
      load: async () => {
        const start =
          local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.slice(start, start + compressed);
        if (method === 0) {
          if (loaded + data.length > maxUncompressed) throw new Error("zipBomb");
          loaded += data.length;
          return new TextDecoder().decode(data);
        }
        if (method !== 8) throw new Error(`unsupported zip method ${method}`);
        const stream = new Blob([data])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
        const result = await readBoundedStream(stream, maxUncompressed - loaded);
        loaded += result.bytes;
        return result.text;
      },
    });
  }
  return files;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

interface WorkbookSheet {
  name: string;
  hidden: boolean;
  rows: string[][];
}

export interface XlsxWorkbook {
  sheets: WorkbookSheet[];
  /** Mac Excel 1904 date system; date serials need the other epoch. */
  date1904: boolean;
}

async function sheetIndex(
  files: Map<string, ZipEntry>,
): Promise<{ name: string; file: string; hidden: boolean }[]> {
  const workbook = await files.get("xl/workbook.xml")?.load();
  const rels = await files.get("xl/_rels/workbook.xml.rels")?.load();
  const targets = new Map<string, string>();
  for (const rel of rels?.matchAll(/<Relationship\b[^>]*>/g) ?? []) {
    const id = /\bId="([^"]+)"/.exec(rel[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(rel[0])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ""));
  }
  const out: { name: string; file: string; hidden: boolean }[] = [];
  for (const sheet of workbook?.matchAll(/<sheet\b[^>]*>/g) ?? []) {
    const tag = sheet[0];
    const name = decodeXml(/\bname="([^"]*)"/.exec(tag)?.[1] ?? "");
    const state = /\bstate="([^"]*)"/.exec(tag)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1];
    const target = rid ? targets.get(rid) : undefined;
    const file = target
      ? `xl/${target}`
      : [...files.keys()]
          .filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))
          .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[out.length];
    if (file && files.has(file))
      out.push({
        name: name || `Sheet${out.length + 1}`,
        file,
        hidden: state === "hidden" || state === "veryHidden",
      });
  }
  if (out.length > 0) return out;
  // No workbook.xml: fall back to file order.
  return [...files.keys()]
    .filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file, i) => ({ name: `Sheet${i + 1}`, file, hidden: false }));
}

async function readSheet(xml: string, shared: string[]): Promise<string[][]> {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const c of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+\d*)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr")
        text = decodeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
      else if (v != null) text = decodeXml(v);
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = text.trim();
    }
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

/** Every sheet of a workbook, with its real name, order and hidden flag. */
export async function readXlsxWorkbook(
  input: ArrayBuffer | Uint8Array,
  limits: XlsxLimits = {},
): Promise<XlsxWorkbook> {
  const files = await unzip(input instanceof Uint8Array ? input : new Uint8Array(input), limits);
  const workbookXml = await files.get("xl/workbook.xml")?.load();
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/i.test(workbookXml ?? "");
  const shared: string[] = [];
  const ss = await files.get("xl/sharedStrings.xml")?.load();
  for (const si of ss?.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    // Phonetic runs (<rPh>) are hints, not cell text.
    const body = si.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
    shared.push(
      decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")),
    );
  }
  const entries = await sheetIndex(files);
  const sheets: WorkbookSheet[] = [];
  for (const entry of entries) {
    const xml = await files.get(entry.file)!.load();
    sheets.push({ name: entry.name, hidden: entry.hidden, rows: await readSheet(xml, shared) });
  }
  if (sheets.length === 0) throw new Error("no worksheet");
  return { sheets, date1904 };
}

/** All sheets flattened, in workbook order (the legacy reader). */
export async function readXlsx(
  input: ArrayBuffer | Uint8Array,
  limits: XlsxLimits = {},
): Promise<string[][]> {
  const workbook = await readXlsxWorkbook(input, limits);
  return workbook.sheets.flatMap((sheet) => sheet.rows);
}
