import { describe, expect, it } from "vitest";
import { normalizeMerchantV1, normalizeMerchantV2 } from "@/lib/merchant-normalize";

describe("merchant normalization v2", () => {
  it("strips processor prefixes and legal suffixes", () => {
    expect(normalizeMerchantV2("PAYPAL *SPOTIFY")).toBe("spotify");
    expect(normalizeMerchantV2("SQ *COFFEE LTD")).toBe("coffee");
    expect(normalizeMerchantV2("Wolt בע״מ")).toBe("wolt");
  });

  it("strips branch, store and trailing date noise", () => {
    expect(normalizeMerchantV2("AMZN Mktp - 4421")).toBe("amazon");
    expect(normalizeMerchantV2("Super-Pharm branch 123")).toBe("super-pharm");
    expect(normalizeMerchantV2("Spotify 12/03/2026")).toBe("spotify");
    expect(normalizeMerchantV2("Spotify 2026-03-12")).toBe("spotify");
  });

  it("folds Hebrew final letters and punctuation", () => {
    expect(normalizeMerchantV2("חנות,")).toBe(normalizeMerchantV2("חנות"));
    expect(normalizeMerchantV2("שופרסל.")).toBe("שופרסל");
  });

  it("keeps v1 stable for dual reads", () => {
    expect(normalizeMerchantV1("AMZN Mktp - 4421")).toBe("amzn mktp");
    expect(normalizeMerchantV1("wolt*")).toBe("wolt");
  });
});
