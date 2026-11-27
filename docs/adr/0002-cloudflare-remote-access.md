# ADR 0002: Cloudflare remote access with a local lock

- Status: Accepted for Phase 1
- Date: 2026-11-27
- Owners: Penny maintainers

## Context

Penny is local-first. Host guard rejects any Host header that is not localhost, a listed host or a private LAN name. Phone access already relaxes the host rule only while the app lock is enabled. Households still want to reach Penny from outside the home, and the safe options are narrower than "port forward the app".

A public tunnel without authentication exposes every route to the internet. A tunnel with an identity provider still needs an application-level check, because a tunnel misconfiguration or a stale DNS record must not silently turn into an open finance app.

## Decision

Remote access is a feature with two modes and a hard local gate:

- **Named Cloudflare tunnel + Cloudflare Access** is the recommended mode. The user creates an Access application, then stores the team domain and AUD tag in Penny. The proxy verifies the `Cf-Access-Jwt-Assertion` header synchronously against a cached JWKS before any route runs.
- **Quick tunnel** is development-only. It requires the app lock and an explicit `PENNY_REMOTE_QUICK_ACK=1`, and the public hostname is stored explicitly. It is never the default.
- The app lock must be enabled before either mode can be saved or used. Remote requests are refused when the lock is off.
- A remote host is added to the host guard only for the configured hostname. Wildcards are rejected.
- The tunnel terminates at the local app. The database, key file and backups stay on the machine.
- No tunnel token or Access secret is committed. The tunnel connector reads its token from the environment or from Cloudflare-managed configuration.

## Consequences

- Cloudflare Access is the identity boundary; the app lock is the local boundary. Both must pass.
- The app verifies Access tokens even if the tunnel is the only public path, so a direct request with a forged Host header fails closed.
- JWKS is cached for an hour and refreshed in the background. If the cache is empty or stale, remote requests fail closed rather than allowing an unverified token.
- Remote access cannot be configured by a household member from the member API; the settings route is owner-only by default and the app lock protects it.
- Users who want a different tunnel provider can keep Penny local and put their own authenticated proxy in front of it, but the built-in flow is Cloudflare-specific.

## Rejected alternatives

- **Port forwarding with a password prompt.** Rejected: one password, no identity lifecycle, no device policy.
- **Treating Cloudflare Access as sufficient without app verification.** Rejected: a stale or misrouted tunnel must not become an open door.
- **A public share link.** Rejected for finance data; links are hard to revoke and easy to forward.
- **A hosted relay that sees decrypted data.** Rejected: it would break the local-first guarantee.
