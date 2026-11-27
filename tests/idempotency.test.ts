import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { withIdempotency } from "@/server/lib/http/idempotency";
import { ApiError } from "@/server/lib/api-error";

function request(body: unknown, key = "key-1"): Request {
  return new Request("http://localhost/api/transactions/manual", {
    method: "POST",
    headers: { "idempotency-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getDb().prepare("DELETE FROM idempotency_keys").run();
});

describe("idempotency", () => {
  it("runs once, then replays the stored response", async () => {
    let runs = 0;
    const run = async () => {
      runs++;
      return Response.json({ ok: true, runs }, { status: 201 });
    };
    const first = await withIdempotency(request({ amount: 10 }), 1, run);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true, runs: 1 });

    const second = await withIdempotency(request({ amount: 10 }), 1, run);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replay")).toBe("true");
    expect(await second.json()).toEqual({ ok: true, runs: 1 });
    expect(runs).toBe(1);
  });

  it("rejects the same key with a different body", async () => {
    await withIdempotency(request({ amount: 10 }), 1, async () => Response.json({ ok: true }));
    await expect(
      withIdempotency(request({ amount: 11 }), 1, async () => Response.json({ ok: true })),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("rejects a request while the key is in progress", async () => {
    getDb()
      .prepare(
        `INSERT INTO idempotency_keys (workspace_id, key, method, path, request_hash, status)
         VALUES (1, 'key-1', 'POST', '/api/transactions/manual', 'x', 'in_progress')`,
      )
      .run();
    await expect(
      withIdempotency(request({ amount: 10 }), 1, async () => Response.json({ ok: true })),
    ).rejects.toMatchObject({ code: "idempotency_in_progress" });
  });

  it("runs without a key, unchanged", async () => {
    let runs = 0;
    const res = await withIdempotency(
      new Request("http://localhost/x", { method: "POST", body: "{}" }),
      1,
      async () => {
        runs++;
        return Response.json({ ok: true });
      },
    );
    expect(res.status).toBe(200);
    expect(runs).toBe(1);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM idempotency_keys").get()).toEqual({ n: 0 });
  });

  it("does not cache server errors", async () => {
    await expect(
      withIdempotency(request({ amount: 10 }), 1, async () => {
        throw new ApiError("boom", 500);
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM idempotency_keys").get()).toEqual({ n: 0 });
  });
});
