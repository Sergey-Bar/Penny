import { describe, expect, it } from "vitest";
import {
  detectBalance,
  detectImportDateOrder,
  detectSignConvention,
  findImportHeaderRow,
  guessImportMapping,
  mappingComplete,
} from "@/lib/import/detect";
import {
  clearDefaultAccountStamp,
  debitCreditFor,
  statementBalanceAccount,
  tableToDrafts,
} from "@/lib/import/draft";
import { normalizeImportRow } from "@/lib/import/normalize";
import { extractFromCell, isSafeRegex, namedGroups } from "@/lib/import/extract";
import { migrateProfileV1, importProfileKey, parseImportProfile } from "@/lib/import/profile";
import { detectPreset, presetMapping, type ImportPreset } from "@/lib/import/presets";
import { parseHtmlTableAdvanced, readImportSource, ImportReadError } from "@/lib/import/read";
import { parseStatementText } from "@/lib/import/text";

const HEADER = ["תאריך", "תיאור", "סכום", "יתרה"];

describe("detect", () => {
  it("finds a header after a preamble and maps columns", () => {
    const table = [
      ["דוח תנועות"],
      ["", ""],
      HEADER,
      ["01/02/2024", "שופרסל", "-84.90", "1,000.00"],
    ];
    expect(findImportHeaderRow(table)).toBe(2);
    expect(guessImportMapping(HEADER)).toMatchObject({
      date: 0,
      description: 1,
      amount: 2,
      balance: 3,
    });
    expect(mappingComplete(guessImportMapping(HEADER))).toBe(true);
  });

  it("separates a card's original amount from the charged amount", () => {
    const header = ["תאריך עסקה", "שם בית העסק", "סכום עסקה", "סכום חיוב", "מטבע"];
    expect(guessImportMapping(header)).toMatchObject({
      date: 0,
      description: 1,
      originalAmount: 2,
      amount: 3,
      originalCurrency: 4,
    });
  });

  it("detects date order and sign convention", () => {
    expect(detectImportDateOrder(["01/02/2024", "13/02/2024"])).toBe("dmy");
    expect(detectImportDateOrder(["01/13/2024"])).toBe("mdy");
    expect(
      detectSignConvention({
        amounts: [10, 20],
        mapping: guessImportMapping(HEADER),
        accountKind: "card",
      }),
    ).toBe("cardPositive");
    expect(
      detectSignConvention({
        amounts: [-10, 20],
        mapping: guessImportMapping(HEADER),
        accountKind: "bank",
      }),
    ).toBe("bankSigned");
    expect(
      detectSignConvention({
        amounts: [-10],
        mapping: guessImportMapping(["תאריך", "תיאור", "חובה", "זכות"]),
        accountKind: "bank",
      }),
    ).toBe("explicit");
  });

  it("picks the balance on the latest date, last row on a tie", () => {
    const body = [
      ["01/02/2024", "a", "-10", "100"],
      ["03/02/2024", "b", "-10", "200"],
      ["03/02/2024", "c", "-10", "300"],
    ];
    expect(detectBalance(body, guessImportMapping(HEADER))).toMatchObject({
      value: 300,
      asOf: "2024-02-03",
    });
  });
});

describe("drafts", () => {
  it("builds drafts, carries the account column and skips section headers", () => {
    const mapping = guessImportMapping(["תאריך", "תיאור", "סכום", "חשבון", "הערה"]);
    const body = [
      ["01/02/2024", "שופרסל", "-84.90", "לאומי 123", "הערה"],
      ["תאריך", "תיאור", "סכום", "חשבון", "הערה"],
      ["02/02/2024", "וולט", "-50", "לאומי 123", ""],
    ];
    const { drafts, skipped } = tableToDrafts(body, mapping, { sheetName: 'עו"ש' });
    expect(drafts).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(drafts[0]).toMatchObject({
      date: "01/02/2024",
      description: "שופרסל",
      amount: "-84.90",
      accountRaw: "לאומי 123",
      memo: "הערה",
    });
  });

  it("counts pending rows rather than dropping them silently", () => {
    const mapping = guessImportMapping(HEADER);
    const { drafts, pending } = tableToDrafts([["01/02/2024", "ממתין", "-10", ""]], mapping);
    expect(drafts).toHaveLength(0);
    expect(pending).toBe(1);
  });
});

