import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-receipts-"));
});

const ctx = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
const upload = (type: string, body = "%PDF-1.4 test") => {
  const form = new FormData();
  form.append("file", new File([body], "חשבונית מרץ.pdf", { type }));
  return new Request("http://127.0.0.1/api/x", { method: "POST", body: form });
};

describe("transaction receipts", () => {
  it("stores, lists, streams and deletes a receipt, and refuses bad input", async () => {
    const { getDb } = await import("@/server/db");
    const { getWorkspaceIdFromRequest } = await import("@/server/lib/workspace-context");
    const db = getDb();
    const ws = getWorkspaceIdFromRequest(new Request("http://127.0.0.1/"));
    const sync = Number(
      db
        .prepare(
          "INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at) VALUES (?,'hapoalim','completed','2026-01-01','2026-11-01')",
        )
        .run(ws).lastInsertRowid,
    );
    const txn = Number(
      db
        .prepare(
          "INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind) VALUES (?,'123','2026-11-01','2026-11-01',-100,'ILS',-100,'Shop','normal','completed','hapoalim',?,'r1','expense')",
        )
        .run(ws, sync).lastInsertRowid,
    );

    const list = await import("@/app/api/transactions/[id]/receipts/route");
    const one = await import("@/app/api/receipts/[id]/route");
    expect((await list.POST(upload("text/html"), ctx(txn))).status).toBe(415);
    expect((await list.POST(upload("application/pdf"), ctx(999999))).status).toBe(404);
    expect((await list.POST(upload("application/pdf"), ctx("abc"))).status).toBe(400);

    const created = await (await list.POST(upload("application/pdf"), ctx(txn))).json();
    expect(created.originalName).toBe("חשבונית מרץ.pdf");
    const { receipts } = await (await list.GET(new Request("http://127.0.0.1/"), ctx(txn))).json();
    expect(receipts).toHaveLength(1);

    const file = await one.GET(new Request("http://127.0.0.1/"), ctx(created.id));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.4 test");

    expect(
      (await one.DELETE(new Request("http://127.0.0.1/", { method: "DELETE" }), ctx(created.id)))
        .status,
    ).toBe(200);
    expect((await one.GET(new Request("http://127.0.0.1/"), ctx(created.id))).status).toBe(404);
  });
});
describe("receipt cleanup on batch undo", () => {
  it("removes receipt records in the undo transaction and deletes files after commit", async () => {
    const { getDb } = await import("@/server/db");
    const { getWorkspaceIdFromRequest } = await import("@/server/lib/workspace-context");
    const { createImportBatch, createLegacySyncRun, deleteImportBatch } =
      await import("@/server/db/queries/imports");
    const { addReceipt, receiptFile } = await import("@/server/db/queries/receipts");
    const db = getDb();
    const ws = getWorkspaceIdFromRequest(new Request("http://127.0.0.1/"));
    const sync = createLegacySyncRun(ws, "undo.csv");
    const batchId = createImportBatch({
      workspaceId: ws,
      accountId: null,
      syncRunId: sync,
      origin: "upload",
      fileName: "undo.csv",
    });
    const txn = Number(
      db
        .prepare(
          "INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind,origin,import_batch_id) VALUES (?,'123','2026-11-01','2026-11-01',-100,'ILS',-100,'Shop','normal','completed','file',?,'undo-r1','expense','file',?)",
        )
        .run(ws, sync, batchId).lastInsertRowid,
    );
    const receipt = addReceipt(ws, txn, {
      name: "receipt.pdf",
      mime: "application/pdf",
      data: Buffer.from("%PDF-1.4"),
    })!;
    const file = receiptFile(ws, receipt);
    expect(file && fs.existsSync(file)).toBe(true);

    const undone = deleteImportBatch(ws, batchId);
    expect(undone.removed).toBe(1);
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM transaction_receipts WHERE transaction_id = ?")
        .get(txn),
    ).toEqual({ n: 0 });
    expect(file && fs.existsSync(file)).toBe(false);
    expect(db.prepare("SELECT COUNT(*) AS n FROM pending_file_cleanup").get()).toEqual({ n: 0 });
  });
});

describe("receipt cleanup fairness", () => {
  it("does not let permanently failing paths starve later cleanup entries", async () => {
    const { getDb } = await import("@/server/db");
    const { processFileCleanup } = await import("@/server/db/queries/receipts");
    const { dataDir } = await import("@/server/lib/data-dir");
    const db = getDb();
    db.prepare("DELETE FROM pending_file_cleanup").run();
    const root = path.join(dataDir(), "receipts");
    fs.mkdirSync(root, { recursive: true });
    for (let i = 0; i < 200; i++) {
      const blocked = path.join(root, `blocked-${i}`);
      fs.mkdirSync(blocked, { recursive: true });
      fs.writeFileSync(path.join(blocked, "child.txt"), "x");
      db.prepare("INSERT INTO pending_file_cleanup (path) VALUES (?)").run(blocked);
    }
    const removable = path.join(root, "removable.txt");
    fs.writeFileSync(removable, "x");
    db.prepare("INSERT INTO pending_file_cleanup (path) VALUES (?)").run(removable);

    expect(processFileCleanup(200)).toBe(0);
    expect(fs.existsSync(removable)).toBe(true);
    // The failed paths now have an attempt; the untouched entry is tried first next sweep.
    expect(processFileCleanup(200)).toBe(1);
    expect(fs.existsSync(removable)).toBe(false);
  });
});

describe("receipt cleanup path guard", () => {
  it("does not unlink files outside the receipts directory", async () => {
    const { getDb } = await import("@/server/db");
    const { processFileCleanup } = await import("@/server/db/queries/receipts");
    const victim = path.join(os.tmpdir(), `penny-cleanup-victim-${Date.now()}.txt`);
    fs.writeFileSync(victim, "keep me");
    getDb().prepare("INSERT INTO pending_file_cleanup (path) VALUES (?)").run(victim);
    processFileCleanup();
    expect(fs.existsSync(victim)).toBe(true);
    expect(
      getDb().prepare("SELECT COUNT(*) AS n FROM pending_file_cleanup WHERE path = ?").get(victim),
    ).toEqual({ n: 0 });
    fs.rmSync(victim, { force: true });
  });
});
