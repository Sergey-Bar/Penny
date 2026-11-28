import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/lib/api-error";
import {
  coerceNormalizedRows,
  readBoundedBytes,
  readBoundedJson,
} from "@/server/lib/import/request";
import type { NormalizedRow } from "@/lib/import/types";

const base = (overrides: Partial<NormalizedRow> = {}): NormalizedRow => ({
  rowIndex: 1,
  date: "2024-03-05",
  processedDate: "2024-03-05",
  description: "Coffee",
  amount: 50,
  kind: "expense",
  signedAmount: -50,
  refund: false,
  accountId: 1,
  categoryId: null,
  categorySource: "none",
  tags: [],
  owner: null,
  businessSharePct: 0,
  memo: null,
  originalAmount: 50,
  originalCurrency: "ILS",
  installmentNumber: null,
  installmentTotal: null,
  identifier: null,
  balance: null,
  kindSource: "sign",
  confidence: 0.9,
  reasons: [],
  ...overrides,
});

const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the call to throw");
};

describe("import row coercion", () => {
  it("rejects duplicate row indexes", () => {
    const error = failure(() =>
      coerceNormalizedRows([base({ rowIndex: 1 }), base({ rowIndex: 1 })]),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe("duplicateRowIndex");
  });

  it("rejects a non-finite signed amount", () => {
    expect(failure(() => coerceNormalizedRows([base({ signedAmount: Number.NaN })])).status).toBe(
      400,
    );
    expect(
      failure(() => coerceNormalizedRows([base({ signedAmount: Number.POSITIVE_INFINITY })]))
        .status,
    ).toBe(400);
  });

  it("rejects signed amounts that contradict kind and refund", () => {
    expect(failure(() => coerceNormalizedRows([base({ signedAmount: 50 })])).status).toBe(400);
    expect(
      failure(() => coerceNormalizedRows([base({ refund: true, signedAmount: -50 })])).status,
    ).toBe(400);
    expect(
      failure(() => coerceNormalizedRows([base({ kind: "income", signedAmount: -50 })])).status,
    ).toBe(400);
    expect(
      coerceNormalizedRows([base({ kind: "transfer", signedAmount: -50, accountId: 1 })])[0]
        .signedAmount,
    ).toBe(-50);
  });

  it("rejects a row account that differs from the destination", () => {
    const error = failure(() => coerceNormalizedRows([base({ accountId: 2 })], { accountId: 1 }));
    expect(error.status).toBe(400);
    expect(error.code).toBe("accountMismatch");
  });

  it("requires a string kind instead of coercing arrays", () => {
    const row = { ...base(), kind: ["expense"] } as unknown;
    expect(failure(() => coerceNormalizedRows([row])).status).toBe(400);
  });
});

describe("bounded request bodies", () => {
  it("stops reading when actual bytes cross the limit", async () => {
    const request = new Request("http://127.0.0.1/api/import/preview", {
      method: "POST",
      body: new Uint8Array(32),
    });
    request.headers.delete("content-length");
    const error = await readBoundedBytes(request, 16).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(413);
  });

  it("returns 400 for malformed JSON under the cap", async () => {
    const request = new Request("http://127.0.0.1/api/import/preview", {
      method: "POST",
      body: "{not json",
    });
    const error = await readBoundedJson(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });
});
