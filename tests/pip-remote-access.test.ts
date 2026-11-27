import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAccessJwksCache,
  setAccessJwksForTests,
  verifyAccessJwtSync,
  type Jwk,
} from "@/server/remote-access/access-jwt";
import {
  normalizeAudience,
  normalizeRemoteHost,
  normalizeTeamDomain,
  parseRemoteAccessMode,
} from "@/lib/remote-access";

const team = "team.cloudflareaccess.com";
const aud = "aud-tag-123";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Jwk;
jwk.kid = "test-key";
jwk.alg = "RS256";

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function token(payload: Record<string, unknown>, kid = "test-key"): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString(
    "base64url",
  );
  return `${header}.${body}.${signature}`;
}

const now = Date.parse("2026-11-27T10:00:00Z");

afterEach(() => {
  clearAccessJwksCache();
});

describe("Cloudflare Access JWT verification", () => {
  it("accepts a valid RS256 token with the right issuer and audience", () => {
    setAccessJwksForTests(team, [jwk], now);
    const result = verifyAccessJwtSync(
      token({ iss: `https://${team}`, aud, exp: now / 1000 + 3600, sub: "user" }),
      { teamDomain: team, aud, now },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an expired token, a wrong audience and a wrong issuer", () => {
    setAccessJwksForTests(team, [jwk], now);
    const expired = verifyAccessJwtSync(
      token({ iss: `https://${team}`, aud, exp: now / 1000 - 120 }),
      { teamDomain: team, aud, now },
    );
    expect(expired.ok).toBe(false);
    expect(expired.reason).toBe("expired");

    const wrongAudience = verifyAccessJwtSync(
      token({ iss: `https://${team}`, aud: "other", exp: now / 1000 + 3600 }),
      { teamDomain: team, aud, now },
    );
    expect(wrongAudience.ok).toBe(false);
    expect(wrongAudience.reason).toBe("bad_audience");

    const wrongIssuer = verifyAccessJwtSync(
      token({ iss: "https://evil.example", aud, exp: now / 1000 + 3600 }),
      { teamDomain: team, aud, now },
    );
    expect(wrongIssuer.ok).toBe(false);
    expect(wrongIssuer.reason).toBe("bad_issuer");
  });

  it("rejects an unknown key id and a tampered signature", () => {
    setAccessJwksForTests(team, [jwk], now);
    const unknown = verifyAccessJwtSync(
      token({ iss: `https://${team}`, aud, exp: now / 1000 + 3600 }, "other-key"),
      { teamDomain: team, aud, now },
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.reason).toBe("unknown_kid");

    const valid = token({ iss: `https://${team}`, aud, exp: now / 1000 + 3600 });
    const tampered = `${valid.slice(0, -2)}aa`;
    const bad = verifyAccessJwtSync(tampered, { teamDomain: team, aud, now });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("bad_signature");
  });

  it("fails closed when the JWKS cache is empty", () => {
    clearAccessJwksCache();
    const result = verifyAccessJwtSync(
      token({ iss: `https://${team}`, aud, exp: now / 1000 + 3600 }),
      { teamDomain: team, aud, now },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("jwks_unavailable");
  });
});

describe("remote access config normalization", () => {
  it("normalizes modes, hosts, team domains and audiences", () => {
    expect(parseRemoteAccessMode("named")).toBe("named");
    expect(parseRemoteAccessMode("public")).toBeNull();
    expect(normalizeRemoteHost("HTTPS://Penny.Example.com:443/path")).toBe("penny.example.com");
    expect(normalizeRemoteHost("*.example.com")).toBeNull();
    expect(normalizeTeamDomain("https://Team.CloudflareAccess.com/")).toBe(
      "team.cloudflareaccess.com",
    );
    expect(normalizeAudience("abc_123-XYZ")).toBe("abc_123-XYZ");
    expect(normalizeAudience("bad audience")).toBeNull();
  });
});
