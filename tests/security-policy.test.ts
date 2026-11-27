import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// Security policy sweep: every API path through the real proxy, for a signed-out visitor,
// a read-only household member and an editor. The point is that no route is accidentally
// public and that no cross-workspace read survives the header.
process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-policy-"));

const modules = import.meta.glob("../src/app/api/**/route.ts") as Record<
  string,
  () => Promise<unknown>
>;
const API_PATHS = Object.keys(modules)
  .map((f) => "/api" + f.replace("../src/app/api", "").replace(/\/route\.ts$/, ""))
  .sort();

// Public on purpose: the sign-in screen, the lock screen and the health probe the service
// wrapper and Docker HEALTHCHECK use.
const PUBLIC = new Set(["/api/access", "/api/health", "/api/health/ready", "/api/lock/unlock"]);

let adminCookie = "";
let memberCookie = "";

beforeAll(async () => {
  const { getDb } = await import("@/server/db");
  const { createUser, newSession, USER_COOKIE } = await import("@/server/lib/user-access");
  const db = getDb();
  const existing = db.prepare("SELECT id FROM app_users LIMIT 1").get() as
    { id: number } | undefined;
  const adminId = existing?.id ?? createUser("Owner", "owner", "a-long-owner-password", true);
  const memberId = createUser("Member", "member", "a-long-member-password");
  db.prepare("INSERT INTO workspace_members VALUES (?,1,'editor')").run(memberId);
  adminCookie = `${USER_COOKIE}=${newSession(adminId)}`;
  memberCookie = `${USER_COOKIE}=${newSession(memberId)}`;
});

const call = async (pathname: string, method: string, cookie?: string, workspace = "1") => {
  const { proxy } = await import("@/proxy");
  return proxy(
    new NextRequest(`http://127.0.0.1${pathname}`, {
      method,
      headers: {
        host: "127.0.0.1",
        origin: "http://127.0.0.1",
        "x-workspace-id": workspace,
        ...(cookie ? { cookie } : {}),
      },
    }),
  );
};

describe("access policy: signed out", () => {
  it("every non-public API path is 401, and no page leaks through", async () => {
    for (const apiPath of API_PATHS) {
      const res = await call(apiPath, "GET");
      if (PUBLIC.has(apiPath)) {
        expect(res.status, apiPath).not.toBe(401);
      } else {
        expect(res.status, apiPath).toBe(401);
      }
    }
    const page = await call("/transactions", "GET");
    expect([302, 307]).toContain(page.status);
  });
});

describe("access policy: household member", () => {
  it("reads are allowed only on the member-safe list, writes only where an editor belongs", async () => {
    const denyAll = [
      "/api/settings",
      "/api/data/wipe",
      "/api/data/export",
      "/api/backup",
      "/api/diagnostics",
      "/api/setup/status",
      "/api/setup/onboarding",
      "/api/integrations",
      "/api/profiles",
    ];
    for (const apiPath of denyAll) {
      const res = await call(apiPath, "GET", memberCookie);
      expect(res.status, `GET ${apiPath}`).toBe(403);
    }
    const memberReads = [
      "/api/home",
      "/api/summary",
      "/api/transactions",
      "/api/budgets",
      "/api/categories",
      "/api/assets",
      "/api/insurance",
      "/api/planned",
    ];
    for (const apiPath of memberReads) {
      const res = await call(apiPath, "GET", memberCookie);
      expect(res.status, `GET ${apiPath}`).toBe(200);
    }
    // Editors write household money data, never the deployment itself.
    for (const apiPath of [
      "/api/budgets",
      "/api/transactions",
      "/api/categories",
      "/api/planned",
    ]) {
      expect((await call(apiPath, "POST", memberCookie)).status, `POST ${apiPath}`).toBe(200);
    }
    for (const apiPath of [
      "/api/settings",
      "/api/data/wipe",
      "/api/backup",
      "/api/setup/ai",
      "/api/integrations",
    ]) {
      expect((await call(apiPath, "POST", memberCookie)).status, `POST ${apiPath}`).toBe(403);
    }
  });

  it("a workspace they are not a member of is 403, for every route", async () => {
    const { getDb } = await import("@/server/db");
    const other = Number(
      getDb().prepare("INSERT INTO workspaces (name, slug) VALUES ('Other', 'other')").run()
        .lastInsertRowid,
    );
    for (const apiPath of API_PATHS) {
      // Session, health probe, the unlock endpoint and the workspace list itself are
      // workspace-free by design: they either ignore the header or list what you may see.
      // Quick-add ignores cookie and header alike: its device token names the workspace (401 without one).
      const workspaceFree = [
        "/api/access",
        "/api/health",
        "/api/health/ready",
        "/api/lock/unlock",
        "/api/workspaces",
        "/api/quick-add",
      ];
      if (workspaceFree.includes(apiPath)) continue;
      const res = await call(apiPath, "GET", memberCookie, String(other));
      expect(res.status, apiPath).toBe(403);
    }
  });
});

describe("access policy: owner", () => {
  it("reaches the deployment routes and every workspace", async () => {
    for (const apiPath of [
      "/api/settings",
      "/api/diagnostics",
      "/api/integrations",
      "/api/data/export",
      "/api/profiles",
    ]) {
      expect((await call(apiPath, "GET", adminCookie)).status, `GET ${apiPath}`).toBe(200);
    }
    expect((await call("/api/settings", "GET", adminCookie, "999")).status).toBe(200);
  });
});

describe("health stays reachable for the service wrapper and Docker", () => {
  it("is public even with sign-in and the lock on", async () => {
    const lock = await import("@/server/lib/app-lock");
    const enc = await import("@/server/lib/encryption");
    enc.getKey();
    await lock.enableLock("12345678", 15);
    const { proxy } = await import("@/proxy");
    const res = proxy(
      new NextRequest("http://127.0.0.1/api/health", { headers: { host: "127.0.0.1" } }),
    );
    expect(res.status).toBe(200);
  });
});
