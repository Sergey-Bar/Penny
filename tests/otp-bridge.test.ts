import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOtpRequest,
  deliverOtp,
  hasPendingOtp,
  listPendingOtps,
  registerOtpRequest,
} from "@/server/sync/otp-bridge";

/** The one-time code travels from the browser POST to the scraper waiting on it. */
describe("otp bridge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hands the submitted code to the waiting scrape and clears the request", async () => {
    const req = registerOtpRequest(1, 10, "oneZero");
    expect(hasPendingOtp(1)).toBe(false); // parked only once the scraper asks
    const code = req.wait();
    expect(hasPendingOtp(1)).toBe(true);
    expect(deliverOtp(1, 10, "123456")).toEqual({ ok: true });
    await expect(code).resolves.toBe("123456");
    expect(hasPendingOtp(1)).toBe(false);
    // A second submit for the same run finds nothing.
    expect(deliverOtp(1, 10, "123456")).toEqual({ ok: false, reason: "No pending OTP request." });
  });

  it("returns the same promise when the scraper asks twice", async () => {
    const req = registerOtpRequest(2, 10, "oneZero");
    const a = req.wait();
    expect(req.wait()).toBe(a);
    deliverOtp(2, 10, "1");
    await expect(a).resolves.toBe("1");
  });

  it("refuses a code sent from another workspace and keeps waiting", async () => {
    const req = registerOtpRequest(3, 10, "oneZero");
    const code = req.wait();
    expect(deliverOtp(3, 99, "000000")).toEqual({ ok: false, reason: "Workspace mismatch." });
    expect(hasPendingOtp(3)).toBe(true);
    deliverOtp(3, 10, "654321");
    await expect(code).resolves.toBe("654321");
  });

  it("rejects after five minutes without a code", async () => {
    const code = registerOtpRequest(4, 10, "oneZero").wait();
    const settled = expect(code).rejects.toThrow(/Timed out waiting for the one-time code/);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(hasPendingOtp(4)).toBe(true);
    vi.advanceTimersByTime(1);
    await settled;
    expect(hasPendingOtp(4)).toBe(false);
  });

  it("a code delivered in time stops the timeout", async () => {
    const code = registerOtpRequest(5, 10, "oneZero").wait();
    deliverOtp(5, 10, "42");
    vi.advanceTimersByTime(10 * 60_000);
    await expect(code).resolves.toBe("42");
  });

  it("cancel rejects the waiting scrape with the given reason, or a default one", async () => {
    const a = registerOtpRequest(6, 10, "oneZero").wait();
    cancelOtpRequest(6, "Scrape completed");
    await expect(a).rejects.toThrow("Scrape completed");
    expect(hasPendingOtp(6)).toBe(false);

    const b = registerOtpRequest(7, 10, "oneZero").wait();
    cancelOtpRequest(7);
    await expect(b).rejects.toThrow("OTP request cancelled.");
    // Cancelling when nothing waits is harmless.
    expect(() => cancelOtpRequest(7)).not.toThrow();
  });

  it("a new request for the same run supersedes the old one", async () => {
    const old = registerOtpRequest(8, 10, "oneZero").wait();
    const fresh = registerOtpRequest(8, 10, "oneZero");
    await expect(old).rejects.toThrow("OTP request superseded");
    // The superseded timer is cleared: it does not reject the new request later.
    const code = fresh.wait();
    deliverOtp(8, 10, "777");
    await expect(code).resolves.toBe("777");
  });

  it("the old timer firing after supersede does not touch the new request", async () => {
    const old = registerOtpRequest(9, 10, "oneZero").wait();
    old.catch(() => undefined);
    const fresh = registerOtpRequest(9, 10, "oneZero").wait();
    vi.advanceTimersByTime(4 * 60_000);
    expect(hasPendingOtp(9)).toBe(true);
    deliverOtp(9, 10, "x");
    await expect(fresh).resolves.toBe("x");
  });

  it("lists only the pending requests for one workspace, with their labels", async () => {
    const a = registerOtpRequest(20, 10, "oneZero", "One Zero").wait();
    const b = registerOtpRequest(21, 11, "hapoalim", "Bank Hapoalim").wait();
    expect(listPendingOtps(10)).toEqual([
      { syncRunId: 20, provider: "oneZero", label: "One Zero" },
    ]);
    expect(listPendingOtps(12)).toEqual([]);
    deliverOtp(20, 10, "1");
    deliverOtp(21, 11, "2");
    await Promise.all([a, b]);
  });
});
