import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-log-event-"));
});

describe("structured event log", () => {
  it("redacts known secret shapes and keeps one JSON object per line", async () => {
    const { logEvent, eventLogPath } = await import("@/server/lib/log");
    const file = eventLogPath();
    logEvent(
      "test.event",
      {
        jobId: 7,
        description: "SHOULD_NOT_LEAK",
        password: "hunter2",
        nested: "Bearer abcdef0123456789abcdef",
      },
      file,
    );
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.event).toBe("test.event");
    expect(entry.jobId).toBe(7);
    expect(String(entry.password)).toContain("[redacted]");
    expect(String(entry.nested)).not.toContain("abcdef0123456789abcdef");
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});
