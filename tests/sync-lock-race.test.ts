import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/jobs/locks", () => ({
  isLockHeld: () => false,
  acquireLock: () => false,
  heartbeatLock: () => false,
  releaseLock: vi.fn(),
}));

import { tryAcquireCredentialSync, tryAcquireSync } from "@/server/sync/lock";

describe("sync lock acquisition race", () => {
  it("returns null when the durable lock is taken between the check and the insert", () => {
    expect(tryAcquireSync("manual")).toBeNull();
    expect(tryAcquireCredentialSync(1)).toBeNull();
  });
});
