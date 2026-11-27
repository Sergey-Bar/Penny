import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A category as a tinted pill: dot in the category color, a faint 12% tint behind, and the label in the
 * category color pulled toward --foreground so it stays >=4.5:1 in light and dark (checked for every seeded color).
 * No color (uncategorized) falls back to the muted neutral pill.
 */
export function CategoryChip({
  color,
  children,
  className,
  title,
}: {
  color?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const style = color
    ? ({
        "--cat": color,
        backgroundColor: "color-mix(in oklch, var(--cat) 12%, transparent)",
        color: "color-mix(in oklch, var(--cat) 42%, var(--foreground))",
      } as CSSProperties)
    : undefined;
  return (
    <span
      data-slot="category-chip"
      title={title ?? (typeof children === "string" ? children : undefined)}
      style={style}
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        !color && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--cat)" }}
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
