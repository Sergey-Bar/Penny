import { describe, expect, it } from "vitest";
import {
  MAX_ABS_MINOR,
  MoneyContractError,
  assertCanonicalAmount,
  minorToAmount,
  parseMoneyToMinor,
} from "@/lib/money-contract";

describe("money contract", () => {
  it("parses strings and numbers into exact agorot", () => {
    expect(parseMoneyToMinor("12.34")).toBe(1234);
    expect(parseMoneyToMinor("-0.05")).toBe(-5);
    expect(parseMoneyToMinor(10.5)).toBe(1050);
    expect(parseMoneyToMinor(0.1 + 0.2)).toBe(30);
    expect(minorToAmount(-5)).toBe(-0.05);
  });

  it("rejects more than two decimals", () => {
    expect(() => parseMoneyToMinor("1.001")).toThrow(MoneyContractError);
    expect(() => parseMoneyToMinor(1.001)).toThrow(MoneyContractError);
    expect(() => assertCanonicalAmount("1.001")).toThrow(/two decimals/);
  });

  it("rejects unsafe magnitudes and junk", () => {
    expect(() => parseMoneyToMinor(MAX_ABS_MINOR / 100 + 1)).toThrow(/too large/);
    expect(() => parseMoneyToMinor("abc")).toThrow(/Invalid amount/);
    expect(() => parseMoneyToMinor(Number.NaN)).toThrow(/Invalid amount/);
    expect(() => minorToAmount(1.5)).toThrow(/integer/);
  });

  it("accepts exactly the maximum", () => {
    expect(parseMoneyToMinor(MAX_ABS_MINOR / 100)).toBe(MAX_ABS_MINOR);
  });

  it("handles shorthand decimals and rejects string overflow", () => {
    expect(parseMoneyToMinor(".5")).toBe(50);
    expect(parseMoneyToMinor("5.")).toBe(500);
    expect(parseMoneyToMinor("+1.20")).toBe(120);
    expect(() => parseMoneyToMinor("100000000.01")).toThrow(/too large/);
    expect(() => parseMoneyToMinor("9999999999999")).toThrow(/too large/);
    expect(() => minorToAmount(MAX_ABS_MINOR + 1)).toThrow(/too large/);
  });
});