describe("HTML tables", () => {
  it("expands colspan and rowspan", () => {
    const html = `<table>
      <tr><td rowspan="2">A</td><td colspan="2">B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </table>`;
    expect(parseHtmlTableAdvanced(html)).toEqual([
      ["A", "B", ""],
      ["A", "C", "D"],
    ]);
  });
});

describe("readImportSource", () => {
  it("reads UTF-16 CSV with a BOM and reports the encoding", async () => {
    const text = "תאריך,תיאור,סכום\n01/02/2024,שופרסל,-84.90\n";
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    const result = await readImportSource({ bytes, name: "leumi.csv" });
    expect(result.format).toBe("csv");
    expect(result.sheets[0].rows[1]).toEqual(["01/02/2024", "שופרסל", "-84.90"]);
    expect(result.warnings.map((w) => w.code)).toContain("encodingFallback");
  });

  it("reads an HTML-xls table", async () => {
    const html = `<table><tr><td>תאריך</td><td>תיאור</td><td>סכום</td></tr>
      <tr><td>01/02/2024</td><td>שופרסל</td><td>-84.90</td></tr></table>`;
    const result = await readImportSource({
      bytes: new TextEncoder().encode(html),
      name: "export.xls",
    });
    expect(result.format).toBe("html");
  });

  it("explains a real BIFF .xls instead of parsing it", async () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await expect(readImportSource({ bytes, name: "old.xls" })).rejects.toMatchObject({
      code: "xlsBinary",
    });
  });

  it("needs AI only for a PDF", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4");
    await expect(readImportSource({ bytes, name: "stmt.pdf" })).rejects.toMatchObject({
      code: "pdfNeedsAI",
    });
  });

  it("rejects an empty file and a huge file", async () => {
    await expect(
      readImportSource({ bytes: new Uint8Array(), name: "x.csv" }),
    ).rejects.toBeInstanceOf(ImportReadError);
    const huge = new Uint8Array(25 * 1024 * 1024 + 1);
    await expect(readImportSource({ bytes: huge, name: "x.csv" })).rejects.toMatchObject({
      code: "tooLarge",
    });
  });
});

describe("extract", () => {
  it("rejects an unsafe regex and extracts named groups", () => {
    expect(isSafeRegex("(?<date>\\d{2}/\\d{2})")).toBe(true);
    expect(isSafeRegex("(?<sign>-)?")).toBe(true);
    expect(isSafeRegex("(?<memo>cash)|(?<amount>12)")).toBe(true);
    expect(isSafeRegex("(?<x>a)*")).toBe(true);
    expect(isSafeRegex("(a+)+$")).toBe(false);
    expect(isSafeRegex("(a|a)*")).toBe(false);
    expect(namedGroups("(?<date>\\d{2}/\\d{2}) (?<amount>[\\d.]+)")).toEqual(["date", "amount"]);
    expect(
      extractFromCell(
        "12/03/2024 קפה 18.50",
        "(?<date>\\d{2}/\\d{2}/\\d{4}).*?(?<amount>\\d+\\.\\d+)",
      ),
    ).toEqual({
      date: "12/03/2024",
      amount: "18.50",
    });
    expect(extractFromCell("no match", "(?<date>\\d{2})")).toBeNull();
  });
});

describe("profile", () => {
  it("migrates a v1 preference without losing the mapping", () => {
    const profile = migrateProfileV1(
      { map: { date: 0, description: 1, amount: 2 }, dateOrder: "mdy", positiveIsExpense: true },
      { format: "csv", headerFingerprint: "a|b|c" },
    );
    expect(profile).toMatchObject({
      version: 2,
      signConvention: "cardPositive",
      dateOrder: "mdy",
      mapping: { date: 0, description: 1, amount: 2 },
    });
    expect(importProfileKey(profile)).toBe("csv||a|b|c");
    expect(parseImportProfile(JSON.stringify(profile))?.version).toBe(2);
    expect(parseImportProfile("not json")).toBeNull();
  });
});

describe("presets", () => {
  it("recognises an Isracard layout from its header", () => {
    const header = ["תאריך רכישה", "שם בית העסק", "סכום עסקה", "סכום חיוב", "מס' תשלומים"];
    const match = detectPreset(header, "isracard.csv");
    expect(match?.preset.id).toBe("isracard");
    expect(presetMapping(match!.preset, header)).toMatchObject({
      date: 0,
      description: 1,
      originalAmount: 2,
      amount: 3,
      installmentTotal: 4,
    });
  });

  it("returns null for an unknown layout", () => {
    expect(detectPreset(["a", "b", "c"])).toBeNull();
  });
});

