import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-hourly-"));
  globalThis.__pennyDataKey = undefined;
});

describe("hourly local snapshots", () => {
  it("writes a verified copy, keeps 24 and reports its age", async () => {
    const { getDb } = await import("@/server/db");
    const { runHourlySnapshot, hourlyBackupDir, HOURLY_KEEP, hourlyBackupStatus } =
      await import("@/server/lib/hourly-backup");
    getDb().prepare("SELECT 1").run();
    const first = runHourlySnapshot(Date.now());
    expect(first.status).toBe("ok");
    expect(first.file).toBeTruthy();
    expect(fs.existsSync(first.file!)).toBe(true);
    // Windows ignores POSIX mode bits; the data folder's ACL is what protects it there.
    if (process.platform !== "win32") expect(fs.statSync(first.file!).mode & 0o777).toBe(0o600);

    for (let index = 0; index < HOURLY_KEEP + 3; index++) {
      const result = runHourlySnapshot(Date.now() + index * 1000);
      expect(result.status).toBe("ok");
    }
    const files = fs.readdirSync(hourlyBackupDir());
    expect(files.length).toBe(HOURLY_KEEP);
    const status = hourlyBackupStatus();
    expect(status.status).toBe("ok");
    expect(status.count).toBe(HOURLY_KEEP);
    expect(status.ageSeconds).not.toBeNull();
  });
});
