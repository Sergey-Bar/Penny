import { describe, expect, it } from "vitest";
import { homeViewFrom } from "@/lib/home-view";

describe("homeViewFrom", () => {
  it("opens Home on Focus unless the detailed dashboard was chosen", () => {
    expect(homeViewFrom(undefined)).toBe("focus");
    expect(homeViewFrom(null)).toBe("focus");
    expect(homeViewFrom("")).toBe("focus");
    expect(homeViewFrom("focus")).toBe("focus");
    expect(homeViewFrom("anything-else")).toBe("focus");
    expect(homeViewFrom("detailed")).toBe("detailed");
  });
});

import { AVATAR_COLORS, avatarColorFor } from "@/lib/profile-avatar";

describe("avatarColorFor", () => {
  it("gives a profile with no choice a steady colour from the palette", () => {
    expect(AVATAR_COLORS).toContain(avatarColorFor(1, null));
    expect(avatarColorFor(3, null)).toBe(avatarColorFor(3, undefined));
  });
  it("keeps a current choice and shows a retired one as its counterpart", () => {
    expect(avatarColorFor(1, AVATAR_COLORS[4])).toBe(AVATAR_COLORS[4]);
    expect(avatarColorFor(1, "#7C5CFF")).toBe(AVATAR_COLORS[1]);
    expect(avatarColorFor(1, "#7c5cff")).not.toBe("#7c5cff");
  });
});
