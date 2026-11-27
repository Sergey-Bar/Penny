import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { lockFilePath } from "@/server/lib/encryption";
import {
  clearAccessJwksCache,
  setAccessJwksForTests,
  type Jwk,
} from "@/server/remote-access/access-jwt";

const team = "team.cloudflareaccess.com";
const aud = "aud-tag-123";
const host = "penny.example.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Jwk;
jwk.kid = "proxy-test";
jwk.alg = "RS256";

const previous = {
  mode: process.env.PENNY_REMOTE_ACCESS,
  host: process.env.PENNY_REMOTE_HOST,
  team: process.env.PENNY_CF_ACCESS_TEAM_DOMAIN,
  aud: process.env.PENNY_CF_ACCESS_AUD,
  ack: process.env.PENNY_REMOTE_QUICK_ACK,
};

function token(): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "proxy-test" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: `https://${team}`,
      aud,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "test",
    }),
  ).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString(
    "base64url",
  );
  return `${header}.${payload}.${signature}`;
}

const remoteReq = (extra: Record<string, string> = {}) =>
  new NextRequest(`http://127.0.0.1:3000/api/health`, {
    method: "GET",
    headers: { host, ...extra },
  });

function setNamedEnv(): void {
  process.env.PENNY_REMOTE_ACCESS = "named";
  process.env.PENNY_REMOTE_HOST = host;
  process.env.PENNY_CF_ACCESS_TEAM_DOMAIN = team;
  process.env.PENNY_CF_ACCESS_AUD = aud;
}

describe("proxy: remote access", () => {
  beforeAll(() => {
    fs.writeFileSync(lockFilePath(), "{}");
    setAccessJwksForTests(team, [jwk]);
    setNamedEnv();
  });
  afterAll(() => {
    fs.rmSync(lockFilePath(), { force: true });
    clearAccessJwksCache();
    for (const [key, value] of Object.entries(previous)) {
      const name =
        key === "mode"
          ? "PENNY_REMOTE_ACCESS"
          : key === "host"
            ? "PENNY_REMOTE_HOST"
            : key === "team"
              ? "PENNY_CF_ACCESS_TEAM_DOMAIN"
              : key === "aud"
                ? "PENNY_CF_ACCESS_AUD"
                : "PENNY_REMOTE_QUICK_ACK";
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("refuses a remote host without a Cloudflare Access token", () => {
    expect(proxy(remoteReq()).status).toBe(403);
  });

  it("refuses a tampered token", () => {
    const valid = token();
    const tampered = `${valid.slice(0, -2)}aa`;
    expect(proxy(remoteReq({ "cf-access-jwt-assertion": tampered })).status).toBe(403);
  });

  it("accepts a valid token on a remote host", () => {
    expect(proxy(remoteReq({ "cf-access-jwt-assertion": token() })).status).toBe(200);
  });

  it("fails closed when Access is only partially configured", () => {
    delete process.env.PENNY_CF_ACCESS_TEAM_DOMAIN;
    expect(proxy(remoteReq({ "cf-access-jwt-assertion": token() })).status).toBe(503);
    process.env.PENNY_CF_ACCESS_TEAM_DOMAIN = team;
    delete process.env.PENNY_CF_ACCESS_AUD;
    expect(proxy(remoteReq({ "cf-access-jwt-assertion": token() })).status).toBe(503);
    process.env.PENNY_CF_ACCESS_AUD = aud;
  });

  it("refuses a remote request while the app lock is off", () => {
    fs.rmSync(lockFilePath(), { force: true });
    expect(proxy(remoteReq({ "cf-access-jwt-assertion": token() })).status).toBe(403);
    fs.writeFileSync(lockFilePath(), "{}");
  });

  it("gates a quick tunnel behind the explicit acknowledgement", () => {
    process.env.PENNY_REMOTE_ACCESS = "quick";
    delete process.env.PENNY_REMOTE_QUICK_ACK;
    expect(proxy(remoteReq()).status).toBe(403);
    process.env.PENNY_REMOTE_QUICK_ACK = "1";
    expect(proxy(remoteReq()).status).toBe(200);
    setNamedEnv();
  });
});
