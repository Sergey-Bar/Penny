"use client";

import { useTranslations } from "next-intl";
import type { HouseholdMember } from "@/lib/household";
import { SHARED } from "@/lib/tags";

/** Compact native picker: not set / each member / shared. `fallback` names the account default shown when not set. */
export function OwnerPicker({
  value,
  members,
  onChange,
  label,
  fallback,
}: {
  value: string | null;
  members: HouseholdMember[];
  onChange: (owner: string | null) => void;
  label: string;
  fallback?: string | null;
}) {
  const t = useTranslations("tags");
  const nameOf = (id: string) =>
    id === SHARED ? t("shared") : (members.find((m) => m.id === id)?.name ?? "");
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="tap-target h-7 max-w-[8rem] rounded-md border border-border/60 bg-background px-1.5 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <option value="">
        {fallback ? t("defaultOwner", { name: nameOf(fallback) }) : t("ownerUnset")}
      </option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      <option value={SHARED}>{t("shared")}</option>
    </select>
  );
}
