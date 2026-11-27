# Remote access

Penny is local-first. Remote access lets a phone or laptop reach the same local app through a Cloudflare tunnel, without exposing the database or the key file to the public internet.

Remote access is off by default. It cannot be enabled while the app lock is off.

## Modes

### Named tunnel with Cloudflare Access (recommended)

1. Install `cloudflared` on the machine that runs Penny.
2. Authenticate `cloudflared` with the Cloudflare account that owns the domain.
3. Create a named tunnel and route a hostname to the local Penny port.
4. Create a Cloudflare Access application for that hostname. Add an allow policy for the household identities.
5. Copy the Access **team domain** and the application **AUD** tag.
6. In Penny, open Settings, Privacy, Remote access. Choose "Named tunnel with Cloudflare Access", enter the hostname, team domain and AUD, then save.
7. Confirm the app lock is on and test from a device outside the home.

Penny verifies the `Cf-Access-Jwt-Assertion` header against the Access JWKS. It checks the signature, issuer, audience and expiry. The JWKS is cached for an hour and refreshed in the background. If the cache is unavailable, remote requests fail closed.

### Quick tunnel (development only)

A quick tunnel gives a random public hostname and has no identity provider. It is suitable only for a short development session.

- The app lock must be on.
- Set `PENNY_REMOTE_QUICK_ACK=1`.
- Set `PENNY_REMOTE_HOST` to the hostname you expect, or save it in the settings card.
- Do not leave a quick tunnel running.

## Configuration file

Settings are stored in `data/remote-access.json` with owner-only permissions:

```json
{
  "version": 1,
  "mode": "named",
  "host": "penny.example.com",
  "teamDomain": "yourteam.cloudflareaccess.com",
  "aud": "your-audience-tag",
  "updatedAt": "2026-11-27T09:00:00.000Z"
}
```

Environment variables override the file:

- `PENNY_REMOTE_ACCESS=off|quick|named`
- `PENNY_REMOTE_HOST`
- `PENNY_CF_ACCESS_TEAM_DOMAIN`
- `PENNY_CF_ACCESS_AUD`
- `PENNY_REMOTE_QUICK_ACK=1`

The settings card shows when the environment manages the configuration.

## Request flow

1. Cloudflare terminates TLS and, in named mode, authenticates the user.
2. Cloudflare forwards the request with `Cf-Access-Jwt-Assertion`.
3. Penny's proxy checks the Host header against localhost, explicitly allowed hosts and the configured remote host.
4. If the request is for the remote host, the proxy requires the app lock and verifies the Access token in named mode.
5. The existing app-lock session gate runs.
6. The route runs with the normal workspace and role checks.

A request to the remote hostname with a missing or invalid token is refused before any route or file is read.

## Operational checks

- `GET /api/remote-access` returns the mode, host, lock state and whether Access is configured.
- `PUT /api/remote-access` saves the configuration; it refuses when the lock is off or a required field is missing.
- `DELETE /api/remote-access` removes the file and turns remote access off.
- `/api/diagnostics` shows the mode and whether the kill switch is on.

## Docker

The included `docker-compose.yml` has a `cloudflared` service behind the `remote` profile. It connects to the `penny` service over the Compose network.

```bash
# Create the tunnel in Cloudflare, then:
echo 'CLOUDFLARE_TUNNEL_TOKEN=your-token' >> .env
echo 'PENNY_REMOTE_ACCESS=named' >> .env
echo 'PENNY_REMOTE_HOST=penny.example.com' >> .env
echo 'PENNY_CF_ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com' >> .env
echo 'PENNY_CF_ACCESS_AUD=your-audience-tag' >> .env
docker compose --profile remote up -d
```

The token is read by the connector, not by Penny. Keep `.env` out of version control.

## Recovery

- Lost access: disable the tunnel at Cloudflare, or delete `data/remote-access.json` on the machine.
- Lost the app-lock passphrase: use the recovery code or restore from a backup. Remote access cannot bypass the lock.
- Suspected leak: turn remote access off, rotate the Access policy, revoke household sessions and review `data/logs`.
- The tunnel token is a secret. Do not commit it, paste it into an issue or store it in the repository.

## Threat model

- A forged Host header from a hostile website fails the host guard.
- A direct request to the public hostname fails without a valid Access token.
- A stale JWKS cache fails closed instead of accepting an unverified token.
- A stolen Access session still needs the app-lock session.
- A stolen database file is encrypted with the local key when the app lock is configured.
- Cloudflare can see request metadata and, because it terminates TLS, the request content in transit. It does not receive the database or the key.
