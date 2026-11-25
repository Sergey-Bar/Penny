"use client";

import { useHousehold } from "@/hooks/use-household";
import { BudgetSidePanel } from "./budget-side-panel";
import { BudgetTable } from "./budget-table";
import { useState, useCallback, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { MonthNav, monthKey } from "@/components/ui/month-nav";
import { shekels } from "@/lib/money";
import { DataState } from "@/components/ui/data-state";
import { getSummary, getTransactions, listIntegrations, getBudgetMoves } from "@/lib/api";
import { IncomeSmoothingCard } from "./income-smoothing-card";
import { getMonthRange } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/app-shell";
import { StudioDistribution } from "./studio-distribution";
import { StudioJourney } from "./studio-journey";
import { StudioTransactions } from "./studio-transactions";
import { useStudio } from "@/components/studio-provider";
import { CategoryGrid } from "./category-grid";
import { BudgetFromAverage } from "./budget-from-average";
import { PeriodicCard } from "./periodic-card";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CategoryViewMode } from "@/lib/types";
import { VacationPlans } from "@/components/household/vacation-plans";

const VIEW_MODE_KEY = "penny.dashboard.viewMode";

function readViewMode(): CategoryViewMode {
  if (typeof window === "undefined") return "collapsed";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    if (raw === "expanded" || raw === "collapsed" || raw === "table") return raw;
    // Not chosen yet: the table on wide screens, the cards on phones (a table scrolls sideways there).
    return matchMedia("(max-width: 767px)").matches ? "collapsed" : "table";
  } catch {
    return "table";
  }
}

const noSubscribe = () => () => {}; // read once per render; this component's own writes go through state

