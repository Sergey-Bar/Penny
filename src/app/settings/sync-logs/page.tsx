"use client";

import { ScrollText, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import { translateProviderName } from "@/lib/i18n-data";
import type { ActivitySnapshot } from "@/lib/types";
import type { Locale } from "@/i18n/routing";

interface SyncLogEntry {
  id: string;
  kind: "bank" | "investment";
  provider: string;
  status: string;
  message: string | null;
  count: number | null;
  startedAt: string;
  completedAt: string | null;
}

async function fetchSyncLogs(): Promise<{ logs: SyncLogEntry[] }> {
  const res = await fetch("/api/sync/logs", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load sync logs");
  return res.json() as Promise<{ logs: SyncLogEntry[] }>;
}

const HOUSE_NAMES = new Map(INVESTMENT_HOUSES.map((h) => [h.id, h.name]));

function formatTimestamp(ts: string | null, locale: string): string {
  if (!ts) return "";
  const iso = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

export default function SyncLogsPage() {
  const t = useTranslations("settings.syncLogs");
  const tBanks = useTranslations("settings.bank");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const activity = queryClient.getQueryData<ActivitySnapshot>(["activity"]);
  const syncActive = activity?.sync.active === true;

  const query = useQuery({
    queryKey: ["sync-logs"],
    queryFn: fetchSyncLogs,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (q) =>
      syncActive || q.state.data?.logs.some((l) => l.status === "running" || l.status === "otp")
        ? 2500
        : false,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sync/logs", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
    },
    onSuccess: () => {
      queryClient.setQueryData(["sync-logs"], { logs: [] });
      void queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      toast.success(t("cleared"));
    },
    onError: () => {
      toast.error(t("clearFailed"));
    },
  });

  const providerLabel = (entry: SyncLogEntry) => {
    if (entry.kind === "investment") {
      const house = HOUSE_NAMES.get(entry.provider);
      return house ? (locale === "he" ? house.he : house.en) : entry.provider;
    }
    return translateProviderName(entry.provider, entry.provider, tBanks);
  };

  const statusBadge = (status: string) => {
    if (status === "done" || status === "success" || status === "completed") {
      return (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-caption font-medium text-emerald-700 dark:text-emerald-300">
          {t("statusDone")}
        </span>
      );
    }
    if (status === "error" || status === "failed") {
      return (
        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-caption font-medium text-destructive">
          {t("statusError")}
        </span>
      );
    }
    if (status === "otp") {
      return (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-caption font-medium text-amber-700 dark:text-amber-300">
          {t("statusOtp")}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-caption font-medium text-primary">
        {t("statusRunning")}
      </span>
    );
  };

  const logs = query.data?.logs ?? [];

  return (
    <SectionShell title={t("title")} description={t("subtitle")} icon={<ScrollText />}>
      <SettingCard title={t("recentTitle")} description={t("recentDescription")}>
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => clearMutation.mutate()}
            disabled={logs.length === 0 || clearMutation.isPending}
          >
            <Trash2 className="me-1.5 size-3.5" />
            {t("clearAll")}
          </Button>
        </div>

        {query.isLoading || query.isError ? (
          <DataState
            loading={query.isLoading}
            error={query.isError}
            onRetry={() => void query.refetch()}
          />
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {logs.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{providerLabel(entry)}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {entry.kind === "investment" ? t("kindInvestment") : t("kindBank")}
                    </span>
                    {statusBadge(entry.status)}
                    {entry.count != null &&
                      (entry.status === "done" || entry.status === "success") && (
                        <span className="text-caption text-muted-foreground">
                          {t("itemsCount", { count: entry.count })}
                        </span>
                      )}
                  </div>
                  <span className="text-caption text-muted-foreground tabular-nums">
                    {formatTimestamp(entry.startedAt, locale)}
                  </span>
                </div>
                {entry.message && (
                  <p
                    className={`text-caption break-words ${
                      entry.status === "error" || entry.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {entry.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingCard>
    </SectionShell>
  );
}
