import { describe, expect, it } from "vitest";
import { assetKey, INTERACTIVE, isPensionFund, LOGIN_FIELDS, savingsType } from "@/lib/pension";
import { readStatementTable } from "@/lib/file-import";
import { SYNC_ERRORS } from "@/lib/sync-errors";
import {
  parseAltshulerCards,
  parseExcellenceCash,
  parseExcellenceRows,
  parseHarelCards,
  parseMoney,
  parsePhoenixCards,
} from "@/server/pension/parsers";

const ID = "012345678";

describe("pension helpers", () => {
  it("maps portal labels to asset types", () => {
    expect(savingsType("קרן השתלמות")).toBe("study_fund");
    expect(savingsType("קופת גמל להשקעה")).toBe("provident");
    expect(savingsType("קרן פנסיה מקיפה")).toBe("pension");
  });
  it("knows which funds are wired and what they ask for", () => {
    expect(isPensionFund("meitav")).toBe(true);
    expect(isPensionFund("altshuler")).toBe(true);
    expect(isPensionFund("phoenix")).toBe(true);
    expect(isPensionFund("excellence")).toBe(true);
    expect(isPensionFund("yelin")).toBe(false);
    expect(LOGIN_FIELDS.altshuler).toEqual(["id", "phone"]);
    expect(LOGIN_FIELDS.excellence).toEqual(["username", "password"]);
    expect(INTERACTIVE.excellence).toBe(false);
  });
  it("builds a stable asset key", () => {
    expect(assetKey("excellence", "123")).toBe("pension:excellence:123");
    expect(assetKey(3, "123")).toBe("pension:3:123");
  });
});

describe("parseMoney", () => {
  it("reads currency, grouping, minus signs and brackets", () => {
    expect(parseMoney("₪ 245,600.00")).toEqual({ amount: 245600, currency: "ILS" });
    expect(parseMoney("$1,250.50")).toEqual({ amount: 1250.5, currency: "USD" });
    expect(parseMoney("-₪ 500")).toEqual({ amount: -500, currency: "ILS" });
    expect(parseMoney("(500 ₪)")).toEqual({ amount: -500, currency: "ILS" });
    expect(parseMoney("−1,000")).toEqual({ amount: -1000, currency: "ILS" });
    expect(parseMoney("אין נתונים")).toBeNull();
  });
});

describe("Altshuler Shaham cards", () => {
  it("makes one asset per card, with unique keys even without an account number", () => {
    const out = parseAltshulerCards([
      { accNum: "12345", trackName: "גמל להשקעה S&P 500", amount: "₪ 50,000.00" },
      { accNum: "", trackName: "השתלמות כללי", amount: "₪ 20,000" },
      { accNum: "", trackName: "", amount: "₪ 1,000" },
      { accNum: "12345", trackName: "מסלול נוסף", amount: "(300 ₪)" },
    ]);
    expect(out.success).toBe(true);
    expect(out.accounts.map((a) => a.accountNumber)).toEqual([
      "12345",
      "card2",
      "card3",
      "12345-4",
    ]);
    expect(out.accounts.map((a) => a.balance)).toEqual([50000, 20000, 1000, -300]);
    expect(savingsType(out.accounts[0].label ?? "")).toBe("provident");
  });
  it("never puts the ID number in a key or label", () => {
    const out = parseAltshulerCards([{ accNum: "", trackName: "", amount: "₪ 10" }]);
    expect(JSON.stringify(out)).not.toContain(ID);
  });
  it("fails when the page had no cards (still on the login page)", () => {
    expect(parseAltshulerCards([])).toEqual({
      success: false,
      accounts: [],
      errorMessage: SYNC_ERRORS.pensionNoData,
    });
  });
  it("fails instead of saving part of the products when a card cannot be read", () => {
    const out = parseAltshulerCards([
      { accNum: "1", trackName: "", amount: "₪ 10" },
      { accNum: "2", trackName: "", amount: "" },
    ]);
    expect(out).toMatchObject({ success: false, errorMessage: SYNC_ERRORS.pensionIncomplete });
  });
});

describe("Phoenix cards", () => {
  const card = (accountNumber: string, amount = "₪12,345") => ({
    name: "קרן השתלמות",
    accountNumber,
    text: `מספר חשבון ${accountNumber} סכום חיסכון ${amount} הפקדה אחרונה ₪1,000.201.01.2025 מועד נזילות 01.01.2030 ד.נ הפקדה 0% ד.נ חיסכון 0.5% מעמד שכירפירוט`,
  });
  it("reads balance, fees, last deposit and status", () => {
    const out = parsePhoenixCards([card("001-234-567890 (12345678)")]);
    expect(out.success).toBe(true);
    expect(out.accounts[0]).toMatchObject({
      accountNumber: "001-234-567890 (12345678)",
      label: "הפניקס - קרן השתלמות",
      balance: 12345,
      currency: "ILS",
      monthlyDeposit: 1000.2,
      feeDeposit: 0,
      feeBalance: 0.5,
      details: {
        liquidityDate: "01.01.2030",
        status: "שכיר",
        lastDeposit: { amount: 1000.2, date: "01.01.2025" },
      },
    });
    expect(savingsType(out.accounts[0].label ?? "")).toBe("study_fund");
  });
  it("keys cards without an account number by position", () => {
    const out = parsePhoenixCards([card(""), card("")]);
    expect(out.accounts.map((a) => a.accountNumber)).toEqual(["card1", "card2"]);
  });
  it("fails when a card has no savings amount", () => {
    const broken = { ...card("1"), text: "מספר חשבון 1 סכום חיסכון —" };
    expect(parsePhoenixCards([card("2"), broken])).toMatchObject({
      success: false,
      errorMessage: SYNC_ERRORS.pensionIncomplete,
    });
    expect(parsePhoenixCards([])).toMatchObject({ success: false });
  });
});

