import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { headerFingerprint } from "@/lib/file-import";

describe("import profile fingerprint", () => {
  it("ignores invisible direction marks and BOM that Hebrew exports add", () => {
    expect(headerFingerprint(["﻿תאריך", "‏תיאור‏", "‫סכום‬"])).toBe(
      headerFingerprint(["תאריך", "תיאור", "סכום"]),
    );
  });
});

describe("import history and undo", () => {
  let ws: number;
  beforeAll(async () => {
    process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-hist-"));
    const db = (await import("@/server/db/index")).getDb();
    ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  });

  it("undoing the second import leaves the first one's rows, even the overlapping ones", async () => {
    const q = await import("@/server/db/queries/transactions");
    const { getDb } = await import("@/server/db/index");
    const rows = [
      { date: "2026-03-01", description: "שופרסל", amount: -120, seq: 0 },
      { date: "2026-03-02", description: "פז", amount: -200, seq: 0 },
    ];
    const first = q.insertFileImport(ws, "1234", rows, "bank", "march.csv");
    const second = q.insertFileImport(
      ws,
      "1234",
      [...rows, { date: "2026-03-05", description: "חשמל", amount: -400, seq: 0 }],
      "bank",
      "march-again.csv",
    );
    expect(second.added).toBe(1); // the overlap is not counted twice
    expect(q.listFileImports(ws).map((h) => [h.fileName, h.rows])).toEqual([
      ["march-again.csv", 1],
      ["march.csv", 2],
    ]);

    expect(q.deleteFileImport(ws + 1, second.batchId)).toBe(0); // another workspace: nothing
    expect(q.deleteFileImport(ws, second.batchId)).toBe(1);
    const left = getDb()
      .prepare("SELECT description FROM transactions WHERE workspace_id=? ORDER BY date")
      .all(ws);
    expect(left).toEqual([{ description: "שופרסל" }, { description: "פז" }]);
    expect(q.listFileImports(ws).map((h) => h.id)).toEqual([first.batchId]);
  });

  it("reclassifies a card bill covered by purchases on the same card", async () => {
    const { getDb } = await import("@/server/db");
    const { insertFileImport } = await import("@/server/db/queries/transactions");
    const { reclassifyWorkspace } = await import("@/server/lib/import/reclassify");
    const db = getDb();
    const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;

    insertFileImport(ws, "Card coverage bank", [
      { date: "2026-04-10", description: "חיוב כרטיס אשראי", amount: -1000, seq: 1 },
    ]);
    reclassifyWorkspace(ws);
    const bill = () =>
      db
        .prepare("SELECT kind FROM transactions WHERE account_number = ?")
        .get("Card coverage bank");
    expect(bill()).toEqual({ kind: "expense" });

    insertFileImport(
      ws,
      "Card coverage card",
      [
        { date: "2026-04-01", description: "Purchase A", amount: -400, seq: 1 },
        { date: "2026-04-03", description: "Purchase B", amount: -600, seq: 1 },
      ],
      "card",
    );
    reclassifyWorkspace(ws);
    expect(bill()).toEqual({ kind: "transfer" });
    reclassifyWorkspace(ws);
    expect(bill()).toEqual({ kind: "transfer" });
  });
});
