# Penny in a container: the app, its scrapers and Chromium are isolated from the host,
# and the database and encryption key live in the /data volume.

# Pin the multi-architecture node:24-bookworm-slim manifest resolved on 2026-11-27.
# The tag still ships libpam 1.5.2-6+deb12u2, which Trivy reports as CVE-2025-6020;
# the runtime stage upgrades it to the fixed version from the Debian security suite. Refresh this digest
# and the upgrade together when the base image is rebuilt with the fix.
FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    # The default scraper drives Chromium; use Debian's package instead of a downloaded browser.
    PUPPETEER_SKIP_DOWNLOAD=true

FROM base AS build
COPY package.json package-lock.json ./
# No dependency install scripts: better-sqlite3 and sharp ship prebuilt binaries, and Chromium comes from Debian.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# Tests run as part of the build: if they fail, no image is produced and the running version stays.
RUN npm test
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
# The container never runs npm: removing it (and npx, corepack) removes the CVEs of its bundled dependencies.
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data && chown node:node /data \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ARG PENNY_COMMIT=unknown
ENV NODE_ENV=production \
    PENNY_DATA_DIR=/data \
    PENNY_INSTALL=docker \
    PENNY_COMMIT=${PENNY_COMMIT} \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build --chown=node:node /app /app
USER node
VOLUME ["/data"]
EXPOSE 41234
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:41234/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Inside the container the app must listen on all interfaces; compose publishes it on the host's 127.0.0.1 only.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "41234"]
