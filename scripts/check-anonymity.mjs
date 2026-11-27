#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".std",
  "node_modules",
  "data",
  "coverage",
  "dist-desktop",
  "playwright-report",
  "test-results",
  "e2e-results",
]);
const TEXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".sql",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".env",
  ".example",
  ".txt",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(value) {
  return normalize(value).split(" ").filter(Boolean);
}

const plainTerms = (process.env.PENNY_ANON_TERMS ?? "").split(",").map(normalize).filter(Boolean);
const hashedTerms = new Set(
  (process.env.PENNY_ANON_TERM_HASHES ?? process.env.PENNY_ANON_SOURCE_HASHES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

if (plainTerms.length === 0 && hashedTerms.size === 0) {
  console.log("anonymity: no source hashes configured, scan skipped");
  process.exit(0);
}

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") && entry.name !== ".env.example" && entry.name !== ".github")
          continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full);
        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.has(entry.name)) walk(full);
          continue;
        }
        if (TEXT.has(path.extname(entry.name)) || entry.name === ".env.example") out.push(rel);
      }
    };
    walk(ROOT);
    return out;
  }
}

function diffLines() {
  try {
    const diff = execFileSync("git", ["diff", "--unified=0", "--no-color"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return diff
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1));
  } catch {
    return null;
  }
}

function matches(text) {
  const tokens = words(text);
  for (let size = 1; size <= 4; size++) {
    for (let index = 0; index + size <= tokens.length; index++) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (plainTerms.some((term) => phrase.includes(term))) return phrase;
      if (hashedTerms.has(hash(phrase))) return phrase;
    }
  }
  return null;
}

const findings = [];
if (process.argv.includes("--diff")) {
  const lines = diffLines();
  if (lines == null) {
    console.log("anonymity: no git diff available, scanning tracked files");
  } else {
    for (const line of lines) {
      if (matches(line)) findings.push({ file: "(diff)", line: 0 });
    }
  }
}

if (findings.length === 0) {
  for (const file of trackedFiles()) {
    if (file === "scripts/check-anonymity.mjs") continue;
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    const rows = text.split(/\r?\n/);
    for (let index = 0; index < rows.length; index++) {
      if (matches(rows[index])) findings.push({ file, line: index + 1 });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings.slice(0, 50))
    console.error(`anonymity: ${finding.file}${finding.line ? `:${finding.line}` : ""}`);
  console.error(`anonymity: ${findings.length} match(es); remove source-derived names or quotes`);
  process.exit(1);
}
console.log("anonymity: no source-derived names found");
