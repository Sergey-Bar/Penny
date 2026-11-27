import { describe, expect, it } from "vitest";
import { classifyKind, type ClassifyInput } from "@/lib/import/classify";

const input = (overrides: Partial<ClassifyInput> = {}): ClassifyInput => ({
  description: "שופרסל",
  rawSigned: -100,
  amount: 100,
  explicitKind: "auto",
  accountKind: "bank",
  signConvention: "bankSigned",
  hasCardCoverage: false,
  hasTransferPair: false,
  ...overrides,
});

describe("classifyKind", () => {
  it("honours the user and rule first", () => {
    expect(classifyKind(input({ explicitKind: "income" }))).toMatchObject({
      kind: "income",
      kindSource: "user",
    });
    expect(classifyKind(input({ explicitKind: "refund" }))).toMatchObject({
      kind: "expense",
      refund: true,
      kindSource: "user",
    });
    expect(classifyKind(input({ ruleKind: "transfer" }))).toMatchObject({
      kind: "transfer",
      kindSource: "rule",
    });
  });

  it("uses debit/credit columns before sign", () => {
    expect(
      classifyKind(input({ debitCreditKind: "income", rawSigned: 50, amount: 50 })),
    ).toMatchObject({ kind: "income", kindSource: "column" });
    expect(
      classifyKind(input({ debitCreditKind: "expense", rawSigned: -50, amount: 50 })),
    ).toMatchObject({ kind: "expense", kindSource: "column" });
  });

  it("classifies a card charge as expense and a refund as positive expense", () => {
    const card = { accountKind: "card" as const, signConvention: "cardPositive" as const };
    expect(
      classifyKind(input({ ...card, rawSigned: 12, amount: 12, description: "קפה" })),
    ).toMatchObject({
      kind: "expense",
      refund: false,
    });
    expect(
      classifyKind(input({ ...card, rawSigned: 12, amount: 12, description: "זיכוי בית עסק" })),
    ).toMatchObject({ kind: "expense", refund: true });
  });

  it("keeps a negative bank row an expense", () => {
    expect(classifyKind(input())).toMatchObject({ kind: "expense", kindSource: "sign" });
  });

  it("turns a salary credit into income, never a transfer", () => {
    expect(
      classifyKind(input({ description: "משכורת ינואר", rawSigned: 9000, amount: 9000 })),
    ).toMatchObject({ kind: "income", kindSource: "pattern" });
    expect(
      classifyKind(input({ description: "החזר מס", rawSigned: 300, amount: 300 })),
    ).toMatchObject({ kind: "income" });
  });

  it("treats a loan deposit as a transfer and a repayment as an expense", () => {
    expect(
      classifyKind(input({ description: "הלוואה מבנק", rawSigned: 5000, amount: 5000 })),
    ).toMatchObject({ kind: "transfer", reasons: [{ code: "loanTransfer" }] });
    expect(classifyKind(input({ description: "החזר הלוואה" }))).toMatchObject({
      kind: "expense",
    });
  });

  it("only turns a card bill into a transfer when a card explains it", () => {
    const bill = {
      description: "חיוב כרטיס ויזה 1234",
      rawSigned: -4000,
      amount: 4000,
    };
    expect(classifyKind(input({ ...bill, hasCardCoverage: true }))).toMatchObject({
      kind: "transfer",
      reasons: [{ code: "cardBillTransfer" }],
    });
    expect(classifyKind(input({ ...bill, hasCardCoverage: false }))).toMatchObject({
      kind: "expense",
      needsReview: true,
      transferSuggested: true,
    });
  });

  it("does not hide a Bit transfer without a pair", () => {
    expect(
      classifyKind(input({ description: "ביט לדני", rawSigned: -80, amount: 80 })),
    ).toMatchObject({ kind: "expense", needsReview: true, transferSuggested: true });
    expect(
      classifyKind(
        input({ description: "ביט לדני", rawSigned: -80, amount: 80, hasTransferPair: true }),
      ),
    ).toMatchObject({ kind: "transfer" });
  });

  it("treats a bank credit that is not salary or a loan as a refund", () => {
    expect(
      classifyKind(input({ description: "זיכוי רכישה", rawSigned: 45, amount: 45 })),
    ).toMatchObject({ kind: "expense", refund: true, kindSource: "pattern" });
  });

  it("asks for review instead of guessing on an all-positive bank file", () => {
    expect(
      classifyKind(
        input({
          rawSigned: 100,
          amount: 100,
          description: "unknown merchant",
          signConvention: "unknown",
          allPositive: true,
        }),
      ),
    ).toMatchObject({ kind: "expense", needsReview: true, reasons: [{ code: "signAmbiguous" }] });
  });

  it("has a safe zero-amount fallback", () => {
    expect(classifyKind(input({ rawSigned: 0, amount: 0 }))).toMatchObject({
      kind: "expense",
      needsReview: true,
      confidence: 0,
    });
  });
});