describe("Excellence Trade export", () => {
  it("makes one asset per holding, skips totals and adds the cash balance", () => {
    const out = parseExcellenceRows(
      [
        ["דוח תיק"],
        ["שם נייר", "סימול", "כמות", "שווי שוק", "עלות", "מטבע"],
        ["תכלית S&P 500", "1159250", "100", "50,000", "42,000", "ILS"],
        ['סה"כ', "", "", "50,000", "", "ILS"],
      ],
      500,
    );
    expect(out.success).toBe(true);
    expect(out.accounts).toHaveLength(2);
    expect(out.accounts[0]).toMatchObject({
      accountNumber: "1159250",
      label: "אקסלנס - תכלית S&P 500",
      balance: 50000,
      currency: "ILS",
      assetType: "stock",
      quantity: 100,
      costBasis: 42000,
    });
    // No symbol: a symbol would make the asset reprice live from Yahoo and drop the scraped value.
    expect(out.accounts[0]).not.toHaveProperty("symbol");
    expect(out.accounts[1]).toMatchObject({ accountNumber: "available-cash", balance: 500 });
  });
  it("does not take a per-unit price as the cost basis", () => {
    const out = parseExcellenceRows(
      [
        ["שם נייר", "כמות", "שער קנייה", "שווי שוק"],
        ["טבע", "10", "3,500", "40,000"],
      ],
      null,
    );
    expect(out.accounts[0].costBasis).toBeNull();
  });
  it("treats an ILS value column as shekels, whatever the security's currency", () => {
    const out = parseExcellenceRows(
      [
        ["שם נייר", "מטבע", 'שווי בש"ח', "עלות"],
        ["Apple", "USD", "37,000", "2,000"],
      ],
      null,
    );
    expect(out.accounts[0]).toMatchObject({ balance: 37000, currency: "ILS" });
    // The cost column is in the security's currency here, so it is not mixed into a shekel value.
    expect(out.accounts[0].costBasis).toBeNull();
  });
  it("keeps the USD currency when the value is in dollars", () => {
    const out = parseExcellenceRows(
      [
        ["שם נייר", "מטבע", "שווי שוק", "עלות"],
        ["Apple", "USD", "(1,000)", "900"],
      ],
      null,
    );
    expect(out.accounts[0]).toMatchObject({ balance: -1000, currency: "USD", costBasis: 900 });
  });
  it("gives same-name holdings without a symbol their own keys", () => {
    const out = parseExcellenceRows(
      [
        ["שם נייר", "שווי"],
        ["אג״ח", "1"],
        ["אג״ח", "2"],
      ],
      null,
    );
    expect(out.accounts.map((a) => a.accountNumber)).toEqual(["אג״ח", "אג״ח-2"]);
  });
  it("does not add the cash balance twice when the export has a cash row", () => {
    const out = parseExcellenceRows(
      [
        ["שם נייר", "שווי"],
        ["מזומן", "500"],
      ],
      500,
    );
    expect(out.accounts).toHaveLength(1);
  });
  it("fails on a login page or an unreadable row instead of saving a total", async () => {
    const loginPage = new TextEncoder().encode(
      '<html><body><form><input id="login-input"><input id="password-input"></form>שווי תיק ₪ 100,000</body></html>',
    );
    const rows = await readStatementTable(loginPage, "export.csv");
    expect(parseExcellenceRows(rows, 500)).toMatchObject({
      success: false,
      accounts: [],
      errorMessage: SYNC_ERRORS.pensionExportFailed,
    });
    expect(
      parseExcellenceRows(
        [
          ["שם נייר", "שווי"],
          ["טבע", "—"],
        ],
        null,
      ),
    ).toMatchObject({ success: false, errorMessage: SYNC_ERRORS.pensionIncomplete });
  });
  it("reads the cash balance from the top bar", () => {
    expect(parseExcellenceCash("שווי תיק ₪ 100,000.50 יתרה לפעילות ₪ 1,500.25")).toBe(1500.25);
    expect(parseExcellenceCash("שווי תיק ₪ 100")).toBeNull();
  });
  it("parses Harel pension and study-fund tiles", () => {
    const out = parseHarelCards([
      { name: "קרנות פנסיה", amount: "₪ 100,000" },
      { name: "השתלמות", amount: "₪ 20,000" },
    ]);
    expect(out.success).toBe(true);
    expect(out.accounts).toHaveLength(2);
    expect(out.accounts[0]).toMatchObject({ label: "הראל - קרנות פנסיה", balance: 100000 });
    expect(out.accounts[1]).toMatchObject({ label: "הראל - השתלמות", balance: 20000 });
  });
});
