import { merchantMark } from "@/lib/merchant-mark";

/** Readable letter on the brand colour: dark on light colours (Paz yellow), white on the rest. */
function ink(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#111111" : "#ffffff";
}

/** The merchant's mark beside its name in transaction rows. Decorative: the name is read out already. */
export function MerchantMark({ name, size = 28 }: { name: string; size?: number }) {
  const m = merchantMark(name);
  // A real logo sits on white in both themes: that is the ground brand marks are drawn for.
  if (m.logo)
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-black/10"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a small local PNG; next/image adds nothing here */}
        <img
          src={m.logo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-[12%]"
        />
      </span>
    );
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold leading-none"
      style={{
        width: size,
        height: size,
        background: m.color,
        color: ink(m.color),
        fontSize: Math.round(size * 0.45),
      }}
    >
      {m.letter}
    </span>
  );
}
