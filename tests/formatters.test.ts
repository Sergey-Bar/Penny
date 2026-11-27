import { it, expect, vi, afterEach } from "vitest";
import { formatCurrency, formatLastSync, getMonthRange } from "@/lib/formatters";

afterEach(() => vi.useRealTimers());

it("shows shekels with two decimals and no sign (the sign is drawn by the caller)", () => {
  expect(formatCurrency(-1234.5)).toBe("₪1,234.50");
  expect(formatCurrency(0)).toBe("₪0.00");
  expect(formatCurrency(10, "USD")).toContain("10.00");
});

it("month range covers the whole month, leap February included", () => {
  expect(getMonthRange(new Date(2028, 1, 10))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  expect(getMonthRange(new Date(2026, 11, 31))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
});

it("last sync reads the DB's UTC time and steps minute, hour, day, week, month", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
  const ago = (ms: number) =>
    new Date(Date.now() - ms).toISOString().slice(0, 19).replace("T", " ");
  expect(formatLastSync(null)).toBe("Never synced");
  expect(formatLastSync(ago(30_000))).toBe("just now");
  expect(formatLastSync(`${ago(5 * 60_000).replace(" ", "T")}Z`)).toBe("5m ago");
  expect(formatLastSync(ago(5 * 60_000))).toBe("5m ago");
  expect(formatLastSync(ago(3 * 3_600_000))).toBe("3h ago");
  expect(formatLastSync(ago(2 * 86_400_000))).toBe("2d ago");
  expect(formatLastSync(ago(14 * 86_400_000))).toBe("2w ago");
  expect(formatLastSync(ago(60 * 86_400_000))).toBe("2mo ago");
  expect(formatLastSync("2026-07-01 00:00:00")).toBe("just now"); // clock skew: never "in the future"
});
