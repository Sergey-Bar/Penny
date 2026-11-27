import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-wrapper-"));
process.env.PENNY_DEMO = "0";

import { ApiError, handle, readJson } from "@/server/lib/api-error";

/**
 * Handlers that may stay outside handle(), each with its reason. Empty today: the streaming routes
 * (sync, ai/ollama/pull) are wrapped too, because handle() only covers the setup before the
 * Response is returned; the stream body reports its own failures as a final `error` event.
 */
const UNWRAPPED: Record<string, string> = {};

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(full);
    return e.name === "route.ts" ? [full] : [];
  });
}

const API_DIR = path.resolve(__dirname, "../src/app/api");
const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

describe("every API handler goes through handle()", () => {
  const files = routeFiles(API_DIR);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no handler defined outside handle()", () => {
    const offenders: string[] = [];
    let wrapped = 0;
    for (const file of files) {
      const rel = path.relative(API_DIR, file).replace(/\\/g, "/");
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(new RegExp(`^export (?:async )?function (${METHODS})\\b`, "gm")))
        if (!UNWRAPPED[`${rel} ${m[1]}`]) offenders.push(`${rel} ${m[1]} (function)`);
      for (const m of src.matchAll(new RegExp(`^export const (${METHODS})\\s*=\\s*(\\S+)`, "gm"))) {
        if (m[2].startsWith("handle(")) wrapped++;
        else if (!UNWRAPPED[`${rel} ${m[1]}`]) offenders.push(`${rel} ${m[1]} (= ${m[2]})`);
      }
      // Re-exports (`export { GET }`) would slip past the two patterns above.
      if (new RegExp(`^export \\{[^}]*\\b(${METHODS})\\b`, "m").test(src))
        offenders.push(`${rel} (re-export)`);
    }
    expect(offenders).toEqual([]);
    expect(wrapped).toBeGreaterThan(200);
  });
});

describe("handle and readJson", () => {
  beforeAll(async () => {
    (await import("@/server/db")).getDb();
  });

  it("answers a thrown error with the generic 500 and keeps the message to itself", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const GET = handle("test", () => {
      throw new Error("secret path C:\\data\\penny.db for account 123456789");
    });
    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Unable to complete the request" });
    expect(text).not.toContain("123456789");
    // It is logged, redacted.
    expect(quiet).toHaveBeenCalledOnce();
    expect(String(quiet.mock.calls[0][0])).toContain("[test]");
    expect(String(quiet.mock.calls[0][0])).not.toContain("123456789");
    quiet.mockRestore();
  });

  it("passes the handler's own arguments and response through", async () => {
    const GET = handle(
      "test",
      async (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
        Response.json({ id: (await params).id }, { status: 201 }),
    );
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "7" });
  });

  it("keeps an ApiError's status, message and code", async () => {
    const POST = handle("test", () => {
      throw new ApiError("name is taken", 409, "duplicate-name");
    });
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "name is taken", code: "duplicate-name" });
  });

  it("readJson turns a malformed body into 400 bad_json", async () => {
    const POST = handle("test", async (request: Request) => Response.json(await readJson(request)));
    const bad = await POST(
      new Request("http://localhost/x", { method: "POST", body: "{not json" }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "Invalid JSON",
      code: "bad_json",
      requestId: expect.any(String),
    });
    const ok = await POST(new Request("http://localhost/x", { method: "POST", body: '{"a":1}' }));
    expect(await ok.json()).toEqual({ a: 1 });
  });

  it("a real route answers malformed JSON with 400 bad_json", async () => {
    const { PATCH } = await import("@/app/api/legacy/export/route");
    const res = await PATCH(
      new Request("http://localhost/api/legacy/export", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-workspace-id": "1" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid JSON",
      code: "bad_json",
      requestId: expect.any(String),
    });
  });
});