describe("text statements", () => {
  it("parses dated lines with amounts", () => {
    const text = `דוח תנועות
01/02/2024 שופרסל תל אביב -84.90
02/02/2024 משכורת חברה בע"מ 9,000.00
סה"כ 8,915.10`;
    const parsed = parseStatementText(text);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ date: "2024-02-01", amount: 84.9, kind: "expense" });
    expect(parsed.rows[1]).toMatchObject({ amount: 9000, kind: "income" });
    expect(parsed.looksTabular).toBe(true);
  });

  it("does not pretend prose is a table", () => {
    const parsed = parseStatementText("שלום, זה לא דוח.");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.looksTabular).toBe(false);
  });
});

describe("regressions", () => {
  it("keeps the credit when the debit cell is zero", () => {
    const mapping = guessImportMapping(["Date", "Description", "Debit", "Credit"]);
    const { drafts } = tableToDrafts([["2024-02-01", "Refund", "0", "125.00"]], {
      ...mapping,
      debit: 2,
      credit: 3,
      amount: null,
    });
    expect(drafts[0]).toMatchObject({ amount: "125.00", debit: "0", credit: "125.00" });
  });

  it("does not let a short header alias match inside a longer word", () => {
    const mapping = guessImportMapping(["income", "out", "transaction date", "description"]);
    expect(mapping.credit).toBeNull();
  });

  it("resolves preset exact words before loose matches", () => {
    const preset = {
      id: "test",
      provider: "test",
      kind: "bank",
      label: { he: "test", en: "test" },
      fileHints: [],
      headerHints: [],
      dateOrder: "dmy",
      signConvention: "bankSigned",
      mappingWords: { description: ["merchant name", "merchant", "description"] },
    } as ImportPreset;
    const mapping = presetMapping(preset, ["merchant name extended", "description"]);
    expect(mapping.description).toBe(1);
  });

  it("detects a mixed card file by refund wording", () => {
    const mapping = guessImportMapping(["Date", "Description", "Amount"]);
    expect(
      detectSignConvention({
        amounts: [120, -30],
        mapping,
        accountKind: "card",
        rows: [
          { amount: 120, description: "Supermarket" },
          { amount: -30, description: "Store refund" },
        ],
      }),
    ).toBe("cardPositive");
    expect(
      detectSignConvention({
        amounts: [-120, 30],
        mapping,
        accountKind: "card",
        rows: [
          { amount: -120, description: "Supermarket" },
          { amount: 30, description: "Store refund" },
        ],
      }),
    ).toBe("cardNegative");
  });

  it("clamps a hostile HTML colspan", () => {
    const rows = parseHtmlTableAdvanced(`<table><tr><td colspan="99999999">A</td></tr></table>`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1000);
  });

  it("keeps a DR marker as an expense in pasted text", () => {
    const parsed = parseStatementText("01/02/2024 Shop 50.00 DR");
    expect(parsed.rows[0]).toMatchObject({ amount: 50, kind: "expense" });
  });

  it("keeps a DR marker that follows a currency suffix", () => {
    const parsed = parseStatementText("01/02/2024 Shop 50.00 ILS DR");
    expect(parsed.rows[0]).toMatchObject({ amount: 50, kind: "expense" });
  });
});

