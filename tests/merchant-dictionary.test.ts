import { describe, expect, it } from "vitest";
import {
  dictionaryCategory,
  dictionaryCategoryKey,
  dictionaryCategoryNames,
} from "@/lib/merchant-dictionary";
import {
  MANUAL_ONLY_CATEGORY_KEYS,
  SEEDED_CATEGORY_KEYS,
  categoryKeyForName,
} from "@/lib/category-keys";

describe("dictionaryCategory", () => {
  it.each([
    ['שופרסל דיל ת"א', "Groceries"],
    ["SHUFERSAL ONLINE", "Groceries"],
    ["רמי לוי תקשורת", "Mobile Phone"],
    ["רמי לוי שיווק השקמה", "Groceries"],
    ['פזגז בע"מ', "Gas"],
    ["פז ילו רמת גן", "Fuel"],
    ["חברת החשמל לישראל", "Electricity"],
    ["מי אביבים 2010", "Water"],
    ["עיריית תל אביב-יפו", "Arnona"],
    ["WOLT", "Food Delivery"],
    ["NETFLIX.COM", "Streaming"],
    ["ביטוח לאומי", "National Insurance"],
    ['ע"ר לתת', "Donations"],
    ["‏ארומה תל אביב‎", "Coffee & Cafes"],
    ["קרן השתלמות", "Savings"],
    ["החזר הלוואה", "Loans"],
    ["וטרינר", "Vet"],
  ])("%s → %s", (d, cat) => expect(dictionaryCategory(d, "expense")).toBe(cat));

  it("leaves ambiguous and unknown merchants alone", () => {
    for (const d of [
      "המשביר לצרכן",
      "העברה לחשבון",
      "מקסים רסטורנט",
      "דוד כהן",
      "יסמין פרחים",
      "פזורה",
    ])
      expect(dictionaryCategory(d, "expense")).toBeNull();
  });

  it("reads income separately and is kind-aware", () => {
    expect(dictionaryCategory("משכורת חברת אלפא", "income")).toBe("Salary");
    expect(dictionaryCategory("ביטוח לאומי קצבת ילדים", "income")).toBe("Benefits & Allowances");
    expect(dictionaryCategory("ביטוח לאומי", "expense")).toBe("National Insurance");
    expect(dictionaryCategory("שכר דירה", "income")).toBe("Rental Income");
    expect(dictionaryCategory("פנסיה", "income")).toBe("Pension");
    expect(dictionaryCategory("שופרסל", "income")).toBeNull();
  });

  it("returns a stable key that does not depend on a workspace rename", () => {
    expect(dictionaryCategoryKey("שופרסל דיל", "expense")).toBe("groceries");
    expect(dictionaryCategoryKey("משכורת", "income")).toBe("salary");
  });
});

describe("dictionary coverage", () => {
  it("names only categories that have a stable key", () => {
    const names = [...dictionaryCategoryNames("expense"), ...dictionaryCategoryNames("income")];
    const unkeyed = names.filter((name) => categoryKeyForName(name) == null);
    expect(unkeyed).toEqual([]);
  });

  it("covers every built-in leaf with a positive pattern or a documented manual-only reason", () => {
    const covered = new Set(
      [...dictionaryCategoryNames("expense"), ...dictionaryCategoryNames("income")]
        .map((name) => categoryKeyForName(name))
        .filter((key): key is string => key != null),
    );
    const missing = Object.values(SEEDED_CATEGORY_KEYS).filter(
      (key) => !covered.has(key) && !(key in MANUAL_ONLY_CATEGORY_KEYS),
    );
    expect(missing).toEqual([]);
    for (const reason of Object.values(MANUAL_ONLY_CATEGORY_KEYS))
      expect(reason.length).toBeGreaterThan(10);
  });
});
