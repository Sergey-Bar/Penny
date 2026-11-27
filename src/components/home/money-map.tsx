"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Home,
  Landmark,
  LifeBuoy,
  PiggyBank,
  Plus,
  Scale,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getAssets, getCashAhead, getCashflowHealth } from "@/lib/api";
import { usePlan } from "@/hooks/use-plan";
import { useHousehold } from "@/hooks/use-household";
import { buildMoneyMap, type MapArea, type MapRow } from "@/lib/money-map";
import { shekels } from "@/lib/money";
import { CardShell, CardSkeleton } from "./card-shell";

const AREA: Record<MapArea, { icon: LucideIcon; tone: string }> = {
  cashflow: { icon: Wallet, tone: "var(--status-on-track)" },
  cushion: { icon: LifeBuoy, tone: "var(--chart-2)" },
  investments: { icon: TrendingUp, tone: "var(--chart-1)" },
  pension: { icon: PiggyBank, tone: "var(--chart-5)" },
  debts: { icon: Landmark, tone: "var(--expense)" },
  property: { icon: Home, tone: "var(--chart-4)" },
  netWorth: { icon: Scale, tone: "var(--chart-1)" },
};

/** "Your whole picture": a grid of compact tiles, one per money area; an empty area is a dashed invitation, never a 0. */
export function MoneyMap() {
  const t = useTranslations("home.map");
  const locale = useLocale();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const health = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead });
  const { plan } = usePlan();
  const { household, loading } = useHousehold();

  if (assets.isPending || health.isPending || cash.isPending || loading)
    return <CardSkeleton label={t("title")} height={220} className="mb-6" />;

  const { rows, more } = buildMoneyMap({
    forecast: cash.data?.safeToSpend ?? null,
    assets: assets.data?.assets ?? null,
    expenses: health.data?.hasData ? health.data.avgExpenses : null,
    emergencyMonths: plan.emergencyMonths,
    hasHomeEvent: household.events.some((e) => e.type === "homePurchase" || e.type === "movedIn"),
  });

  const tile = (r: MapRow) => {
    const { icon: Icon } = AREA[r.area];
    const v = r.value == null ? null : Math.round(r.value);
    const bad = v != null && v < 0 && r.area !== "debts";
    const owed = r.area === "debts" && v != null && v > 0;
    // Status colour: red for a shortfall or debt, green for "no debts", else the area's own hue.
    const tone =
      bad || owed
        ? "var(--expense)"
        : r.area === "debts" && v === 0
          ? "var(--status-on-track)"
          : AREA[r.area].tone;
    const cushionPct =
      r.area === "cushion" && v != null && r.target ? Math.min(100, (v / r.target) * 100) : null;
    const caption =
      v == null
        ? null
        : r.area === "debts" && v === 0
          ? t("noDebts")
          : r.area === "cashflow" && v < 0
            ? t("caption.cashflowNegative")
            : r.area === "cushion" && r.months != null
              ? t("caption.cushionMonths", { months: r.months, target: plan.emergencyMonths })
              : r.area === "debts" && r.count
                ? t("caption.debtsCount", { count: r.count })
                : t(`caption.${r.area}`);

    return (
      <li key={r.area}>
        <Link
          href={r.href}
          className={`flex h-full min-h-24 flex-col gap-1.5 rounded-2xl border p-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${v == null ? "border-dashed border-border" : "border-border/70"}`}
        >
          <span className="flex items-center gap-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full"
              style={
                v == null
                  ? undefined
                  : {
                      backgroundColor: `color-mix(in oklch, ${tone} 16%, transparent)`,
                      color: `color-mix(in oklch, ${tone} 70%, var(--foreground))`,
                    }
              }
              aria-hidden
            >
              <Icon className={`size-3.5 ${v == null ? "text-muted-foreground" : ""}`} />
            </span>
            <span className="line-clamp-2 min-w-0 text-footnote font-semibold leading-tight">
              {t(`area.${r.area}`)}
            </span>
          </span>
          {v == null ? (
            <span className="mt-auto flex items-start gap-1 text-caption text-primary">
              <Plus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{t(`invite.${r.area}`)}</span>
            </span>
          ) : (
            <>
              <span
                className="mt-auto text-headline font-semibold tabular-nums"
                style={owed || bad ? { color: "var(--expense)" } : undefined}
              >
                <bdi>{shekels(Math.abs(v), locale)}</bdi>
              </span>
              {cushionPct != null && (
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${cushionPct}%`,
                      backgroundColor:
                        cushionPct >= 100 ? "var(--status-on-track)" : "var(--status-heads-up)",
                    }}
                  />
                </span>
              )}
              <span className="line-clamp-2 text-caption text-muted-foreground">{caption}</span>
            </>
          )}
        </Link>
      </li>
    );
  };

  return (
    <CardShell label={t("title")} className="mb-6 h-auto">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {[...rows, ...more].map(tile)}
      </ul>
    </CardShell>
  );
}
