import { describe, expect, it } from "vitest";
import { BRANDS, merchantMark } from "@/lib/merchant-mark";
import { LOCAL_MERCHANT_LOGOS } from "@/lib/merchant-logos.generated";

describe("merchantMark", () => {
  it("gives known brands their colour and initial", () => {
    expect(merchantMark("שופרסל דיל")).toMatchObject({ letter: "ש", color: "#e2001a" });
    expect(merchantMark("NETFLIX.COM")).toMatchObject({ letter: "N", color: "#e50914" });
    // Hebrew words have no \b edges: "פז דלק" is Paz, not Delek, and "גטו" is not Gett.
    expect(merchantMark("פז דלק").letter).toBe("פ");
    expect(merchantMark("גטו פיצה").color).not.toBe("#ffd700");
  });
  it("points a known brand at its bundled logo, and never at a remote address", () => {
    expect(merchantMark("שופרסל דיל").logo).toBe("/merchants/shufersal.co.il.png");
    for (const [, , , domain] of BRANDS) {
      const logo = merchantMark(domain).logo;
      if (logo) expect(logo).toBe(`/merchants/${domain}.png`);
    }
  });
  it("keeps the coloured initial when no logo is bundled", () => {
    expect(LOCAL_MERCHANT_LOGOS.has("victoryonline.co.il")).toBe(false);
    expect(merchantMark("ויקטורי")).toEqual({ letter: "ו", color: "#e30613" });
    expect(merchantMark("מאפיית הכיכר").logo).toBeUndefined();
  });
  it("gives any other merchant a steady colour and its first letter", () => {
    const a = merchantMark("מאפיית הכיכר");
    expect(a.letter).toBe("מ");
    expect(merchantMark("מאפיית הכיכר")).toEqual(a);
    expect(merchantMark("  !! 9to5 ").letter).toBe("9");
  });
});
