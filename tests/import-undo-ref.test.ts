import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let POST: typeof import("@/app/api/import/route").POST;
let DELETE: typeof import("@/app/api/import/route").DELETE;
let listFileImports: typeof import("@/server/db/queries/transactions").listFileImports;
let createLegacySyncRun: typeof import("@/server/db/queries/imports").createLegacySyncRun;
let getImportBatch: typeof import("@/server/db/queries/imports").getImportBatch;
let setImportV2: typeof import("@/server/lib/import/flag").setImportV2;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-undo-"));
  ({ POST, DELETE } = await import("@/app/api/import/route"));
  ({ listFileImports } = await import("@/server/db/queries/transactions"));
  ({ createLegacySyncRun, getImportBatch } = await import("@/server/db/queries/imports"));
  ({ setImportV2 } = await import("@/server/lib/import/flag"));
});

const req = (body: unknown) =>
  new Request("http://127.0.0.1/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const undo = (ref: string) =>
  DELETE(
    new Request(`http://127.0.0.1/api/import?batch=${encodeURIComponent(ref)}`, {
      method: "DELETE",
    }),
  );

const rows = [{ date: "2024-02-01", description: "Coffee", amount: -12.5 }];

describe("import history undo reference", () => {
  it("undos a v2 import through the sync-run reference, not a batch id", async () => {
    setImportV2(1, true);
    // A decoy sync run makes the sync-run id differ from the batch id.
    createLegacySyncRun(1, "older.csv");
    const response = await POST(req({ account: "Test 777", rows, source: "bank" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { batchId: number; added: number };
    expect(body.added).toBe(1);

    const history = listFileImports(1);
    expect(history).toHaveLength(1);
    expect(history[0].ref).toBe(`sync-${history[0].id}`);
    // The bare number would resolve as a batch id; the reference names the sync run.
    expect(history[0].id).not.toBe(body.batchId);

    const result = await undo(history[0].ref);
    expect(result.status).toBe(200);
    expect((await result.json()).removed).toBe(1);
    expect(getImportBatch(1, body.batchId)?.status).toBe("undone");
  });

  it("accepts the same sync-run reference in the legacy branch", async () => {
    setImportV2(1, false);
    const response = await POST(req({ account: "Legacy 888", rows, source: "bank" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { batchId: number; added: number };
    expect(body.added).toBe(1);

    const latest = listFileImports(1)[0];
    expect(latest.id).toBe(body.batchId);
    expect(latest.ref).toBe(`sync-${body.batchId}`);

    const result = await undo(latest.ref);
    expect(result.status).toBe(200);
    expect((await result.json()).removed).toBe(1);
  });

  it("accepts a bare legacy sync-run id when no v2 batch has that id", async () => {
    setImportV2(1, false);
    const response = await POST(req({ account: "Legacy bare", rows, source: "bank" }));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { added: number }).added).toBe(1);

    const latest = listFileImports(1)[0];
    expect(getImportBatch(1, latest.id)).toBeNull();

    setImportV2(1, true);
    const result = await undo(String(latest.id));
    expect(result.status).toBe(200);
    expect((await result.json()).removed).toBe(1);
    expect(listFileImports(1).some((row) => row.id === latest.id)).toBe(false);
  });
});
