"use client";

import { Forward } from "@/components/ui/dir-chevron";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import {
  dismissSuggestion,
  getAssets,
  getCashAhead,
  getCashflowHealth,
  getLifeProgress,
  getSuggestions,
  getTransactionsSummary,
  getWellbeing,
} from "@/lib/api";
import { wellbeingDue } from "@/lib/wellbeing";
import { todayState } from "@/lib/today-state";
import { lastCompleteMonth } from "@/lib/recap";
import { usePlan } from "@/hooks/use-plan";
import { useGentle } from "@/hooks/use-gentle";
import { gentleKey } from "@/lib/gentle";
import { useHousehold } from "@/hooks/use-household";
import { isGentle, newId } from "@/lib/household";
import { currentStage, LIFE_STAGES } from "@/lib/life-stages";
import { nextStep } from "@/lib/next-step";
import { allocate, liquidCash } from "@/lib/allocation";
import { shekels } from "@/lib/money";
import type { HomePayload } from "@/lib/types";

/**
 * This week in two lines (spending vs usual, what's free until payday), the one next thing to do today
 * (connect, sync, review, a finding…), plus the occasional wellbeing and recap links.
 * Lives inside the forecast card on Advanced mode's Home, on its dark surface.
 */
export function NextStep({
  home,
  homePending,
  homeFailed,
}: {
  home: HomePayload | undefined;
  homePending: boolean;
  homeFailed: boolean;
}) {
  const t = useTranslations("today");
  const tRecap = useTranslations("recap");
  const tWell = useTranslations("wellbeing");
  const locale = useLocale();
  const gentle = useGentle();
  const g = (key: string) => gentleKey(key, gentle, t.has);
  const { plan, loaded, failed: planFailed } = usePlan();
  const cashQuery = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead });
  const suggestionsQuery = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions });
  const wellbeingQuery = useQuery({ queryKey: ["wellbeing"], queryFn: getWellbeing });
  const cashflowQuery = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  const assetsQuery = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const lifeQuery = useQuery({ queryKey: ["life-progress"], queryFn: getLifeProgress });
  const {
    household,
    loading: householdLoading,
    failed: householdFailed,
    save: saveHousehold,
    saving: householdSaving,
  } = useHousehold();
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: (key: string) => dismissSuggestion(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
    onError: () => toast.error(t("step.dismissFailed")),
  });
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const attention = home?.needsAttention;
  const state = todayState({
    pending: homePending || !loaded || cashQuery.isPending || suggestionsQuery.isPending,
    failed:
      homeFailed ||
      planFailed ||
      cashQuery.isError ||
      suggestionsQuery.isError ||
      !!home?.errors.some(
        (error) => error.section === "needsAttention" || error.section === "bankHealth",
      ),
    hasCash: !!cashQuery.data,
    balance: cashQuery.data?.safeToSpend ?? null,
    connected: (home?.bankHealth?.length ?? 0) > 0,
    needsReview:
      !!attention &&
      (attention.uncategorized > 0 || attention.lowConfidence > 0 || attention.flagged > 0),
    hasSuggestions: suggestions.length > 0,
  });
  const actions = {
    cash: { href: "/overview?tab=ahead", label: t("reviewBills"), hint: t("reviewBillsHint") },
    connect: { href: "/settings/bank", label: t("connect"), hint: t("connectHint") },
    sync: { href: "/settings/bank", label: t("manageBanks"), hint: t("syncHint") },
    review: { href: "/transactions", label: t("reviewAction"), hint: t(g("reviewHint")) },
    suggestions: {
      href: "/more#suggestions",
      label: t("nextSuggestion", { count: suggestions.length }),
      hint: t(g("suggestionHint")),
    },
  };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Gentle mode silences money nudges even when no life stage fits.
  const stage =
    currentStage(household, plan) ?? (isGentle(household) ? { stageId: "", gentle: true } : null);
  const stageDef = stage?.stageId ? LIFE_STAGES.find((s) => s.id === stage.stageId) : undefined;
  const doneItems = (stage && lifeQuery.data?.[stage.stageId]) ?? [];
  // Without progress we can't tell a done item from an open one.
  const stageItemId =
    !stage || !stageDef || !lifeQuery.isSuccess
      ? null
      : stage.gentle
        ? (stageDef.items.find((item) => !doneItems.includes(item.id))?.id ?? null)
        : doneItems.includes(stageDef.keyItem)
          ? null
          : stageDef.keyItem;
  const cf = cashflowQuery.data;
  const step = nextStep({
    today: state,
    month: today.slice(0, 7),
    stage,
    stageItemId,
    // Unknown household = unknown gentle mode, and unknown assets = wrong amounts: skip money steps then.
    alloc:
      !householdFailed && assetsQuery.isSuccess && cf?.hasData && cf.avgIncome > 0
        ? allocate({
            income: cf.avgIncome,
            expenses: cf.avgExpenses,
            liquidNow: liquidCash(assetsQuery.data.assets),
            emergencyMonths: plan.emergencyMonths,
          })
        : null,
    suggestions: householdFailed ? [] : suggestions,
    dismissed: new Set(suggestionsQuery.data?.dismissed ?? []),
    // Yes would save over a household we couldn't read.
    // Drop events already saved, so a double Yes can't add them twice.
    stageHints: householdFailed
      ? []
      : (suggestionsQuery.data?.stageHints ?? []).filter(
          (h) => !household.events.some((e) => e.type === h.event),
        ),
  });
  const confirmStage = (event: NonNullable<typeof step>["event"]) =>
    event &&
    saveHousehold(
      { events: [...household.events, { id: newId(), type: event, date: today }] },
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suggestions"] }) },
    );
  const L = locale === "he" ? "he" : "en";
  const amount = shekels(Math.round(step?.amount ?? 0), locale);
  const next =
    !step || step.kind === "stageAsk"
      ? null
      : step.kind in actions
        ? actions[step.kind as keyof typeof actions]
        : step.kind === "stageItem"
          ? {
              href: step.href,
              label: stageDef?.items.find((item) => item.id === step.itemId)?.text[L] ?? "",
              hint: t(stage?.gentle ? "step.stageItem.hint_gentle" : "step.stageItem.hint"),
            }
          : {
              href: step.href,
              label: t(`step.${step.kind}.label`, { amount }),
              hint: t(g(`step.${step.kind}.hint`), {
                amount,
                months: step.months ?? 0,
                n: plan.emergencyMonths,
              }),
            };
  const linkClass =
    "inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

  if (state === "loading" || state === "error") return null;
  // Wait for the step inputs so the tile doesn't jump from one step to another.
  if (householdLoading || cashflowQuery.isPending || assetsQuery.isPending || lifeQuery.isPending)
    return null;
  return (
    <div className="mt-4 space-y-2">
      <WeekSummary />
      {stageDef && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span>{stageDef.title[L]}</span>
          <span aria-hidden>·</span>
          <Link href="/life" className={linkClass}>
            {t("stage")}
          </Link>
        </p>
      )}
      {next && step && (
        <div className="flex items-center border-t border-white/20 pt-2">
          <Link
            href={next.href}
            className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl px-4 py-3 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="min-w-0">
              <span className="block text-caption text-muted-foreground">{t(g("nextLabel"))}</span>
              <span className="block font-semibold">{next.label}</span>
              <span className="block text-sm leading-relaxed text-muted-foreground">
                {next.hint}
              </span>
            </span>
            <Forward className="size-5 shrink-0" />
          </Link>
          {step.dismissible && (
            <button
              type="button"
              aria-label={t("step.notNow")}
              title={t("step.notNow")}
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(step.key)}
              className="me-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      )}
      {step?.kind === "stageAsk" && step.event && (
        <div className="border-t border-white/20 px-4 pt-3">
          <p className="text-caption text-muted-foreground">{t("step.stageAsk.label")}</p>
          <p className="font-semibold">{t(`step.stageAsk.${step.event}`)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={householdSaving || dismiss.isPending}
              onClick={() => confirmStage(step.event)}
              className="min-h-11 rounded-full bg-white/25 px-5 text-sm font-semibold hover:bg-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
            >
              {t("step.stageAsk.yes")}
            </button>
            <button
              type="button"
              disabled={householdSaving || dismiss.isPending}
              onClick={() => dismiss.mutate(step.key)}
              className="min-h-11 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
            >
              {t("step.stageAsk.no")}
            </button>
          </div>
        </div>
      )}
      {!step && state === "done" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          {t("allDone")}
        </p>
      )}
      <div className="flex flex-wrap gap-x-5">
        {wellbeingQuery.data && wellbeingDue(wellbeingQuery.data, today) && (
          <Link href="/wellbeing" className={linkClass}>
            {tWell("todayLink")}
            <Forward />
          </Link>
        )}
        {Number(today.slice(8)) <= 7 && (
          <Link href="/recap" className={linkClass}>
            {tRecap("todayLink", {
              month: new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
                new Date(`${lastCompleteMonth(today)}-15T12:00:00Z`),
              ),
            })}
            <Forward />
          </Link>
        )}
      </div>
    </div>
  );
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

/** "This week": spending vs a usual week (the last four), the biggest spend, and what stays free until payday. */
function WeekSummary() {
  const t = useTranslations("week");
  const locale = useLocale();
  const gentle = useGentle();
  const g = (key: string) => gentleKey(key, gentle, t.has);
  const week = useQuery({
    queryKey: ["summary-week"],
    queryFn: () => getTransactionsSummary({ from: daysAgo(6), to: iso(new Date()) }),
  }).data;
  const month = useQuery({
    queryKey: ["summary-4w"],
    queryFn: () => getTransactionsSummary({ from: daysAgo(34), to: daysAgo(7) }),
  }).data;
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead }).data;
  if (!week) return null;
  const money = (n: number) => shekels(n, locale);
  const spent = week.expense.total;
  const usual = month ? month.expense.total / 4 : 0;
  // No spending this week and no earlier weeks to compare with: there is nothing to say yet.
  if (!usual && !(spent > 0)) return null;
  const line = !usual
    ? t(g("weekPlain"), { spent: money(spent) })
    : spent > usual * 1.15
      ? t(g("weekMore"), { spent: money(spent), usual: money(usual) })
      : spent < usual * 0.85
        ? t(g("weekLess"), { spent: money(spent), usual: money(usual) })
        : t(g("weekUsual"), { spent: money(spent) });
  const free = cash?.safeToSpend;
  const date = cash
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
        new Date(`${cash.until}T12:00:00`),
      )
    : "";
  return (
    <section aria-label={t("title")} className="text-sm leading-relaxed">
      <h3 className="text-caption text-muted-foreground">{t("title")}</h3>
      <p>{line}</p>
      {!gentle && week.expense.largest && (
        <p className="text-muted-foreground">
          {t("largest", {
            name: week.expense.largest.description,
            amount: money(Math.abs(week.expense.largest.chargedAmount)),
          })}
        </p>
      )}
      {cash && free != null && (
        <p>
          {free >= 0
            ? t("aheadFine", {
                amount: money(free),
                date,
                perDay: money(free / Math.max(1, cash.daysLeft)),
              })
            : t(g("aheadShort"), { amount: money(-free), date })}
          {!gentle && free >= 0 && (
            <span className="text-muted-foreground">
              {" "}
              {t("aheadBills", { amount: money(cash.billsDue) })}
            </span>
          )}
        </p>
      )}
    </section>
  );
}
