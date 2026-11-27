"use client";

import type { ReactNode } from "react";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { cn } from "@/lib/utils";

/** One column on narrow phones, two on tablets, three on wide screens so names and dates fit without clipping. */
export function InstitutionGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

/**
 * One institution: its mark and name on top, then whatever the caller needs
 * (a connect button, a sync button, a status line). The name area is the button.
 */
export function InstitutionTile({
  label,
  color,
  domain,
  subline,
  selected,
  onClick,
  labelFor,
  children,
  className,
}: {
  label: string;
  color: string;
  domain?: string;
  subline?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  /** Accessible name when the tile does more than pick the institution. */
  labelFor?: string;
  children?: ReactNode;
  className?: string;
}) {
  const head = (
    <>
      <ProviderBadge color={color} name={label} domain={domain} size={30} radius={8} />
      <span
        title={label}
        className="min-w-0 flex-1 line-clamp-2 text-footnote font-medium leading-tight"
      >
        {label}
      </span>
    </>
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5 transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border/60 bg-card",
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          aria-label={labelFor}
          className="flex min-h-11 items-center gap-2 rounded-md text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-11 items-center gap-2">{head}</div>
      )}
      {subline && (
        <div className="line-clamp-2 text-caption leading-snug text-muted-foreground">
          {subline}
        </div>
      )}
      {children}
    </div>
  );
}
