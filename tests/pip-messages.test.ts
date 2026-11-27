import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";

describe("Pip translations", () => {
  it("has the same Pip keys in both locales", () => {
    expect(Object.keys(en.pip).sort()).toEqual(Object.keys(he.pip).sort());
    expect(en.pip.suggestions).toHaveLength(6);
    expect(he.pip.suggestions).toHaveLength(6);
  });

  it("keeps the provider consent copy about minimized facts", () => {
    expect(en.pip.consentBody).toContain("minimized");
    expect(he.pip.consentBody).toContain("מצומצם");
  });
});
