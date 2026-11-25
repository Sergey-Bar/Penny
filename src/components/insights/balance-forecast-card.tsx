"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import { getBalanceForecast } from "@/lib/api";
import { shekels } from "@/lib/money";
import { useGentle } from "@/hooks/use-gentle";

/** 90-day bank balance: one sentence with the low point, then the line. Hidden until a bank balance syncs. */
export function BalanceForecastCard() {
  const t = useTranslations("ahead");
  const locale = useLocale();
  const gentle = useGentle();
  const query = useQuery({ queryKey: ["balance-forecast"], queryFn: getBalanceForecast });
  const f = query.data?.forecast;
  if (!f) return null;

  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const date = (d: string) => day.format(new Date(`${d}T12:00:00Z`));
  const money = (n: number) => shekels(Math.round(n), locale);
  const low = { amount: money(f.low.balance), date: date(f.low.date) };
  const sentence = f.firstNegative
    ? t("overdraft", { ...low, when: date(f.firstNegative) })
    : f.nextPayday
      ? t("lowBeforeSalary", low)
      : t("low", low);

  const values = f.points.map((p) => p.balance);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const W = 300;
  const H = 100;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 4 + ((max - v) / range) * (H - 8);
  const lowIndex = f.points.findIndex((p) => p.date === f.low.date);
  const end = f.points[f.points.length - 1];
  const endText = t("endBalance", { date: date(end.date), amount: money(end.balance) });

  return (
    <CardShell label={t("forecastTitle")}>
      <p
        className={`mb-4 text-base font-medium ${f.firstNegative && !gentle ? "text-[var(--status-over)]" : ""}`}
      >
        {sentence}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible"
        role="img"
        aria-label={`${sentence} ${endText}`}
      >
        {min < 0 && !gentle && (
          <rect
            x="0"
            y={y(0)}
            width={W}
            height={H - y(0)}
            fill="var(--status-over)"
            opacity="0.1"
          />
        )}
        <line
          x1="0"
          x2={W}
          y1={y(0)}
          y2={y(0)}
          stroke="currentColor"
          strokeOpacity="0.2"
          vectorEffect="non-scaling-stroke"
        />
        {/* The same picture as every line chart in the app: an accent line over a soft fill of itself. */}
        <polygon
          points={`0,${H} ${values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} ${W},${H}`}
          fill="var(--chart-1)"
          opacity="0.12"
        />
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* A zero-length round-capped line stays a circle when the SVG is stretched. */}
        <line
          x1={x(lowIndex)}
          x2={x(lowIndex)}
          y1={y(f.low.balance)}
          y2={y(f.low.balance)}
          stroke={f.low.balance < 0 && !gentle ? "var(--status-over)" : "var(--chart-1)"}
          strokeWidth="8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        dir="ltr"
        className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums"
        aria-hidden
      >
        <span>{t("today")}</span>
        <span>{date(end.date)}</span>
      </div>
      <ul className="sr-only">
        <li>{t("todayBalance", { amount: money(f.points[0].balance) })}</li>
        <li>{t("low", low)}</li>
        {f.firstNegative && <li>{t("belowZero", { date: date(f.firstNegative) })}</li>}
        {f.nextPayday && <li>{t("salaryOn", { date: date(f.nextPayday) })}</li>}
        <li>{endText}</li>
      </ul>
    </CardShell>
  );
}
