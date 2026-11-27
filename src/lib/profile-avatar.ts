// Shared by the API (validation) and the /profiles UI (pickers).
import { PET_COLORS, PET_SKINS } from "./pet";
// The app's own blues and a few calm companions; no violet since the palette changed.
export const AVATAR_COLORS = [
  "#1657ff",
  "#0aa5e0",
  "#0a8f6a",
  "#d98a1a",
  "#d6456f",
  "#3f5b8a",
  "#12a3a3",
  "#6b7280",
] as const;
/** Colours offered before the palette changed. No longer offered, still accepted, so saving an older profile never fails. */
const RETIRED_AVATAR_COLORS: readonly string[] = [
  "#3d2fd3",
  "#7c5cff",
  "#e0679b",
  "#f08a4b",
  "#e8b931",
  "#4caf7a",
  "#2fa7c9",
];

/**
 * The colour a profile is drawn on: its own choice, or a steady one from its id. A colour from the retired palette is
 * shown as its counterpart in the current one, so nobody's saved profile changes and no avatar stays violet.
 */
export function avatarColorFor(id: number, saved: string | null | undefined): string {
  const fallback = AVATAR_COLORS[Math.abs(id - 1) % AVATAR_COLORS.length];
  if (!saved) return fallback;
  const retired = RETIRED_AVATAR_COLORS.indexOf(saved.toLowerCase());
  return retired >= 0 ? AVATAR_COLORS[retired % AVATAR_COLORS.length] : saved;
}

/** @unfinished unused since 4447003 (2026-11-14) removed its last caller; kept for the owner to decide */
export const AVATAR_EMOJIS = [
  "🙂",
  "😎",
  "🦊",
  "🐼",
  "🐱",
  "🐶",
  "🦁",
  "🐸",
  "🌻",
  "🌙",
  "⭐",
  "🚀",
  "🎧",
  "🏠",
  "💼",
  "🎨",
] as const;

/** Illustrated avatars, stored in avatarEmoji as "@<id>" so no schema change is needed. */
export const AVATAR_ART = [
  "fox",
  "bear",
  "cat",
  "owl",
  "frog",
  "panda",
  "robot",
  "sun",
  "ghost",
  "bunny",
  "alien",
  "penguin",
] as const;
export type AvatarArtId = (typeof AVATAR_ART)[number];

export function avatarArtId(avatarEmoji: string | null | undefined): AvatarArtId | null {
  const id = avatarEmoji?.startsWith("@") ? avatarEmoji.slice(1) : null;
  return (AVATAR_ART as readonly string[]).includes(id ?? "") ? (id as AvatarArtId) : null;
}

/** The seeded "Default" profile reads better as the viewer's own ("Me"). */
export function profileName(name: string, me: string) {
  return name === "Default" ? me : name;
}

/** A profile's own Pip: the same face as the household pet, in its own look. color "" = theme accent, skin "" = flat. */
export interface ProfilePip {
  color: string;
  skin: string;
  name: string;
}

/**
 * A stable starting Pip for a profile that has none yet.
 * @unfinished unused since a0a45cf (2026-11-21) removed its last caller; kept for the owner to decide
 */
export const defaultPip = (id: number): ProfilePip => ({
  color: PET_COLORS[Math.abs(id - 1) % PET_COLORS.length],
  skin: "",
  name: "",
});

/** null when it isn't a Pip (stored JSON is read through this too). */
export function parsePip(raw: unknown): ProfilePip | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    color:
      typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : "",
    skin: (PET_SKINS as readonly unknown[]).includes(r.skin) ? String(r.skin) : "",
    name: typeof r.name === "string" ? r.name.trim().slice(0, 24) : "",
  };
}

export interface AvatarInput {
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarPet?: ProfilePip | null;
  avatarPhoto?: string | null;
}

/** Picks avatar fields out of a request body. Absent = untouched, null/"" = cleared. */
export function parseAvatar(body: unknown): AvatarInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: AvatarInput = {};
  if ("avatarEmoji" in b) {
    const v = b.avatarEmoji;
    if (v === null || v === "") out.avatarEmoji = null;
    else if (typeof v === "string" && v.trim() && v.length <= 8) out.avatarEmoji = v.trim();
    else return { error: "avatarEmoji must be at most 8 characters" };
  }
  if ("avatarColor" in b) {
    const v = b.avatarColor;
    if (v === null || v === "") out.avatarColor = null;
    else if (
      typeof v === "string" &&
      [...AVATAR_COLORS, ...RETIRED_AVATAR_COLORS].includes(v.toLowerCase())
    )
      out.avatarColor = v.toLowerCase();
    else return { error: "avatarColor must be one of the palette colours" };
  }
  if ("avatarPet" in b) {
    const v = b.avatarPet;
    if (v === null) out.avatarPet = null;
    else if ((out.avatarPet = parsePip(v)) == null) return { error: "avatarPet must be an object" };
  }
  if ("avatarPhoto" in b) {
    const v = b.avatarPhoto;
    // A small picture the browser already squared and shrank; anything else (another type, a huge file) is refused.
    if (v === null || v === "") out.avatarPhoto = null;
    else if (
      typeof v === "string" &&
      v.length <= MAX_PHOTO &&
      /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(v)
    )
      out.avatarPhoto = v;
    else return { error: "avatarPhoto must be a JPEG, PNG or WebP data URL under 300 KB" };
  }
  return out;
}

const MAX_PHOTO = 300_000;
