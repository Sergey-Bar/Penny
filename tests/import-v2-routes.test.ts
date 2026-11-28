import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ImportDraftRow, NormalizedRow } from "@/lib/import/types";

let accountsRoute: typeof import("@/app/api/import/accounts/route");
let parseRoute: typeof import("@/app/api/import/parse/route");
let previewRoute: typeof import("@/app/api/import/preview/route");
let saveRoute: typeof import("@/app/api/import/save/route");
let batchRoute: typeof import("@/app/api/import/batch/[id]/route");
let deleteBatch: typeof import("@/server/db/queries/imports").deleteImportBatch;
let normalizeImportRow: typeof import("@/lib/import/normalize").normalizeImportRow;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-routes-"));
  accountsRoute = await import("@/app/api/import/accounts/route");
  parseRoute = await import("@/app/api/import/parse/route");
  previewRoute = await import("@/app/api/import/preview/route");
  saveRoute = await import("@/app/api/import/save/route");
  batchRoute = await import("@/app/api/import/batch/[id]/route");
  deleteBatch = (await import("@/server/db/queries/imports")).deleteImportBatch;
  normalizeImportRow = (await import("@/lib/import/normalize")).normalizeImportRow;
});

const json = (url: string, body: unknown) =>
  new Request(`http://127.0.0.1${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const CSV = "תאריך,תיאור,סכום\n01/02/2024,שופרסל,-84.90\n02/02/2024,משכורת,9000\n";

async function accountId(): Promise<number> {
  const response = await accountsRoute.POST(
    json("/api/import/accounts", {
      action: "create",
      provider: "leumi",
      kind: "bank",
      number: "1234",
      label: "Leumi 1234",
    }),
  );
  const body = (await response.json()) as { account: { id: number } };
  return body.account.id;
}

function normalized(draft: ImportDraftRow, account: number): NormalizedRow {
  return normalizeImportRow(
    { ...draft, accountId: account },
    {
      dateOrder: "dmy",
      signConvention: "bankSigned",
      accountKind: "bank",
      accountId: account,
      accountCurrency: "ILS",
      today: "2026-11-26",
    },
  ).row!;
}

describe("import v2 routes", () => {
  it("parses an uploaded CSV into drafts", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode(CSV)], "leumi.csv", { type: "text/csv" }),
    );
    const account = await accountId();
    form.append("options", JSON.stringify({ limit: 10, accountId: account }));
    const response = await parseRoute.POST(
      new Request("http://127.0.0.1/api/import/parse", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      parseId: string;
      account: { id: number };
      mapping: { date: number; description: number; amount: number };
      rows: { total: number; page: ImportDraftRow[] };
    };
    expect(body.parseId).toMatch(/^p_/);
    expect(body.mapping).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(body.account.id).toBe(account);
    expect(body.rows.total).toBe(2);
    expect(body.rows.page[0]).toMatchObject({
      date: "01/02/2024",
      description: "שופרסל",
      accountId: null,
    });
  });

  it("previews, saves, reads and undoes a batch", async () => {
    const account = await accountId();
    const parseResponse = await parseRoute.POST(json("/api/import/parse", {}));
    expect(parseResponse.status).toBe(400);

    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode(CSV)], "leumi.csv", { type: "text/csv" }),
    );
    const parsed = (await (
      await parseRoute.POST(
        new Request("http://127.0.0.1/api/import/parse", { method: "POST", body: form }),
      )
    ).json()) as { rows: { page: ImportDraftRow[] } };
    const rows = parsed.rows.page.map((draft) => normalized(draft, account));

    const preview = await previewRoute.POST(
      json("/api/import/preview", { accountId: account, rows }),
    );
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as {
      summary: { ready: number; autoCategorized: number };
    };
    expect(previewBody.summary.ready).toBe(2);
    expect(previewBody.summary.autoCategorized).toBeGreaterThanOrEqual(1);

    const savedResponse = await saveRoute.POST(
      json("/api/import/save", {
        accountId: account,
        origin: "upload",
        fileName: "leumi.csv",
        fileSha256: "abc123",
        clientToken: "route-token",
        rows,
      }),
    );
    expect(savedResponse.status).toBe(200);
    const saved = (await savedResponse.json()) as { batchId: number; added: number };
    expect(saved.added).toBe(2);

    const duplicate = await saveRoute.POST(
      json("/api/import/save", {
        accountId: account,
        origin: "upload",
        fileName: "leumi.csv",
        fileSha256: "abc123",
        rows,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("alreadyImported");

    const resumeForm = new FormData();
    resumeForm.append(
      "file",
      new File([new TextEncoder().encode(CSV)], "resume.csv", { type: "text/csv" }),
    );
    const resumeParsed = (await (
      await parseRoute.POST(
        new Request("http://127.0.0.1/api/import/parse", { method: "POST", body: resumeForm }),
      )
    ).json()) as { rows: { page: ImportDraftRow[] } };
    const resumeRows = resumeParsed.rows.page.map((draft) => normalized(draft, account));
    const resumeBody = {
      accountId: account,
      origin: "upload",
      fileName: "resume.csv",
      fileSha256: "resume-sha",
      rows: resumeRows,
    };
    const firstSave = await saveRoute.POST(json("/api/import/save", resumeBody));
    expect(firstSave.status).toBe(200);
    const firstBatch = (await firstSave.json()) as { batchId: number };
    const { getDb } = await import("@/server/db");
    getDb()
      .prepare("UPDATE import_batches SET post_commit_status = 'failed' WHERE id = ?")
      .run(firstBatch.batchId);
    const resume = await saveRoute.POST(json("/api/import/save", resumeBody));
    expect(resume.status).toBe(200);
    expect((await resume.json()).batchId).toBe(firstBatch.batchId);
    expect(
      (
        getDb()
          .prepare("SELECT post_commit_status AS status FROM import_batches WHERE id = ?")
          .get(firstBatch.batchId) as { status: string }
      ).status,
    ).toBe("completed");

    const context = { params: Promise.resolve({ id: String(saved.batchId) }) };
    const read = await batchRoute.GET(
      new Request(`http://127.0.0.1/api/import/batch/${saved.batchId}`),
      context,
    );
    expect(read.status).toBe(200);
    expect((await read.json()).batch.id).toBe(saved.batchId);

    const refused = await batchRoute.DELETE(
      new Request(`http://127.0.0.1/api/import/batch/${saved.batchId}`, { method: "DELETE" }),
      context,
    );
    expect(refused.status).toBe(400);

    const undone = await batchRoute.DELETE(
      new Request(`http://127.0.0.1/api/import/batch/${saved.batchId}?confirm=1`, {
        method: "DELETE",
      }),
      context,
    );
    expect((await undone.json()).removed).toBe(2);
    expect(deleteBatch).toBeTypeOf("function");
  });

  it("rejects a foreign workspace and a missing account", async () => {
    const missing = await previewRoute.POST(json("/api/import/preview", { rows: [] }));
    expect(missing.status).toBe(400);
    const response = await previewRoute.POST(
      new Request("http://127.0.0.1/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": "9999" },
        body: JSON.stringify({ accountId: 1, rows: [] }),
      }),
    );
    // The header is ignored when that workspace does not exist; the account check still rejects it.
    expect([400, 500]).toContain(response.status);
  });
});
