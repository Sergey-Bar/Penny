#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const host = value("--host");
const tunnel = value("--tunnel") ?? "penny";
const teamDomain = value("--team-domain");
const aud = value("--aud");

if (!host) {
  console.error(
    "Usage: node scripts/cloudflare/setup.mjs --host penny.example.com [--tunnel penny] [--team-domain team.cloudflareaccess.com] [--aud TAG] [--dry-run]",
  );
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`.trim());
  if (dryRun) return "";
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.interactive ? "inherit" : "pipe",
  });
}

try {
  const version = run("cloudflared", ["--version"]).trim();
  console.log(`Using ${version}`);
} catch {
  console.error(
    "cloudflared is not installed. Install it from the official Cloudflare documentation, then run this script again.",
  );
  console.error("https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/");
  process.exit(1);
}

try {
  run("cloudflared", ["tunnel", "login"], { interactive: true });
  run("cloudflared", ["tunnel", "create", tunnel], { interactive: true });
  run("cloudflared", ["tunnel", "route", "dns", tunnel, host], { interactive: true });
} catch {
  console.error("Tunnel setup stopped. Check the cloudflared output above and retry.");
  process.exit(1);
}

const port = process.env.PORT ?? "3000";
console.log(`
Tunnel created. Add this to the cloudflared config file (usually ~/.cloudflared/config.yml):

tunnel: ${tunnel}
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ${host}
    service: http://127.0.0.1:${port}
  - service: http_status:404

Then install the service:
  cloudflared service install

Cloudflare Access checklist:
  1. Create a self-hosted Access application for ${host}.
  2. Add an allow policy for the household identities only.
  3. Copy the team domain and the application AUD tag.
  4. In Penny, Settings, Privacy, Remote access, choose the named tunnel and paste them.
  5. Turn on the app lock and test from outside the home.

${teamDomain ? `Team domain: ${teamDomain}` : "Team domain: read it from the Access application."}
${aud ? `AUD tag: ${aud}` : "AUD tag: read it from the Access application."}
${dryRun ? "Dry run only: no commands were executed." : "Do not commit the tunnel credentials file."}
`);
