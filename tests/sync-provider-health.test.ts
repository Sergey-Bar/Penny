import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  classifyProviderError,
  isProviderCoolingDown,
  providerHealth,
  recordProviderFailure,
  recordProviderSuccess,
} from "@/server/sync/provider-health";

let credentialId = 0;

beforeEach(() => {
  const db = getDb();
  db.prepare("DELETE FROM provider_health").run();
  db.prepare("DELETE FROM bank_credentials").run();
  credentialId = Number(
    db
      .prepare(
        `INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
         VALUES (1, 'leumi', 'Leumi', X'00', X'00', X'00')`,
      )
      .run().lastInsertRowid,
  );
});

describe("provider health", () => {
  it("classifies the failure families the scheduler treats differently", () => {
    expect(classifyProviderError("Login failed: wrong password")).toBe("auth");
    expect(classifyProviderError("Waiting for the SMS verification code")).toBe("two_factor");
    expect(classifyProviderError("fetch failed ECONNRESET")).toBe("network");
    expect(classifyProviderError("Too many requests, try again later")).toBe("rate_limit");
    expect(classifyProviderError("the site layout changed")).toBe("site_changed");
    expect(classifyProviderError("operation timed out")).toBe("timeout");
    expect(classifyProviderError("something odd happened")).toBe("unknown");
  });

  it("cools down only auth, 2FA and site-change failures", () => {
    recordProviderFailure(1, credentialId, "auth");
    expect(isProviderCoolingDown(1, credentialId)).toBe(true);
    recordProviderFailure(1, credentialId, "network");
    expect(providerHealth(1)[0]).toMatchObject({
      consecutiveFailures: 2,
      lastErrorCode: "network",
    });
    recordProviderSuccess(1, credentialId);
    expect(isProviderCoolingDown(1, credentialId)).toBe(false);
    expect(providerHealth(1)[0]).toMatchObject({
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastErrorCode: null,
    });
  });

  it("does not cool down transient failures", () => {
    recordProviderFailure(1, credentialId, "timeout");
    expect(isProviderCoolingDown(1, credentialId)).toBe(false);
  });
});
