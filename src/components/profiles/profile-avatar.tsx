"use client";

import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/profile-avatar";
import type { Profile } from "@/lib/types";

type AvatarLike = Pick<Profile, "id" | "name"> & {
  avatarColor?: string | null;
  avatarPhoto?: string | null;
};

const SKIN = ["#f2c9a5", "#e3ab82", "#c98d63", "#9a6642", "#f6d7bd"];
const HAIR = ["#2b211c", "#5a3a22", "#8a5a2b", "#c9a15a", "#3b3b46", "#a8442a"];

/**
 * A drawn person for a profile with no photo: head, hair and shoulders on the profile's colour. Which skin tone, hair
 * colour and hair style it gets is fixed by the profile's id, so each person keeps the same face everywhere.
 */
function Figure({ id }: { id: number }) {
  const n = Math.abs(id);
  const skin = SKIN[n % SKIN.length];
  const hair = HAIR[(n * 7 + 3) % HAIR.length];
  const style = (n * 3 + 1) % 4;
  return (
    <svg viewBox="0 0 64 64" className="size-full" focusable="false">
      {/* shoulders */}
      <path d="M10 66c0-13 9.500-20 22-20s22 7 22 20z" fill="rgb(255 255 255 / 0.92)" />
      {/* long hair falls behind the head */}
      {style === 1 && <path d="M17 30c0-11 6.500-18 15-18s15 7 15 18v15H17z" fill={hair} />}
      <rect x="27.500" y="38" width="9" height="10" rx="4" fill={skin} />
      <circle cx="32" cy="29" r="12.500" fill={skin} />
      {style === 0 && (
        <path
          d="M19.500 28c0-9 5.500-14.500 12.500-14.500S44.500 19 44.500 28c-3-5-7.500-7-12.500-7s-9.500 2-12.500 7z"
          fill={hair}
        />
      )}
      {style === 1 && (
        <path
          d="M19.500 29c0-9.500 5.500-15.500 12.500-15.500S44.500 19.500 44.500 29c-2.500-4.500-6-7.500-12.500-7.500S22 24.500 19.500 29z"
          fill={hair}
        />
      )}
      {style === 2 && (
        <>
          <path
            d="M19.500 27c0-8.500 5.500-13.500 12.500-13.500S44.500 18.500 44.500 27c-4-3.500-8-5-12.500-5s-8.500 1.500-12.500 5z"
            fill={hair}
          />
          <circle cx="32" cy="12.500" r="5" fill={hair} />
        </>
      )}
      {style === 3 && (
        <path
          d="M19.500 27.500C19 18 25 13 33 13.500c7 .500 11.500 5.500 11.500 13-3-3-6-4.500-9.500-5-5.500-.500-11 1.500-15.500 6z"
          fill={hair}
        />
      )}
      <circle cx="27.500" cy="30" r="1.400" fill="#2b211c" />
      <circle cx="36.500" cy="30" r="1.400" fill="#2b211c" />
      <path
        d="M28.500 34.500c2 1.800 5 1.800 7 0"
        fill="none"
        stroke="#2b211c"
        strokeWidth="1.300"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A person's picture: their photo, or a drawn figure on their colour (a stable one until they pick). */
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
        "flex size-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white",
        className,
      )}
      style={profile.avatarPhoto ? undefined : { background: color }}
    >
      {profile.avatarPhoto ? (
        // A small data URL; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarPhoto} alt="" className="size-full object-cover" />
      ) : (
        <Figure id={profile.id} />
      )}
    </span>
  );
}