export function Dashboard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [chosenViewMode, setViewMode] = useState<CategoryViewMode | null>(null);
  const storedViewMode = useSyncExternalStore(
    noSubscribe,
    readViewMode,
    (): CategoryViewMode => "table",
  );
  const viewMode = chosenViewMode ?? storedViewMode;
  const { preferences, save, resolvedStudioTheme } = useStudio();

  const handleViewModeChange = useCallback((mode: CategoryViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Storage may be unavailable; in-memory state still works.
    }
  }, []);

  const { from, to } = getMonthRange(selectedDate);

  // "view as member": spend figures for one household member; budgets stay the household's.
  const { household } = useHousehold();
  const [owner, setOwner] = useState("");
  const tOwner = useTranslations("ownerFilter");
  const summaryQuery = useQuery({
    queryKey: ["summary", from, to, owner],
    queryFn: () => getSummary({ from, to, owner: owner || undefined }),
    // Keeps the overview (and its month picker) on screen while the next month loads.
    placeholderData: keepPreviousData,
  });

  const month = from.slice(0, 7);
  const moves = useQuery({
    queryKey: ["budget-moves", month],
    queryFn: () => getBudgetMoves(month),
  });
  // The budgets in the summary already include base, carry-in and moves; the moves query only
  // lists them for the card's own "moved from" rows and undo.
  const summary = summaryQuery.data;
  const period = useQuery({
    queryKey: ["budget-period", from, to],
    queryFn: () => getTransactions({ from, to, limit: 1 }),
    placeholderData: keepPreviousData,
  });
  const recent = useQuery({
    queryKey: ["transactions", "budget-recent", from, to],
    queryFn: () =>
      getTransactions({ from, to, limit: 5, sort: "date", order: "desc", kind: "all" }),
  });
  const banks = useQuery({ queryKey: ["integrations"], queryFn: listIntegrations });

  return (
    <div
      className="studio-page"
      // The server cannot know the device's light or dark setting, so this attribute may differ on first render;
      // the theme itself is set on <html> before paint, and nothing styles this copy.
      suppressHydrationWarning
      data-studio-theme={resolvedStudioTheme}
      data-studio-accent={preferences.accent}
      data-studio-density={preferences.density}
      data-studio-layout={preferences.layout}
      data-studio-motion={preferences.motion}
    >
      <PageHeader title={t("pageTitle")} largeTitle={false} />

      <div className="studio-content">
        {summaryQuery.isError || period.isError || banks.isError ? (
          <DataState
            error
            onRetry={() => {
              void summaryQuery.refetch();
              void period.refetch();
              void banks.refetch();
            }}
          />
        ) : summaryQuery.isPending || period.isPending || banks.isPending ? (
          <DataState loading />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
            <div className="flex min-w-0 flex-col gap-[26px]">
              {/* The month's budget in one pane: what is left is the figure people come for, so it leads, with a ring
                  for how much is used; spent, the budget and any overspending sit beside it under their own labels. */}
              {summary &&
                (() => {
                  const lines = summary.categoriesWithData.filter((c) => !c.isParent);
                  const over = lines.reduce(
                    (sum, c) => sum + Math.max(0, c.budget > 0 ? c.spent - c.budget : 0),
                    0,
                  );
                  const spent = lines.reduce((sum, c) => sum + c.spent, 0);
                  const left = summary.totalBudget - spent;
                  const used = summary.totalBudget > 0 ? spent / summary.totalBudget : null;
                  const stat = (key: string, value: number, tone = "") => (
                    <div className="min-w-0">
                      <dt className="text-[13px] text-muted-foreground">{t(key)}</dt>
                      <dd className={`text-lg font-semibold tabular-nums ${tone}`}>
                        <bdi data-money>{shekels(Math.round(value), locale)}</bdi>
                      </dd>
                    </div>
                  );
                  return (
                    <section className="home-hero shrink-0 text-start">
                      <div className="flex flex-wrap items-center gap-2">
                        {household.members.length >= 2 && (
                          <label className="hero-pill">
                            <span className="sr-only">{tOwner("filter")}</span>
                            <select
                              value={owner}
                              onChange={(e) => setOwner(e.target.value)}
                              className="max-w-36 border-0! bg-transparent! py-0 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <option value="">{tOwner("everyone")}</option>
                              {household.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                              <option value="shared">{tOwner("shared")}</option>
                            </select>
                          </label>
                        )}
                        <MonthNav
                          value={month}
                          max={monthKey(
                            new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
                          )}
                          onChange={(m) => setSelectedDate(new Date(`${m}-01T12:00:00`))}
                        />
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-5">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
                          {used != null && (
                            <div className="relative size-24 shrink-0" aria-hidden>
                              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="42"
                                  fill="none"
                                  stroke="var(--hover)"
                                  strokeWidth="10"
                                />
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="42"
                                  fill="none"
                                  stroke={used > 1 ? "var(--expense)" : "var(--accent-color)"}
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                  strokeDasharray={`${Math.min(1, used) * 263.9} 263.9`}
                                />
                              </svg>
                              <span className="absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums">
                                {Math.round(used * 100)}%
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium text-muted-foreground">
                              {t("stripLeft")}
                            </p>
                            <p
                              className={`text-5xl leading-none font-semibold tracking-tight tabular-nums sm:text-6xl ${left < 0 ? "text-expense" : ""}`}
                              data-money
                              data-figure
                            >
                              <bdi>{shekels(Math.round(left), locale)}</bdi>
                            </p>
                          </div>
                        </div>
                        <dl className="ms-auto flex flex-wrap items-end gap-x-8 gap-y-2 max-sm:ms-0 max-sm:w-full">
                          {stat("stripBudget", summary.totalBudget)}
                          {stat("stripSpent", -spent)}
                          {over > 0 && stat("stripOver", -over, "text-expense")}
                        </dl>
                      </div>
                    </section>
                  );
                })()}
              {period.data?.total === 0 ? (
                <DataState period={banks.data?.some((bank) => bank.lastSyncAt)} />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <BudgetFromAverage
                      modes={
                        new Map(
                          (summary?.categoriesWithData ?? []).map((c) => [
                            c.categoryId,
                            c.budgetMode,
                          ]),
                        )
                      }
                    />
                    <Tabs
                      value={viewMode}
                      onValueChange={(v) =>
                        handleViewModeChange(v === "expanded" || v === "table" ? v : "collapsed")
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="collapsed">{t("viewModeGrouped")}</TabsTrigger>
                        <TabsTrigger value="expanded">{t("viewModeAll")}</TabsTrigger>
                        <TabsTrigger value="table">{t("viewModeTable")}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {viewMode === "table" ? (
                    <BudgetTable
                      categories={summary?.categoriesWithData ?? []}
                      frame={summary?.totalBudget ?? 0}
                      elapsed={summary?.timeElapsedPercent ?? 0}
                    />
                  ) : (
                    <div className="studio-category-section">
                      <CategoryGrid
                        categories={summary?.categoriesWithData ?? []}
                        loading={summaryQuery.isLoading}
                        periodTotal={summary?.periodTotal ?? 0}
                        from={from}
                        to={to}
                        viewMode={viewMode}
                        month={month}
                        moves={moves.data ?? []}
                      />
                    </div>
                  )}
                  {summary && preferences.showChart && (
                    <StudioDistribution
                      categories={summary.categoriesWithData}
                      uncategorized={summary.uncategorized}
                      chart={preferences.chart}
                      onChartChange={(chart) => save({ ...preferences, chart })}
                    />
                  )}
                  {recent.isError ? (
                    <DataState error onRetry={() => void recent.refetch()} />
                  ) : recent.isPending ? (
                    <DataState loading />
                  ) : (
                    <StudioTransactions
                      transactions={recent.data.transactions}
                      from={from}
                      to={to}
                    />
                  )}
                  <VacationPlans compact />
                  {summary && preferences.showJourney && (
                    <StudioJourney data={summary} month={month} />
                  )}
                  {from === getMonthRange(new Date()).from && <IncomeSmoothingCard />}
                  <PeriodicCard />
                  <AINotConnectedBanner />
                </>
              )}
            </div>
            {summary && <BudgetSidePanel summary={summary} month={month} />}
          </div>
        )}
      </div>
    </div>
  );
}
