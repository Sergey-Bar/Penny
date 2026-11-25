"use client";

import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/profile-avatar";
import type { Profile } from "@/lib/types";

type AvatarLike = Pick<Profile, "id" | "name"> & {
  avatarColor?: string | null;
  avatarPhoto?: string | null;
};

/**
 * A drawn buddy for a profile with no photo: a soft round character with big eyes, a mood and one accessory, on the
 * profile's colour. Our own character, in the playful spirit of map-app mascots. Which mood and accessory a profile
 * gets is fixed by its id, so each person keeps the same buddy everywhere.
 */
function Buddy({ id }: { id: number }) {
  const n = Math.abs(id);
  // Multipliers coprime with the number of choices, so consecutive profiles walk through every mood and accessory.
  const mood = (n * 3 + 1) % 4; // 0 smile, 1 grin, 2 wink, 3 cool
  const gear = (n * 5 + 2) % 6; // 0 cap, 1 headphones, 2 crown, 3 bow, 4 sprout, 5 beanie
  const ink = "#1b2233";
  const body = "#ffffff";
  return (
    <svg viewBox="5 2 54 58" className="size-full" focusable="false">
      {/* soft shadow under the buddy */}
      <ellipse cx="32" cy="57" rx="15" ry="3" fill="rgb(0 0 0 / 0.16)" />
      {/* body: a rounded blob, a little wider at the bottom */}
      <path
        d="M32 13c11 0 19 8.200 19 19.500 0 5.600-1.600 10.600-4.600 14.300-3.200 4-8.100 6.200-14.400 6.200s-11.200-2.200-14.400-6.200C14.600 43.100 13 38.100 13 32.500 13 21.200 21 13 32 13z"
        fill={body}
      />
      {/* cheeks */}
      <ellipse cx="21.500" cy="38" rx="3.200" ry="2.200" fill="#ff9aa8" opacity="0.75" />
      <ellipse cx="42.500" cy="38" rx="3.200" ry="2.200" fill="#ff9aa8" opacity="0.75" />
      {/* eyes */}
      {mood === 3 ? (
        // sunglasses
        <g fill={ink}>
          <rect x="18" y="27.500" width="12" height="8.500" rx="4" />
          <rect x="34" y="27.500" width="12" height="8.500" rx="4" />
          <rect x="29" y="29.500" width="6" height="2.200" rx="1" />
          <path
            d="M20.500 30.200h3.500"
            stroke="#fff"
            strokeWidth="1.300"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M36.500 30.200h3.500"
            stroke="#fff"
            strokeWidth="1.300"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      ) : (
        <>
          <ellipse cx="25" cy="31.500" rx="3.400" ry="4.200" fill={ink} />
          <circle cx="26.200" cy="29.900" r="1.250" fill="#fff" />
          {mood === 2 ? (
            <path
              d="M35.500 32c1.500-1.800 5.500-1.800 7 0"
              fill="none"
              stroke={ink}
              strokeWidth="2.200"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse cx="39" cy="31.500" rx="3.400" ry="4.200" fill={ink} />
              <circle cx="40.200" cy="29.900" r="1.250" fill="#fff" />
            </>
          )}
        </>
      )}
      {/* mouth */}
      {mood === 1 ? (
        <path
          d="M26.500 40.500h11c0 3.600-2.400 5.800-5.500 5.800s-5.500-2.200-5.500-5.800z"
          fill={ink}
        />
      ) : (
        <path
          d="M27 41.500c2.800 2.900 7.200 2.900 10 0"
          fill="none"
          stroke={ink}
          strokeWidth="2.200"
          strokeLinecap="round"
        />
      )}
      {/* one accessory */}
      {gear === 0 && (
        <g>
          <path d="M17.500 22.500C19 14.500 25 10 32 10s13 4.500 14.500 12.500z" fill="#ffcf3f" />
          <path d="M44 22.500h9.500c1.300 0 1.800-1.700.700-2.400L46.500 15z" fill="#f2a51a" />
          <circle cx="32" cy="10.500" r="1.800" fill="#f2a51a" />
        </g>
      )}
      {gear === 1 && (
        <g>
          <path
            d="M14 33c0-12.500 8-21 18-21s18 8.500 18 21"
            fill="none"
            stroke={ink}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="9.500" y="29" width="7.500" height="12" rx="3.700" fill="#ff5a7a" />
          <rect x="47" y="29" width="7.500" height="12" rx="3.700" fill="#ff5a7a" />
        </g>
      )}
      {gear === 2 && (
        <path
          d="M21 17.500l2-9.500 5 5.500 4-7 4 7 5-5.500 2 9.500z"
          fill="#ffcf3f"
          stroke="#f2a51a"
          strokeWidth="1.200"
          strokeLinejoin="round"
        />
      )}
      {gear === 3 && (
        <g fill="#ff5a7a">
          <path d="M32 14.500l-9.500-5c-1.200-.600-2.500.300-2.500 1.600v6.800c0 1.300 1.300 2.200 2.500 1.600z" />
          <path d="M32 14.500l9.500-5c1.200-.600 2.500.300 2.500 1.600v6.800c0 1.300-1.300 2.200-2.500 1.600z" />
          <circle cx="32" cy="14.500" r="3" fill="#e23d62" />
        </g>
      )}
      {gear === 4 && (
        <g>
          <path d="M32 14.500V8.500" stroke="#2f9e5b" strokeWidth="2.200" strokeLinecap="round" />
          <path d="M32 9.500c-1-4.500-5.500-6-9-4.500 1 4 4.500 5.500 9 4.500z" fill="#46c37b" />
          <path d="M32 9.500c1-4.500 5.500-6 9-4.500-1 4-4.500 5.500-9 4.500z" fill="#2f9e5b" />
        </g>
      )}
      {gear === 5 && (
        <g>
          <path d="M16.500 24C17.500 15 24 10.500 32 10.500S46.500 15 47.500 24z" fill="#3d7bff" />
          <rect x="14.500" y="21.500" width="35" height="6" rx="3" fill="#1f56d6" />
          <circle cx="32" cy="8.500" r="3.400" fill="#ffffff" />
        </g>
      )}
    </svg>
  );
}

/** A person's picture: their photo, or a drawn buddy on their colour (a stable one until they pick). */
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
        <Buddy id={profile.id} />
      )}
    </span>
  );
}
