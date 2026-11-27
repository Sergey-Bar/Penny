import "server-only";

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir";
import { redact, redactError } from "./redact";

const MAX_BYTES = 1_000_000;
const EVENT_FILES = 7;

export type ErrorLogEntry = { at: string; scope: string; code?: string; message: string };

export const errorLogPath = (dir = dataDir()) => path.join(dir, "logs", "errors.log");
export const eventLogPath = (dir = dataDir()) => path.join(dir, "logs", "events.log");

export interface EventFields {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * One redacted JSON event per line, on stderr and in <dataDir>/logs/events.log (1 MB rotation,
 * seven files, owner-only). Never pass descriptions or amounts: they are not logged.
 */
export function logEvent(
  event: string,
  fields: EventFields = {},
  file: string | null = process.env.VITEST ? null : eventLogPath(),
): void {
  try {
    const clean: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (/pass(word)?|secret|token|auth|key|cookie|credential/i.test(key)) {
        clean[key] = "[redacted]";
        continue;
      }
      if (typeof value === "string") clean[key] = redact(value).slice(0, 500);
      else if (value === null) continue;
      else clean[key] = value;
    }
    const entry = { at: new Date().toISOString(), event, ...clean };
    const line = JSON.stringify(entry);
    console.error(line);
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      // Rotate events.log.1 ... events.log.6, dropping the oldest.
      for (let i = EVENT_FILES - 1; i >= 1; i--) {
        const from = i === 1 ? `${file}` : `${file}.${i - 1}`;
        const to = `${file}.${i}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
    }
    fs.appendFileSync(file, line + "\n", { mode: 0o600 });
  } catch {
    // Logging must never fail the operation it describes.
  }
}

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

/**
 * The one place server errors are reported: a redacted line on stderr, and the same as a JSON line
 * in <dataDir>/logs/errors.log (one rotation at ~1 MB), so a failure in a background job leaves a
 * trace the person can find. Never throws: a full disk must not turn a logged error into a crash.
 */
export function logError(
  scope: string,
  error: unknown,
  context?: Record<string, string | number | boolean>,
  // Unit tests exercise routes that fail on purpose; they must not write into a real data folder.
  file: string | null = process.env.VITEST ? null : errorLogPath(),
): void {
  try {
    const extra = context ? ` ${redact(JSON.stringify(context))}` : "";
    const message = redactError(error) + extra;
    const code = codeOf(error);
    console.error(`[${scope}] ${message}`);
    if (!file) return;
    const entry: ErrorLogEntry = { at: new Date().toISOString(), scope, code, message };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 });
  } catch {
    // Nowhere left to report to; the caller's own failure handling must still run.
  }
}

/** The newest `limit` entries, oldest first. Unreadable lines are skipped. */
export function readErrorLog(limit = 50, file = errorLogPath()): ErrorLogEntry[] {
  try {
    // The path is only known at run time; without the hint the bundler traces the whole project.
    const lines = fs
      .readFileSync(/*turbopackIgnore: true*/ file, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit);
    return lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as ErrorLogEntry];
      } catch {
        return []; // a line cut off by a crash mid-write
      }
    });
  } catch {
    return []; // no log yet
  }
}
