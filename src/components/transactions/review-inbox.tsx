"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRightLeft, Check, CheckCheck } from "lucide-react";
import { CardShell } from "@/components/home/card-shell";
import { IconButton } from "@/components/ui/icon-button";
import { DataState } from "@/components/ui/data-state";
import {
  approveTransactionCategory,
  getCategories,
  getReviewInbox,
  setTransactionKind,
  unapproveTransaction,
  updateTransactionCategory,
  updateTransactionFields,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/lib/types";
import type { Locale } from "@/i18n/routing";

/** Review inbox: one row at a time, keyboard first, undo instead of confirm. */
export function ReviewInbox() {
  const t = useTranslations("review");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: ["transactions", "review"], queryFn: getReviewInbox });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => getCategories() });
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(0);
  const [memos, setMemos] = useState<Record<number, string>>({});
  const listRef = useRef<HTMLUListElement>(null);

  const rows = (inbox.data?.transactions ?? []).filter((r) => !hidden.has(r.id));
  const current = Math.min(active, Math.max(rows.length - 1, 0));

  const focusRow = (i: number) => {
    const next = Math.max(0, Math.min(i, rows.length - 1));
    setActive(next);
    // Rows re-render after state changes, so focus on the next frame.
    requestAnimationFrame(() =>
      (listRef.current?.querySelector(`[data-row="${next}"]`) as HTMLElement | null)?.focus(),
    );
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  const hide = (ids: number[], on: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      for (const id of ids)
        if (on) next.add(id);
        else next.delete(id);
      return next;
    });

  const focusPicker = (id: number) =>
    (document.getElementById(`review-cat-${id}`) as HTMLSelectElement | null)?.focus();

  const approve = async (txns: TransactionWithCategory[]) => {
    // Approving keeps the current category, so a row without one needs a pick first.
    const ready = txns.filter((r) => r.categoryId != null);
    if (ready.length === 0) {
      if (txns[0]) focusPicker(txns[0].id);
      toast(t("pickFirst"));
      return;
    }
    const ids = ready.map((r) => r.id);
    hide(ids, true);
    setSelected(new Set());
    focusRow(current);
    try {
      await Promise.all(ids.map(approveTransactionCategory));
    } catch {
      hide(ids, false);
      toast.error(t("failed"));
      return;
    }
    refresh();
    if (ids.length > 1) {
      toast(t("approvedMany", { count: ids.length }), {
        action: {
          label: t("undo"),
          onClick: () => {
            void Promise.all(ids.map(unapproveTransaction)).then(() => {
              hide(ids, false);
              refresh();
            });
          },
        },
      });
    }
  };

  const setCategory = async (row: TransactionWithCategory, categoryId: number) => {
    hide([row.id], true);
    focusRow(current);
    try {
      await updateTransactionCategory(row.id, categoryId);
      refresh();
    } catch {
      hide([row.id], false);
      toast.error(t("failed"));
    }
  };

  const saveMemo = async (row: TransactionWithCategory) => {
    const next = memos[row.id];
    if (next === undefined || next === (row.memo ?? "")) return;
    try {
      await updateTransactionFields(row.id, { memo: next || null });
      refresh();
      toast.success(t("memoSaved"));
    } catch {
      toast.error(t("failed"));
    }
  };

  const markTransfer = async (row: TransactionWithCategory) => {
    hide([row.id], true);
    focusRow(current);
    try {
      await setTransactionKind(row.id, "transfer");
      refresh();
      toast(t("transferDone"));
    } catch {
      hide([row.id], false);
      toast.error(t("failed"));
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "BUTTON") {
      if (e.key === "Escape") focusRow(current);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const row = rows[current];
    const key = e.key.toLowerCase();
    if (key === "j" || e.key === "ArrowDown") focusRow(current + 1);
    else if (key === "k" || e.key === "ArrowUp") focusRow(current - 1);
    else if (key === "a" && e.shiftKey) void approve(rows.filter((r) => selected.has(r.id)));
    else if ((key === "a" || e.key === "Enter") && row) void approve([row]);
    else if (key === "c" && row) focusPicker(row.id);
    else if (key === "x" && row) toggle(row.id);
    else return;
    e.preventDefault();
  };

  if (inbox.isError) return <DataState error onRetry={() => void inbox.refetch()} />;
  if (inbox.isPending) return <DataState loading />;

  if (rows.length === 0) {
    return (
      <CardShell>
        <div role="status" className="flex flex-col items-center gap-2 py-10 text-center">
          <Check className="size-8 text-primary" aria-hidden />
          <p className="font-semibold">{t("allDone")}</p>
          <p className="text-footnote text-muted-foreground">{t("allDoneHint")}</p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("count", { count: rows.length })}
      action={
        <IconButton
          label={t("approveAll")}
          showLabel
          variant="outline"
          onClick={() => void approve(rows)}
        >
          <CheckCheck className="size-4" aria-hidden />
        </IconButton>
      }
    >
      <p id="review-keys" className="mb-3 text-footnote text-muted-foreground">
        {t("shortcuts")}
      </p>
      <ul
        ref={listRef}
        aria-describedby="review-keys"
        aria-label={t("listLabel")}
        className="divide-y divide-border/60"
        onKeyDown={onKeyDown}
      >
        {rows.map((r, i) => {
          const options = (categories.data ?? []).filter(
            (c) => c.kind === (r.kind === "income" ? "income" : "expense"),
          );
          const isSelected = selected.has(r.id);
          return (
            <li
              key={r.id}
              data-row={i}
              tabIndex={i === current ? 0 : -1}
              aria-current={i === current || undefined}
              onFocus={() => setActive(i)}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg px-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i === current && "bg-muted/60",
                isSelected && "bg-primary/10",
              )}
            >
              <input
                type="checkbox"
                className="size-4"
                checked={isSelected}
                onChange={() => toggle(r.id)}
                aria-label={t("select", { name: r.description })}
              />
              <div className="min-w-0 flex-1">
                <bdi className="block truncate font-medium" title={r.description}>
                  {r.description}
                </bdi>
                <span className="text-footnote text-muted-foreground">
                  {formatDate(r.date)} · {r.categoryId == null ? t("noCategory") : t("unsure")}
                </span>
              </div>
              <span className="tabular-nums" dir="ltr">
                {formatCurrency(r.chargedAmount, "ILS", locale)}
              </span>
              <input
                aria-label={t("memo", { name: r.description })}
                placeholder={t("memoPlaceholder")}
                value={memos[r.id] ?? r.memo ?? ""}
                onChange={(event) =>
                  setMemos((current) => ({ ...current, [r.id]: event.target.value }))
                }
                onBlur={() => void saveMemo(r)}
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
                maxLength={200}
              />
              <IconButton label={t("markTransfer")} onClick={() => void markTransfer(r)}>
                <ArrowRightLeft className="size-4" aria-hidden />
              </IconButton>
              <select
                id={`review-cat-${r.id}`}
                aria-label={t("category", { name: r.description })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                value={r.categoryId ?? ""}
                onChange={(e) => e.target.value && void setCategory(r, Number(e.target.value))}
              >
                <option value="">{t("pick")}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {translateCategoryName(c.name, tCat)}
                  </option>
                ))}
              </select>
              <IconButton
                label={t("approve")}
                disabled={r.categoryId == null}
                onClick={() => void approve([r])}
              >
                <Check className="size-4" aria-hidden />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
