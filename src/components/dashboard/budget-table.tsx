"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import type { CategoryWithData } from "@/lib/types";

/** Budget table: lines grouped under their parent, with assigned, activity, available and a progress bar. */
export function BudgetTable({ categories, frame }: { categories: CategoryWithData[]; frame: number }) {
  const t = useTranslations("budgetTable");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const name = (c: CategoryWithData) => translateCategoryName(c.categoryName, tCat);
  const parents = categories.filter((c) => c.isParent);
  const loose = categories.filter((c) => !c.isParent && c.parentId == null && (c.budget > 0 || c.spent > 0));
  const groups = [
    ...parents.map((p) => ({ key: String(p.categoryId), title: name(p), rows: categories.filter((c) => c.parentId === p.categoryId && (c.budget > 0 || c.spent > 0)) })),
    ...(loose.length ? [{ key: "loose", title: t("ungrouped"), rows: loose }] : []),
  ].filter((g) => g.rows.length > 0);
  const sum = (rows: CategoryWithData[], f: (c: CategoryWithData) => number) => rows.reduce((s, c) => s + f(c), 0);
  const all = groups.flatMap((g) => g.rows);
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  const avail = (n: number) => <bdi className={`rounded-md px-1.5 py-0.5 tabular-nums ${n < 0 ? "bg-expense/15 text-expense" : "bg-status-on-track/15 text-status-on-track"}`} data-money>{money(n)}</bdi>;

  if (!all.length) return <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  const noLines = sum(all, (c) => c.budget) === 0;
  return (
    <div className="space-y-3">
    {/* Only a monthly frame, no category budgets: say so, instead of a column of zeros with no reason. */}
    {noLines && <p className="rounded-xl border border-[var(--status-heads-up)]/30 bg-[var(--status-heads-up)]/10 px-4 py-3 text-sm">{frame > 0 ? t("onlyFrame", { frame: money(frame) }) : t("noBudgets")}</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr>{["line", "assigned", "activity", "available"].map((k, i) => <th key={k} scope="col" className={`px-4 py-3 ${label} ${i ? "w-28 text-end" : "text-start"}`}>{t(`col_${k}`)}</th>)}</tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} className="border-t border-border">
            <tr className="bg-muted/40">
              <th scope="rowgroup" className={`px-4 py-2 text-start ${label}`}>{g.title}</th>
              <td className="px-4 py-2 text-end font-semibold tabular-nums" data-money><bdi>{money(sum(g.rows, (c) => c.budget))}</bdi></td>
              <td className="px-4 py-2 text-end tabular-nums text-muted-foreground" data-money><bdi>{money(-sum(g.rows, (c) => c.spent))}</bdi></td>
              <td className="px-4 py-2 text-end">{avail(sum(g.rows, (c) => c.budget - c.spent))}</td>
            </tr>
            {g.rows.map((c) => {
              const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : c.spent > 0 ? 100 : 0;
              const over = c.budget > 0 && c.spent > c.budget;
              return (
                <tr key={c.categoryId} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/transactions?category=${c.categoryId}`} className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{name(c)}</Link>
                      <span className={`text-xs ${over ? "text-expense" : "text-muted-foreground"}`}>
                        {c.budget <= 0 ? t("noBudget") : over ? t("overBy", { amount: money(c.spent - c.budget) }) : pct >= 100 ? <span className="inline-flex items-center gap-1 text-status-on-track"><CheckCircle2 className="size-3.5" aria-hidden />{t("funded")}</span> : t("used", { pct: Math.round(pct) })}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${over ? "bg-expense" : "bg-status-on-track"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums" data-money><bdi>{money(c.budget)}</bdi></td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-muted-foreground" data-money><bdi>{money(-c.spent)}</bdi></td>
                  <td className="px-4 py-2.5 text-end">{avail(c.budget - c.spent)}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
        <tfoot className="border-t-2 border-border">
          <tr>
            <th scope="row" className="px-4 py-3 text-start font-semibold">{t("total", { n: all.length })}</th>
            <td className="px-4 py-3 text-end font-semibold tabular-nums" data-money><bdi>{money(sum(all, (c) => c.budget))}</bdi></td>
            <td className="px-4 py-3 text-end font-semibold tabular-nums" data-money><bdi>{money(-sum(all, (c) => c.spent))}</bdi></td>
            <td className="px-4 py-3 text-end">{avail(sum(all, (c) => c.budget - c.spent))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
