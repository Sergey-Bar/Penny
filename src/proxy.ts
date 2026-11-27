import { NextResponse, type NextRequest } from "next/server";
import {
  accessEnabled,
  currentUser,
  membership,
  defaultWorkspace,
  allowedMemberRoute,
} from "@/server/lib/user-access";
import { isAllowedHost } from "@/lib/host-guard";
import { isLockEnabled, SESSION_COOKIE, touchSession } from "@/server/lib/app-lock";
import { isLanEnabled } from "@/server/lib/lan-access";
import { isMcpToken, MCP_TOKEN_HEADER } from "@/server/lib/mcp-token";
import { DEMO_BLOCKED_MESSAGE, isHostedDemo } from "@/server/demo/mode";

/**
 * Same-origin enforcement for mutating API requests.
 *
 * Penny runs on 127.0.0.1 only, but any webpage you visit can fire a POST
 * to http://127.0.0.1:3000/api/sync from inside your browser. This
 * middleware rejects state-changing requests whose Origin or Referer
 * isn't the app itself, so a malicious tab can't trick your localhost
 * into syncing, deleting integrations, or applying categorizations.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// GET routes with side effects: the Ollama model list makes the server fetch a URL (and may start Ollama).
const ORIGIN_CHECKED_GETS = new Set(["/api/ai/ollama/models"]);
const QUICK_ADD = "/api/quick-add";

const HOSTED_DEMO_BLOCKED =
  /^\/api\/(lock|data|backup|access|profiles|workspaces|device-tokens|quick-add|lan|import\/folder|legacy|telegram|setup\/(bank|ai))(\/|$)/;

export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const finish = (response: NextResponse): NextResponse => {
    response.headers.set("X-Request-Id", requestId);
    return response;
  };
  // Every request, page or API, must be addressed to localhost (blocks DNS rebinding).
  // Phone access admits private LAN hosts, but only while the app lock guards every request.
  if (!isAllowedHost(request.headers.get("host"), undefined, isLanEnabled() && isLockEnabled())) {
    return finish(new NextResponse("Forbidden: unexpected host", { status: 403 }));
  }
  // The public demo is shared by every visitor: nothing may lock it, wipe it or change who can use it.
  if (
    isHostedDemo() &&
    request.method !== "GET" &&
    HOSTED_DEMO_BLOCKED.test(request.nextUrl.pathname)
  )
    return finish(NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 }));

  // Phone quick-add: a bearer device token (checked by the route) replaces the session cookie and Origin.
  // A browser cannot attach that header cross-origin without a CORS preflight, which is never answered.
  if (request.nextUrl.pathname === QUICK_ADD) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      request.method !== "POST" ||
      !request.headers.get("authorization") ||
      fetchSite === "cross-site" ||
      fetchSite === "same-site"
    )
      return finish(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const headers = new Headers(request.headers);
    headers.delete("x-workspace-id"); // the token decides the workspace
    headers.delete("cookie");
    return NextResponse.next({ request: { headers } });
  }

  const locked = lockGate(request);
  if (locked) return finish(locked);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const path = request.nextUrl.pathname;
  const staticAsset =
    !path.startsWith("/api/") && (path.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(path));
  if (
    !staticAsset &&
    path !== "/api/access" &&
    path !== "/access" &&
    path !== "/lock" &&
    path !== "/api/lock/unlock" &&
    path !== "/api/health" &&
    path !== "/api/health/ready" &&
    // Last, so /api/health answers even when the database cannot open.
    accessEnabled()
  ) {
    const user = currentUser(request);
    if (!user)
      return path.startsWith("/api/")
        ? finish(NextResponse.json({ error: "sign-in-required" }, { status: 401 }))
        : NextResponse.redirect(new URL("/access", request.url));
    if (path.startsWith("/api/")) {
      const raw = request.headers.get("x-workspace-id");
      const ws = !raw ? defaultWorkspace(user) : Number(raw);
      const role = ws && Number.isSafeInteger(ws) ? membership(user, ws) : null;
      if (
        !user.isAdmin &&
        path !== "/api/workspaces" &&
        (!role || !allowedMemberRoute(path, request.method, role))
      )
        return finish(NextResponse.json({ error: "workspace-access-denied" }, { status: 403 }));
      if (!user.isAdmin && path === "/api/workspaces" && request.method !== "GET")
        return finish(NextResponse.json({ error: "owner-required" }, { status: 403 }));
      if (ws) requestHeaders.set("x-workspace-id", String(ws));
    }
  }

  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Browsers mark requests from other sites; no API call, read or write, should come from one.
  // ("same-site" covers sibling hosts such as other *.localhost apps.)
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    return finish(new NextResponse("Forbidden: cross-site request blocked", { status: 403 }));
  }

  if (!MUTATING_METHODS.has(request.method) && !ORIGIN_CHECKED_GETS.has(request.nextUrl.pathname)) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // SSE streams use POST too (sync), but they're still subject to the
  // same-origin requirement, so no exception needed.

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Accept requests where Origin or Referer points to our own host.
  // Reject requests with no origin AND no referer (suspicious for a
  // mutating call from a browser context).
  if (!origin && !referer) {
    return finish(
      new NextResponse("Forbidden: missing origin/referer", {
        status: 403,
      }),
    );
  }

  const allowed = (value: string | null): boolean => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.host === host;
    } catch {
      return false;
    }
  };

  if (origin && !allowed(origin)) {
    return finish(
      new NextResponse("Forbidden: cross-origin request blocked", {
        status: 403,
      }),
    );
  }
  if (!origin && referer && !allowed(referer)) {
    return finish(
      new NextResponse("Forbidden: cross-origin referer", {
        status: 403,
      }),
    );
  }

  return finish(NextResponse.next({ request: { headers: requestHeaders } }));
}

// Reachable without a session: the lock screen, its API, the health probe, and static files.
const LOCK_OPEN = new Set(["/lock", "/api/lock/unlock", "/api/health", "/api/health/ready"]);
const isStatic = (p: string) =>
  !p.startsWith("/api/") && (p.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(p));

/**
 * The reads scripts/mcp.mjs makes, and all its token opens: GET on exactly these paths. None of them
 * needs the data key, so they answer while the key is still wrapped. A route that decrypts saved
 * logins, or changes anything on GET, must never be added here.
 */
export const MCP_READ_PATHS: ReadonlySet<string> = new Set([
  "/api/overview",
  "/api/transactions",
  "/api/summary",
  "/api/assets",
  "/api/planned",
  "/api/balance-forecast",
  "/api/cash-ahead",
  "/api/cashflow-health",
  "/api/insights",
  "/api/pension",
  "/api/pension/report",
  "/api/insurance",
  "/api/activity",
]);

/** With the app lock on, everything else needs a live session cookie. */
function lockGate(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (LOCK_OPEN.has(path) || isStatic(path) || !isLockEnabled()) return null;
  if (touchSession(request.cookies.get(SESSION_COOKIE)?.value)) return null;
  // The local MCP server has no session. Its token stands in for one on these reads only, and no
  // cookie is issued; the host check above and the user sign-in below still apply.
  if (
    request.method === "GET" &&
    MCP_READ_PATHS.has(path) &&
    isMcpToken(request.headers.get(MCP_TOKEN_HEADER))
  )
    return null;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "locked" }, { status: 401 });
  const url = new URL("/lock", request.url);
  // Keep the query too (month, filters), so unlocking returns to the same view.
  if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/:path*"],
};