describe("debit/credit editing", () => {
  it("uses the amount cell when both raw debit/credit cells are blank", () => {
    const result = normalizeImportRow(
      {
        rowIndex: 1,
        include: true,
        date: "2024-02-01",
        processedDate: null,
        description: "Coffee",
        amount: "42",
        kind: "auto",
        accountId: 1,
        accountRaw: "",
        categoryId: null,
        categoryName: null,
        categoryRaw: null,
        tags: [],
        owner: null,
        businessSharePct: 0,
        memo: null,
        originalAmount: null,
        originalCurrency: null,
        installmentNumber: null,
        installmentTotal: null,
        identifier: null,
        balance: null,
        debit: null,
        credit: null,
        sourceRef: "test#1",
      },
      {
        dateOrder: "dmy",
        signConvention: "explicit",
        accountKind: "bank",
        accountId: 1,
        accountCurrency: "ILS",
      },
    );
    expect(result.row).toMatchObject({ amount: 42, signedAmount: 42, kind: "income" });
  });

  it("rejects a nonblank debit that cannot be parsed instead of using the amount", () => {
    const result = normalizeImportRow(
      {
        rowIndex: 1,
        include: true,
        date: "2024-02-01",
        processedDate: null,
        description: "Coffee",
        amount: "42",
        kind: "auto",
        accountId: 1,
        accountRaw: "",
        categoryId: null,
        categoryName: null,
        categoryRaw: null,
        tags: [],
        owner: null,
        businessSharePct: 0,
        memo: null,
        originalAmount: null,
        originalCurrency: null,
        installmentNumber: null,
        installmentTotal: null,
        identifier: null,
        balance: null,
        debit: "invalid",
        credit: null,
        sourceRef: "test#1",
      },
      {
        dateOrder: "dmy",
        signConvention: "explicit",
        accountKind: "bank",
        accountId: 1,
        accountCurrency: "ILS",
      },
    );
    expect(result.row).toBeNull();
    expect(result.reasons.map((reason) => reason.code)).toContain("amountInvalid");
  });

  it("keeps a mapped amount authoritative when debit and credit are also mapped", () => {
    const mapping = guessImportMapping(["תאריך", "תיאור", "סכום", "חובה", "זכות"]);
    expect(mapping).toMatchObject({ amount: 2, debit: 3, credit: 4 });
    const { drafts } = tableToDrafts([["01/02/2024", "Shop", "100", "20", "0"]], mapping);
    expect(drafts[0].amount).toBe("100");
    expect(drafts[0].debit).toBeUndefined();
    expect(drafts[0].credit).toBeUndefined();
    const result = normalizeImportRow(drafts[0], {
      dateOrder: "dmy",
      signConvention: "bankSigned",
      accountKind: "bank",
      accountId: 1,
      accountCurrency: "ILS",
    });
    expect(result.row).toMatchObject({ amount: 100 });
  });

  it("falls back to debit/credit when the mapped amount cell is blank", () => {
    const mapping = guessImportMapping(["תאריך", "תיאור", "סכום", "חובה", "זכות"]);
    const { drafts } = tableToDrafts(
      [
        ["01/02/2024", "Shop", "", "20", ""],
        ["02/02/2024", "Refund", "", "0", "125"],
      ],
      mapping,
    );
    expect(drafts[0]).toMatchObject({ amount: "", debit: "20", credit: "" });
    expect(debitCreditFor([["d", "x", "100", "20", "0"]], 1, mapping)).toEqual({});
    expect(debitCreditFor([["d", "x", "", "20", "0"]], 1, mapping)).toEqual({
      debit: "20",
      credit: "0",
    });
    const context = {
      dateOrder: "dmy" as const,
      signConvention: "explicit" as const,
      accountKind: "bank" as const,
      accountId: 1,
      accountCurrency: "ILS",
    };
    expect(normalizeImportRow(drafts[0], context).row).toMatchObject({
      amount: 20,
      signedAmount: -20,
      kind: "expense",
    });
    expect(normalizeImportRow(drafts[1], context).row).toMatchObject({
      amount: 125,
      signedAmount: 125,
      kind: "income",
    });
  });
});

describe("workbench account and balance helpers", () => {
  it("clears only the server-stamped default account", () => {
    const { drafts } = tableToDrafts(
      [
        ["01/02/2024", "A", "-10"],
        ["02/02/2024", "B", "-20"],
      ],
      guessImportMapping(["תאריך", "תיאור", "סכום"]),
      { defaultAccountId: 7 },
    );
    drafts[1].accountId = 8;
    const cleared = clearDefaultAccountStamp(drafts, 7);
    expect(cleared.map((row) => row.accountId)).toEqual([null, 8]);
  });

  it("attaches the statement balance to the account of the balance row", () => {
    const rows = [
      { rowIndex: 4, accountId: 8 },
      { rowIndex: 5, accountId: 7 },
    ];
    expect(statementBalanceAccount({ rowIndex: 0 }, 2, rows, 9)).toBe(8);
    expect(statementBalanceAccount({ rowIndex: 9 }, 2, rows, 9)).toBe(9);
    expect(statementBalanceAccount(null, 2, rows, 9)).toBeNull();
  });
});
