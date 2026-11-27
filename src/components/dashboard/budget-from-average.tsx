"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { translateCategoryName } from "@/lib/i18n-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataState } from "@/components/ui/data-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getBudgetSuggestions, updateBudget, updateCategoryBudgetMode } from "@/lib/api";
import { shekels } from "@/lib/money";
import type { BudgetMode } from "@/lib/types";

/** Paamonim step one: build the budget from what you really spend. */
export function BudgetFromAverage({ modes }: { modes: Map<number, BudgetMode> }) {
  const t = useTranslations("budgetPlan");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const suggestions = useQuery({
    queryKey: ["budget-suggest"],
    queryFn: getBudgetSuggestions,
    enabled: open,
  });

  const openSheet = async () => {
    setOpen(true);
    try {
      const rows = await queryClient.fetchQuery({
        queryKey: ["budget-suggest"],
        queryFn: getBudgetSuggestions,
        staleTime: 0,
      });
      // Checked by default only where no budget is set yet.
      setPicked(
        new Map(
          rows
            .filter((r) => r.currentBudget == null)
            .map((r) => [r.categoryId, String(r.suggested)]),
        ),
      );
    } catch {
      // The sheet shows the error state with a retry.
    }
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
    void queryClient.invalidateQueries({ queryKey: ["budget-suggest"] });
  };

  const save = async () => {
    const chosen = (suggestions.data ?? [])
      .filter((r) => picked.has(r.categoryId))
      .map((r) => ({ r, amount: Number(picked.get(r.categoryId)) }))
      .filter(({ amount }) => Number.isFinite(amount) && amount >= 0);
    setSaving(true);
    try {
      await Promise.all(
        chosen.map(async ({ r, amount }) => {
          await updateBudget(r.categoryId, amount);
          // The summary ignores budgets on tracking-only categories.
          if (modes.get(r.categoryId) !== "budgeted")
            await updateCategoryBudgetMode(r.categoryId, "budgeted");
        }),
      );
      setOpen(false);
      refresh();
      toast.success(t("saved", { count: chosen.length }), {
        action: {
          label: t("undo"),
          onClick: () => {
            void Promise.all(
              chosen.map(async ({ r }) => {
                await updateBudget(r.categoryId, r.currentBudget);
                const mode = modes.get(r.categoryId);
                if (mode && mode !== "budgeted") await updateCategoryBudgetMode(r.categoryId, mode);
              }),
            ).then(refresh, () => toast.error(t("saveFailed")));
          },
        },
      });
    } catch {
      refresh();
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const setRow = (id: number, value: string | null) =>
    setPicked((m) => {
      const next = new Map(m);
      if (value == null) next.delete(id);
      else next.set(id, value);
      return next;
    });

  return (
    <>
      <Button
        onClick={() => void openSheet()}
        className="h-auto min-h-11 max-w-full py-2 whitespace-normal"
      >
        {t("open")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            {suggestions.isError ? (
              <DataState error onRetry={() => void suggestions.refetch()} />
            ) : suggestions.isPending ? (
              <DataState loading />
            ) : suggestions.data.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {suggestions.data.map((r) => {
                  const checked = picked.has(r.categoryId);
                  const id = `bfa-${r.categoryId}`;
                  return (
                    <li key={r.categoryId} className="flex items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        id={`${id}-check`}
                        className="size-5 shrink-0 accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-ring"
                        checked={checked}
                        onChange={(e) =>
                          setRow(r.categoryId, e.target.checked ? String(r.suggested) : null)
                        }
                      />
                      <label htmlFor={`${id}-check`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {translateCategoryName(r.name, tCat)}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {t("averageLine", { amount: shekels(r.average, locale) })}
                          {r.currentBudget != null &&
                            ` · ${t("currentLine", { amount: shekels(r.currentBudget, locale) })}`}
                        </span>
                      </label>
                      <Input
                        aria-label={t("amountFor", { name: r.name })}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        disabled={!checked}
                        value={picked.get(r.categoryId) ?? String(r.suggested)}
                        onChange={(e) => setRow(r.categoryId, e.target.value)}
                        className="w-24 text-end tabular-nums"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <SheetFooter>
            <Button
              onClick={() => void save()}
              disabled={saving || picked.size === 0}
              className="min-h-11"
            >
              {t("save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
