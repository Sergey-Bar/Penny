"use client";

import { useHousehold } from "@/hooks/use-household";
import { BudgetSidePanel } from "./budget-side-panel";
import { BudgetTable } from "./budget-table";
import { useState, useCallback, useSyncExternalStore } from "react";
import { readStored } from "@/lib/legacy-names";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DataState } from "@/components/ui/data-state";
import { getSummary, getTransactions, listIntegrations, getBudgetMoves } from "@/lib/api";
import { IncomeSmoothingCard } from "./income-smoothing-card";
import { getMonthRange } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/app-shell";
import { StudioOverview } from "./studio-overview";
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
const LEGACY_VIEW_MODE_KEY = "spent.dashboard.viewMode"; // legacy: spent.dashboard.viewMode from installs before the Penny rename

function readViewMode(): CategoryViewMode {
  if (typeof window === "undefined") return "collapsed";
  try {
    const raw = readStored(VIEW_MODE_KEY, LEGACY_VIEW_MODE_KEY);
    return raw === "expanded" || raw === "table" ? raw : "collapsed";
  } catch {
    return "collapsed";
  }
}

const noSubscribe = () => () => {}; // read once per render; this component's own writes go through state

export function Dashboard() {
  const t = useTranslations("dashboard");
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [chosenViewMode, setViewMode] = useState<CategoryViewMode | null>(null);
  const storedViewMode = useSyncExternalStore(noSubscribe, readViewMode, (): CategoryViewMode => "collapsed");
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
  const moves = useQuery({ queryKey: ["budget-moves", month], queryFn: () => getBudgetMoves(month) });
  // The budgets in the summary already include base, carry-in and moves; the moves query only
  // lists them for the card's own "moved from" rows and undo.
  const summary = summaryQuery.data;
  const period = useQuery({ queryKey: ["budget-period", from, to], queryFn: () => getTransactions({ from, to, limit: 1 }), placeholderData: keepPreviousData });
  const recent = useQuery({ queryKey: ["transactions", "budget-recent", from, to], queryFn: () => getTransactions({ from, to, limit: 5, sort: "date", order: "desc", kind: "all" }) });
  const banks = useQuery({ queryKey: ["integrations"], queryFn: listIntegrations });

  return (
    <div className="studio-page" data-studio-theme={resolvedStudioTheme} data-studio-accent={preferences.accent} data-studio-density={preferences.density} data-studio-layout={preferences.layout} data-studio-motion={preferences.motion}>
      <PageHeader title={t("pageTitle")} largeTitle={false} />

      <div className="studio-content">
        {summaryQuery.isError || period.isError || banks.isError ? <DataState error onRetry={() => { void summaryQuery.refetch(); void period.refetch(); void banks.refetch(); }} />
        : summaryQuery.isPending || period.isPending || banks.isPending ? <DataState loading />
        : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-[26px]">
        {/* The overview carries the month picker, so it stays up on an empty month too. */}
        {summary && <div className={`studio-top-grid ${!preferences.showChart || period.data?.total === 0 ? "studio-single" : ""}`}>
          <StudioOverview data={summary} selectedDate={selectedDate} preferences={preferences} onMonthChange={(m) => setSelectedDate(new Date(`${m}-01T12:00:00`))} />
          {preferences.showChart && period.data?.total !== 0 && <StudioDistribution categories={summary.categoriesWithData} uncategorized={summary.uncategorized} chart={preferences.chart} onChartChange={(chart) => {
            save({ ...preferences, chart });
          }} />}
        </div>}
        {period.data?.total === 0 ? <DataState period={banks.data?.some((bank) => bank.lastSyncAt)} /> : <>

        {recent.isError ? <DataState error onRetry={() => void recent.refetch()} /> : recent.isPending ? <DataState loading /> : <StudioTransactions transactions={recent.data.transactions} from={from} to={to} />}
        <VacationPlans compact />

        {household.members.length >= 2 && (
          <label className="flex w-fit items-center gap-2 text-sm">{tOwner("filter")}
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 rounded-lg border border-border/60 bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
              <option value="">{tOwner("everyone")}</option>
              {household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value="shared">{tOwner("shared")}</option>
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BudgetFromAverage modes={new Map((summary?.categoriesWithData ?? []).map((c) => [c.categoryId, c.budgetMode]))} />
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

        {viewMode === "table" ? <BudgetTable categories={summary?.categoriesWithData ?? []} frame={summary?.totalBudget ?? 0} /> : <div className="studio-category-section"><CategoryGrid
          categories={summary?.categoriesWithData ?? []}
          loading={summaryQuery.isLoading}
          periodTotal={summary?.periodTotal ?? 0}
          from={from}
          to={to}
          viewMode={viewMode}
          month={month}
          moves={moves.data ?? []}
        /></div>}
        {summary && preferences.showJourney && <StudioJourney data={summary} month={month} />}
        {from === getMonthRange(new Date()).from && <IncomeSmoothingCard />}
        <PeriodicCard />
        <AINotConnectedBanner />
        </>}
        </div>
        {summary && <BudgetSidePanel summary={summary} month={month} />}
        </div>}
      </div>
    </div>
  );
}
