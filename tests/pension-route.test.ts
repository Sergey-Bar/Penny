import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({
  savePensionConnection: vi.fn(() => ({ id: 5 })),
  startPensionSync: vi.fn(() => true),
  listPensionConnections: vi.fn(() => []),
  deletePensionConnection: vi.fn(),
  otpKey: (id: number) => -id,
}));
vi.mock("@/server/pension/sync", () => sync);
vi.mock("@/server/lib/workspace-context", () => ({ getWorkspaceIdFromRequest: () => 1 }));
vi.mock("@/server/demo/guard", () => ({ demoBlockedResponse: () => null }));

import { POST } from "@/app/api/pension/route";

const post = (body: unknown) =>
  POST(
    new Request("http://127.0.0.1/api/pension", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/pension connect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a user name and password for Excellence Trade and stores only those", async () => {
    expect((await post({ fundId: "excellence", username: " ", password: "x" })).status).toBe(400);
    expect((await post({ fundId: "excellence", username: "me" })).status).toBe(400);
    expect(sync.savePensionConnection).not.toHaveBeenCalled();

    const ok = await post({ fundId: "excellence", username: " me ", password: "pw", id: "123456" });
    expect(ok.status).toBe(200);
    expect(sync.savePensionConnection).toHaveBeenCalledWith(
      1,
      "excellence",
      {
        username: "me",
        password: "pw",
      },
      { id: undefined, label: "" },
    );
  });

  it("still needs an ID and phone for the SMS funds", async () => {
    expect((await post({ fundId: "phoenix", id: "123", phone: "0501234567" })).status).toBe(400);
    expect((await post({ fundId: "phoenix", id: "123456789", phone: "123" })).status).toBe(400);
    const ok = await post({ fundId: "phoenix", id: "12345678", phone: "050-1234567" });
    expect(ok.status).toBe(200);
    expect(sync.savePensionConnection).toHaveBeenCalledWith(
      1,
      "phoenix",
      {
        id: "012345678",
        phone: "0501234567",
      },
      { id: undefined, label: "" },
    );
  });
});
