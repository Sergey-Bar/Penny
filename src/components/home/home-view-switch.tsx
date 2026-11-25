"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Focus, LayoutDashboard } from "lucide-react";
import { rememberHomeView, type HomeView } from "@/lib/home-view";

/**
 * Focus or Detailed, at the top of Home on a phone (wide screens have the same switch at the top of the sidebar).
 * The choice is remembered, so Home opens on it next time.
 */
export function HomeViewSwitch({ current }: { current: HomeView }) {
  const t = useTranslations("navGroups");
  const views = [
    { view: "focus" as const, href: "/focus", label: t("views.focus"), Icon: Focus },
    { view: "detailed" as const, href: "/", label: t("views.full"), Icon: LayoutDashboard },
  ];
  return (
    <div
      role="group"
      aria-label={t("groups.dashboard")}
      className="mx-auto mb-3 grid w-full max-w-xs grid-cols-2 gap-1 rounded-full bg-[var(--segmented)] p-1 md:hidden"
    >
      {views.map(({ view, href, label, Icon }) => (
        <Link
          key={view}
          href={href}
          onClick={() => rememberHomeView(view)}
          aria-current={view === current ? "page" : undefined}
          className={`press flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${view === current ? "bg-[var(--segmented-thumb)] text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </div>
  );
}
