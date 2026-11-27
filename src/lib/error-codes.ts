/**
 * Machine codes the API's shared error path sends in `{ error, code }`. The client words each one
 * itself (CODE_MESSAGES in api.ts), so the server's English text never has to be shown.
 */
export const ERROR_CODES = [
  "bad_json",
  "bad_money",
  "locked",
  "sync-running",
  "db_busy",
  "disk_full",
  "db_corrupt",
  "db_unavailable",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
