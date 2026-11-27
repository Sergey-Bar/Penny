"use client";

import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/profile-avatar";
import type { Profile } from "@/lib/types";

type AvatarLike = Pick<Profile, "id" | "name"> & {
  avatarColor?: string | null;
  avatarPhoto?: string | null;
};

/**
 * A drawn face for a profile with no photo, in the spirit of streaming-app profile tiles: a rounded square of the
 * profile's colour with nothing on it but two eyes and a mouth, drawn large in white. Our own drawing. Which eyes and
 * mouth a profile gets is fixed by its id, so each person keeps the same face everywhere.
 */
function Face({ id }: { id: number }) {
  // One number spread over 4 kinds of eyes and 4 mouths: 16 faces, and neighbours never look alike.
  const k = Math.abs(id) * 7 + 3;
  const eyes = k % 4; // 0 dots, 1 tall, 2 happy arcs, 3 wink
  const mouth = Math.floor(k / 4) % 4; // 0 wide smile, 1 open grin, 2 small "o", 3 side smile
  const line = {
    fill: "none",
    stroke: "#fff",
    strokeWidth: 4.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 64 64" className="size-full" focusable="false">
      {eyes === 0 && (
        <g fill="#fff">
          <circle cx="21" cy="25" r="4.200" />
          <circle cx="43" cy="25" r="4.200" />
        </g>
      )}
      {eyes === 1 && (
        <g fill="#fff">
          <rect x="17.500" y="17" width="7" height="14" rx="3.500" />
          <rect x="39.500" y="17" width="7" height="14" rx="3.500" />
        </g>
      )}
      {eyes === 2 && (
        <g {...line}>
          <path d="M15.500 27c2.500-5 8.500-5 11 0" />
          <path d="M37.500 27c2.500-5 8.500-5 11 0" />
        </g>
      )}
      {eyes === 3 && (
        <>
          <circle cx="21" cy="25" r="4.200" fill="#fff" />
          <path d="M37.500 25.500h11" {...line} />
        </>
      )}
      {mouth === 0 && <path d="M17 39c7 10.500 23 10.500 30 0" {...line} />}
      {mouth === 1 && <path d="M18 38.500h28c0 8.500-6 14-14 14s-14-5.500-14-14z" fill="#fff" />}
      {mouth === 2 && <circle cx="32" cy="44" r="5" {...line} />}
      {mouth === 3 && <path d="M21 42c7 6 17 5 23-5" {...line} />}
    </svg>
  );
}

/** A person's picture: their photo, or a drawn face on a rounded square of their colour (a stable one until they pick). */
export function ProfileAvatar({
  profile,
  className,
}: {
  profile: AvatarLike;
  className?: string;
  px?: number;
}) {
  const color = avatarColorFor(profile.id, profile.avatarColor);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-[26%] text-sm font-semibold text-white",
        className,
      )}
      // A light corner and a deep one give the flat colour a little depth.
      style={
        profile.avatarPhoto
          ? undefined
          : {
              background: `linear-gradient(150deg, color-mix(in oklab, ${color}, white 22%), ${color} 48%, color-mix(in oklab, ${color}, black 24%))`,
            }
      }
    >
      {profile.avatarPhoto ? (
        // A small data URL; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarPhoto} alt="" className="size-full object-cover" />
      ) : (
        <Face id={profile.id} />
      )}
    </span>
  );
}
