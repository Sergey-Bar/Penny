/** The value a memo edit is compared with: the latest queued write, else the saved memo. */
export function memoBaseline(
  pending: string | undefined,
  saved: string | null | undefined,
): string {
  return pending ?? saved ?? "";
}
