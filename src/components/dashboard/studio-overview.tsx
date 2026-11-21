"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowUpLeft, CircleCheck, CircleAlert, Wallet } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { shekels } from "@/lib/money";
import { budgetMetrics, type StudioPreferences } from "@/lib/budget-studio";
import type { DashboardSummary } from "@/lib/types";
import { useStudioCopy } from "./studio-copy";
import { MonthNav, MonthStrip, monthKey } from "@/components/ui/month-nav";

export function StudioOverview({ data, selectedDate, preferences, onMonthChange }: { data: DashboardSummary; selectedDate: Date; preferences: StudioPreferences; onMonthChange: (month: string) => void }) {
  const locale = useLocale();
  const c = useStudioCopy();
  const hasBudget = data.totalBudget > 0;
  const spent = hasBudget ? data.budgetedSpent : data.periodTotal;
  const m = budgetMetrics(data.totalBudget, spent, selectedDate);
  const money = (value: number) => shekels(value, locale);
  const showRemaining = hasBudget && preferences.metric === "remaining";
  const main = showRemaining ? Math.abs(m.remaining) : spent;
  const label = showRemaining ? m.remaining < 0 ? c.over : c.remaining : hasBudget ? c.spent : c.allSpent;
  const forecastOver = !m.isPast && m.forecast != null && m.forecast > data.totalBudget;
  const used = Math.max(0, Math.min(100, m.used));
  const month = monthKey(selectedDate);
  return <section className="studio-overview" aria-label={c.overview}>
    <div className="studio-overview-top"><span className="studio-eyebrow"><Wallet size={15} aria-hidden="true" />{c.overview}</span><MonthNav value={month} onChange={onMonthChange} /></div>
    <div className="studio-overview-body">
      <div className="studio-balance"><p>{label}</p><div className="studio-amount figure"><bdi>{money(main)}</bdi></div>
        <p className="studio-budget-context">{hasBudget ? <>{c.monthlyBudget} <bdi data-money>{money(data.totalBudget)}</bdi></> : c.noBudget}</p>
        {hasBudget ? <span className={`studio-status ${m.remaining < 0 || forecastOver ? "is-over" : ""}`}>{m.remaining < 0 || forecastOver ? <CircleAlert size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}{m.remaining < 0 ? c.overTrack : forecastOver ? c.overPace : c.onTrack}</span> : <Link className="studio-inline-link" href="/settings/general#section-monthly-target">{c.setBudget}<ArrowUpLeft size={15} aria-hidden="true" className="ltr:-scale-x-100" /></Link>}
      </div>
      {hasBudget && <div className="studio-orbit" role="img" aria-label={`${Math.round(m.used)}% ${c.used}`}>
        <svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="studio-ring" x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--studio-ring-start)" /><stop offset="1" stopColor="var(--studio-ring-end)" /></linearGradient></defs><circle className="studio-ring-track" cx="100" cy="100" r="83" /><circle className="studio-ring-value" cx="100" cy="100" r="83" strokeDasharray={`${used * 5.215} 521.5`} transform="rotate(-90 100 100)" /></svg>
        <div><strong data-money>{Math.round(m.used)}<small>%</small></strong><span>{c.used}</span></div>
      </div>}
    </div>
    {hasBudget && <div className="studio-pace"><span>{Math.round(m.elapsed)}% {c.elapsed}</span><div><i style={{ width: `${m.elapsed}%` }} /></div></div>}
    <dl className="studio-stats">
      <div><dt>{showRemaining ? c.spent : c.remaining}</dt><dd data-money>{hasBudget ? money(showRemaining ? spent : m.remaining) : "—"}</dd></div>
      <div><dt>{c.daily}</dt><dd data-money>{m.daily == null ? "—" : money(Math.floor(m.daily))}</dd></div>
      <div><dt>{m.isPast ? c.actual : c.forecast}</dt><dd data-money>{m.isPast ? money(spent) : m.forecast == null ? "—" : money(m.forecast)}</dd></div>
    </dl>
    <p className="studio-explanation">{c.calculation}<InfoTip text={m.isCurrent && m.forecast == null ? `${c.explanation} ${c.noForecast}` : c.explanation} className="text-inherit hover:bg-white/10 hover:text-white" /></p>
    <MonthStrip value={month} onChange={onMonthChange} />
  </section>;
}
