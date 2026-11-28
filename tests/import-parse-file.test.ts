import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let parseImportFile: typeof import("@/server/lib/import/parse").parseImportFile;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-parse-file-"));
  await import("@/server/db/index");
  ({ parseImportFile } = await import("@/server/lib/import/parse"));
});

afterEach(() => vi.restoreAllMocks());

describe("parseImportFile reads", () => {
  it("reads the whole file before parsing when a single read is short", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-parse-file-src-"));
    const filePath = path.join(dir, "statement.csv");
    const csv = "תאריך,תיאור,סכום\n01/02/2024,שופרסל,-84.90\n02/02/2024,משכורת,9000\n";
    fs.writeFileSync(filePath, csv, "utf8");

    const realOpen = fsp.open;
    vi.spyOn(fsp, "open").mockImplementation(async (...args) => {
      const handle = await realOpen(...args);
      if (String(args[0]) === filePath) {
        const realRead = handle.read.bind(handle);
        handle.read = ((buffer: Buffer, offset: number, length: number, position: number) =>
          realRead(buffer, offset, Math.min(length, 5), position)) as typeof handle.read;
      }
      return handle;
    });

    const result = await parseImportFile(1, {
      path: filePath,
      fileName: "statement.csv",
      size: fs.statSync(filePath).size,
    });
    expect(result.rows.total).toBe(2);
    expect(result.rows.page.map((row) => row.description)).toEqual(["שופרסל", "משכורת"]);
  });
});
