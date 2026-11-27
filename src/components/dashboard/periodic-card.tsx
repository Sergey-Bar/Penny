"use client";

import { israelToday } from "@/lib/dates";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { CardShell, CardError, CardSkeleton } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { deletePeriodic, dismissPeriodicSuggestion, getPeriodic, savePeriodic } from "@/lib/api";
import { shekels } from "@/lib/money";
import { monthlySetAside, totalSetAside, type PeriodicExpense } from "@/lib/periodic";

type Draft = {
  id?: number;
  name: string;
  amount: string;
  everyMonths: string;
  nextDue: string;
  savedSoFar: string;
  autoKey?: string | null;
};

const thisMonth = () => israelToday().slice(0, 7);
const today = () => israelToday();

/** Sinking funds: bills that come every few months, turned into a small monthly amount. */
export function PeriodicCard() {
  const t = useTranslations("periodic");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["periodic"], queryFn: getPeriodic });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["periodic"] });

  const monthWords = (ym: string) =>
    new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString(
      locale === "he" ? "he-IL" : "en-US",
      { month: "long", year: "numeric" },
    );

  const save = async (item: Record<string, unknown>) => {
    try {
      await savePeriodic(item);
      setDraft(null);
      await refresh();
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const remove = async (e: PeriodicExpense) => {
    try {
      await deletePeriodic(e.id);
      await refresh();
      toast.success(t("deleted", { name: e.name }), {
        action: {
          label: t("undo"),
          onClick: () => {
            const rest: Record<string, unknown> = { ...e };
            delete rest.id;
            void savePeriodic(rest).then(refresh);
          },
        },
      });
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  if (q.isPending) return <CardSkeleton label={t("title")} />;
  if (q.isError) return <CardError label={t("title")} />;
  const { items, suggestions } = q.data;
  const total = totalSetAside(items, today());

  const editor = (d: Draft) => (
    <form
      className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        void save({
          ...d,
          amount: Number(d.amount),
          everyMonths: Number(d.everyMonths),
          savedSoFar: Number(d.savedSoFar || 0),
        });
      }}
    >
      {(
        [
          ["name", "text"],
          ["amount", "number"],
          ["everyMonths", "number"],
          ["nextDue", "month"],
          ["savedSoFar", "number"],
        ] as const
      ).map(([field, type]) => (
        <label key={field} className="grid gap-1 text-xs text-muted-foreground">
          {t(`field.${field}`)}
          <Input
            type={type}
            required={field !== "savedSoFar"}
            min={type === "number" ? (field === "everyMonths" ? 1 : 0) : undefined}
            max={field === "everyMonths" ? 24 : undefined}
            inputMode={type === "number" ? "decimal" : undefined}
            className="tabular-nums"
            value={d[field] ?? ""}
            onChange={(ev) => setDraft({ ...d, [field]: ev.target.value })}
          />
        </label>
      ))}
      <div className="flex items-end gap-2">
        <Button type="submit">{t("save")}</Button>
        <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );

  return (
    <CardShell
      label={t("title")}
      action={
        !draft && (
          <IconButton
            label={t("add")}
            showLabel
            onClick={() =>
              setDraft({
                name: "",
                amount: "",
                everyMonths: "12",
                nextDue: thisMonth(),
                savedSoFar: "0",
              })
            }
          >
            <Plus aria-hidden />
          </IconButton>
        )
      }
    >
      <p className="mb-4 text-base">
        {items.length ? t("sentence", { amount: shekels(Math.ceil(total), locale) }) : t("empty")}
      </p>

      {draft && !draft.id && <div className="mb-3">{editor(draft)}</div>}

      <ul className="divide-y divide-border/60">
        {items.map((e) => {
          if (draft?.id === e.id)
            return (
              <li key={e.id} className="py-2">
                {editor(draft)}
              </li>
            );
          const pct = Math.min(100, Math.round((e.savedSoFar / e.amount) * 100));
          return (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-sm tabular-nums">{shekels(e.amount, locale)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
                  <span>{t("due", { month: monthWords(e.nextDue) })}</span>
                  <span>
                    {t("perMonth", {
                      amount: shekels(Math.ceil(monthlySetAside(e, today())), locale),
                    })}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("savedOf", { saved: shekels(e.savedSoFar, locale), pct })}
                >
                  <div
                    className="h-full rounded-full bg-[var(--chart-1)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {t("savedOf", { saved: shekels(e.savedSoFar, locale), pct })}
                </div>
              </div>
              <IconButton
                label={t("edit")}
                onClick={() =>
                  setDraft({
                    ...e,
                    amount: String(e.amount),
                    everyMonths: String(e.everyMonths),
                    savedSoFar: String(e.savedSoFar),
                  })
                }
              >
                <Pencil aria-hidden />
              </IconButton>
              <IconButton label={t("delete")} onClick={() => void remove(e)}>
                <Trash2 aria-hidden />
              </IconButton>
            </li>
          );
        })}
      </ul>

      {suggestions.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            {t("suggestionsTitle")}
            <InfoTip text={t("estimatesFromPastTransactions")} className="-my-3" />
          </h3>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.autoKey} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[10rem] flex-1 text-sm">
                  {t("suggestion", {
                    name: s.name,
                    amount: shekels(s.amount, locale),
                    month: monthWords(s.nextDue),
                  })}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...s,
                      amount: String(s.amount),
                      everyMonths: String(s.everyMonths),
                      savedSoFar: "0",
                    })
                  }
                >
                  <Plus aria-hidden />
                  {t("reviewEdit")}
                </Button>
                <IconButton
                  label={t("dismiss")}
                  onClick={() => void dismissPeriodicSuggestion(s.autoKey).then(refresh)}
                >
                  <X aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardShell>
  );
}
