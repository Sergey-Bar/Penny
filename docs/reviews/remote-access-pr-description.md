# Remote access: Cloudflare Access with a local lock

## Summary

This PR adds opt-in remote access to the same local Penny app.

It is off by default and cannot be enabled while the app lock is off. Named mode verifies a Cloudflare Access JWT before any route runs and still requires the app-lock session. A development-only quick tunnel requires an explicit acknowledgement and is never the default.

## What changed

- Server-side remote-access configuration in `data/remote-access.json` with owner-only permissions.
- Cloudflare Access JWKS verification: RS256 signature, issuer, audience and expiry, cached and refreshed. Missing or stale keys fail closed.
- Proxy host guard admits only the configured remote hostname; wildcards are rejected and local addresses are refused.
- Settings card under Privacy for mode, hostname, team domain, AUD and an off switch.
- Quick tunnel gated by the app lock and `PENNY_REMOTE_QUICK_ACK=1`.
- Compose `remote` profile, setup script, environment flags and runbook.
- Tests for JWT acceptance and rejection, config normalization, host guard and security policy.

## Validation

```text
tsc --noEmit                              pass
eslint --max-warnings 0 src tests scripts e2e   pass
knip                                      only the existing .css hint
prettier --check                          pass
vitest run                                all tests pass, including the remote suite
next build                                compiled and typechecked
```

## Rollout

1. Merge with remote access off.
2. Create the Cloudflare tunnel and Access application.
3. Turn on the app lock.
4. Save the hostname, team domain and AUD in Settings, Privacy, Remote access.
5. Test from outside the home and confirm a request without a token is refused.
6. Watch diagnostics and logs; turn remote access off if anything looks wrong.

## Rollback

- Settings, Privacy, Remote access, Turn off.
- Delete `data/remote-access.json`.
- Stop or delete the tunnel at Cloudflare.
- The app remains local and the database is unchanged.

## Residual risk

- The JWT verifier is unit-tested with generated keys; run a live Access smoke test before enabling a household.
- Quick mode has no identity provider and is for development only.
- Cloudflare sees request content in transit because it terminates TLS; it does not receive the database or key file.
