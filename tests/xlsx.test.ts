import { describe, expect, it } from "vitest";
import { readXlsx } from "@/lib/xlsx";

// Builds a zip in memory; `deflate` entries use CompressionStream("deflate-raw"), the rest are stored.
async function zip(files: Record<string, string>, deflate: string[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const method = deflate.includes(name) ? 8 : 0;
    const data = method
      ? new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")),
          ).arrayBuffer(),
        )
      : raw;
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(data, 30 + n.length);
    const cd = new Uint8Array(46 + n.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    cd.set(n, 46);
    locals.push(local);
    central.push(cd);
    offset += local.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const sheet = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="inlineStr"><is><t>שם בית העסק</t></is></c><c r="C3" t="str"><v>סכום</v></c></row>
<row r="4"><c r="A4"><v>45292</v></c><c r="B4" t="s"><v>2</v></c><c r="D4"><v>-12.5</v></c></row>
<row r="5"/>
</sheetData></worksheet>`;
const strings = `<sst><si><t>פירוט עסקאות</t></si><si><r><t>תאריך </t></r><r><t>עסקה</t></r></si><si><t>שופרסל &amp; בניו</t><rPh><t>x</t></rPh></si></sst>`;

describe("readXlsx", () => {
  it("reads shared, inline and numeric cells from a deflated sheet", async () => {
    const bytes = await zip(
      {
        "[Content_Types].xml": "<Types/>",
        "xl/sharedStrings.xml": strings,
        "xl/worksheets/sheet1.xml": sheet,
      },
      ["xl/worksheets/sheet1.xml"],
    );
    expect(await readXlsx(bytes)).toEqual([
      ["פירוט עסקאות"],
      ["תאריך עסקה", "שם בית העסק", "סכום"],
      ["45292", "שופרסל & בניו", "", "-12.5"],
    ]);
  });

  it("reads every sheet in order (sheet10 after sheet2)", async () => {
    const one = (v: string) =>
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${v}</t></is></c></row></sheetData></worksheet>`;
    const bytes = await zip(
      {
        "xl/worksheets/sheet10.xml": one("c"),
        "xl/worksheets/sheet2.xml": one("b"),
        "xl/worksheets/sheet1.xml": one("a"),
      },
      [],
    );
    expect(await readXlsx(bytes)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("counts a shared zip entry's bytes only once", async () => {
    const workbook = `<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const sheetXml = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
    const files = { "xl/workbook.xml": workbook, "xl/worksheets/sheet1.xml": sheetXml };
    const bytes = await zip(files, []);
    const enc = new TextEncoder();
    const total = Object.values(files).reduce((sum, text) => sum + enc.encode(text).length, 0);
    // workbook.xml is loaded twice; at the exact distinct total it must not be counted twice.
    expect(await readXlsx(bytes, { maxUncompressed: total })).toEqual([["x"]]);
  });

  it("rejects non-zip input", async () => {
    await expect(readXlsx(new TextEncoder().encode("a,b\n1,2"))).rejects.toThrow();
  });
});

describe("readXlsx decompression limits", () => {
  it("enforces the actual decompressed size when the central directory lies", async () => {
    const sheetXml =
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>this is more than ten bytes</t></is></c></row></sheetData></worksheet>';
    const bytes = await zip({ "xl/worksheets/sheet1.xml": sheetXml }, ["xl/worksheets/sheet1.xml"]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let patched = false;
    for (let i = 0; i < bytes.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 1, true);
        patched = true;
        break;
      }
    }
    expect(patched).toBe(true);
    await expect(readXlsx(bytes, { maxUncompressed: 10 })).rejects.toThrow("zipBomb");
  });
});
