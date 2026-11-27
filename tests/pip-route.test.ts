import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";

const previous = process.env.PENNY_PIP_V2;
process.env.PENNY_PIP_V2 = "on";

const { POST } = await import("@/app/api/pip/chat/route");
const threadsRoute = await import("@/app/api/pip/threads/route");

afterAll(() => {
  if (previous === undefined) delete process.env.PENNY_PIP_V2;
  else process.env.PENNY_PIP_V2 = previous;
  closeDb();
});

describe("Pip chat route", () => {
  it("streams meta, tool, evidence and done events", async () => {
    const response = await POST(
      new Request("http://localhost/api/pip/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-workspace-id": "1" },
        body: JSON.stringify({ message: "Can I afford 4000 now?", locale: "en" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain('"type":"meta"');
    expect(body).toContain('"type":"tool"');
    expect(body).toContain('"type":"done"');
    expect(body).toContain("cash.toPayday");
  });

  it("lists the stored thread", async () => {
    const response = await threadsRoute.GET(
      new Request("http://localhost/api/pip/threads", {
        headers: { "x-workspace-id": "1" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { threads: { id: number }[] };
    expect(body.threads.length).toBeGreaterThan(0);
  });

  it("refuses chat when the kill switch is on", async () => {
    process.env.PENNY_PIP_KILL = "1";
    try {
      const response = await POST(
        new Request("http://localhost/api/pip/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "x-workspace-id": "1" },
          body: JSON.stringify({ message: "Hello" }),
        }),
      );
      expect(response.status).toBe(409);
    } finally {
      delete process.env.PENNY_PIP_KILL;
    }
  });
});
