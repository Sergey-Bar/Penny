"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import { compactShekels, shekels } from "@/lib/money";
import type { AssetSnapshotPoint, ProviderSnapshotPoint } from "@/lib/api";
import type { Asset } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChartPoint = {
  date: string;
  valueIls: number;
  costBasisIls: number | null;
  valueNative?: number | null;
  currency?: string | null;
};

function formatPointTime(dateStr: string, locale: string) {
  const iso = dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    ...(dateStr.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

function formatNative(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function ProviderHistoryCard({
  title,
  providerSeries,
  assets,
  byAsset,
  selectedAssetId,
  onSelectAsset,
}: {
  title: string;
  providerSeries: ProviderSnapshotPoint[];
  assets: Asset[];
  byAsset: Record<number, AssetSnapshotPoint[]>;
  selectedAssetId: number | null;
  onSelectAsset: (id: number | null) => void;
}) {
  const t = useTranslations("investments");
  const locale = useLocale();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const selectedAsset = useMemo(
    () => (selectedAssetId != null ? (assets.find((a) => a.id === selectedAssetId) ?? null) : null),
    [assets, selectedAssetId],
  );

  const points: ChartPoint[] = useMemo(() => {
    if (selectedAsset) return byAsset[selectedAsset.id] ?? [];
    if (providerSeries.length > 0) return providerSeries;
    return [];
  }, [selectedAsset, byAsset, providerSeries]);

  const activeIdx =
    hoverIdx != null && hoverIdx >= 0 && hoverIdx < points.length ? hoverIdx : points.length - 1;
  const active = points[activeIdx] ?? null;

  const { min, max } = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 1 };
    const vals = points.flatMap((p) =>
      p.costBasisIls != null ? [p.valueIls, p.costBasisIls] : [p.valueIls],
    );
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.1 || Math.max(hi * 0.05, 1);
    return { min: Math.max(0, lo - pad), max: hi + pad };
  }, [points]);

  const width = 640;
  const height = 180;
  const range = max - min || 1;
  const xAt = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * width : width / 2);
  const yAt = (v: number) => height - ((v - min) / range) * (height - 20) - 10;

  const valuePath = points.map((p, i) => `${xAt(i)},${yAt(p.valueIls)}`).join(" ");
  const costPoints = points
    .map((p, i) => (p.costBasisIls != null ? `${xAt(i)},${yAt(p.costBasisIls)}` : null))
    .filter((s): s is string => s !== null);

  const activeGain =
    active && active.costBasisIls != null ? active.valueIls - active.costBasisIls : null;
  const activeGainPct =
    active && active.costBasisIls && active.costBasisIls > 0
      ? ((active.valueIls - active.costBasisIls) / active.costBasisIls) * 100
      : null;

  return (
    <CardShell
      label={`${t("historyTitle")}${selectedAsset ? ` · ${selectedAsset.name}` : title ? ` · ${title}` : ""}`}
      action={
        assets.length > 0 ? (
          <select
            value={selectedAssetId ?? ""}
            onChange={(e) => {
              setHoverIdx(null);
              onSelectAsset(e.target.value ? Number(e.target.value) : null);
            }}
            aria-label={t("historyTitle")}
            className="h-8 max-w-52 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">{t("allHoldings")}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      {points.length === 0 ? (
        <p className="py-6 text-center text-footnote text-muted-foreground">{t("historyNoData")}</p>
      ) : (
        <div className="space-y-3">
          {active && (
            <div className="flex flex-wrap items-baseline justify-between gap-3 text-footnote">
              <div className="flex flex-wrap items-baseline gap-4">
                <span>
                  <span className="text-muted-foreground">{t("currentValue")}: </span>
                  <strong className="tabular-nums">{shekels(active.valueIls, locale)}</strong>
                  {active.valueNative != null && active.currency && active.currency !== "ILS" && (
                    <span className="ms-1.5 text-caption text-muted-foreground" dir="ltr">
                      ({formatNative(active.valueNative, active.currency, locale)})
                    </span>
                  )}
                </span>
                {active.costBasisIls != null && (
                  <span>
                    <span className="text-muted-foreground">{t("costBasis")}: </span>
                    <span className="tabular-nums">{shekels(active.costBasisIls, locale)}</span>
                  </span>
                )}
                {activeGain != null && (
                  <span
                    dir="ltr"
                    className={cn(
                      "font-medium tabular-nums",
                      activeGain >= 0 ? "text-status-on-track" : "text-status-over",
                    )}
                  >
                    {activeGain >= 0 ? "+" : "−"}
                    {shekels(Math.abs(activeGain), locale)}
                    {activeGainPct != null &&
                      ` (${activeGainPct >= 0 ? "+" : "−"}${Math.abs(activeGainPct).toFixed(1)}%)`}
                  </span>
                )}
              </div>
              <span className="text-caption text-muted-foreground" dir="ltr">
                {formatPointTime(active.date, locale)}
              </span>
            </div>
          )}

          <div dir="ltr" className="relative flex w-full items-stretch gap-2">
            <div className="flex flex-col justify-between py-1 text-[10px] tabular-nums text-muted-foreground">
              <span>{compactShekels(max, locale)}</span>
              <span>{compactShekels((min + max) / 2, locale)}</span>
              <span>{compactShekels(min, locale)}</span>
            </div>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-44 min-w-0 flex-1 overflow-visible"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {costPoints.length > 1 && (
                <polyline
                  points={costPoints.join(" ")}
                  fill="none"
                  stroke="var(--muted-foreground)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity="0.7"
                />
              )}
              {points.length > 1 && (
                <polyline
                  points={valuePath}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((p, i) => {
                const cx = xAt(i);
                const cy = yAt(p.valueIls);
                const isActive = i === activeIdx;
                const showLabel =
                  isActive || i === 0 || i === points.length - 1 || points.length <= 6;
                return (
                  <g key={p.date}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isActive ? 5 : 3}
                      fill={isActive ? "var(--chart-1)" : "var(--background)"}
                      stroke="var(--chart-1)"
                      strokeWidth="2"
                    />
                    {showLabel && (
                      <text
                        x={cx}
                        y={Math.max(12, cy - 8)}
                        textAnchor="middle"
                        className="fill-foreground text-[10px] font-medium tabular-nums"
                      >
                        {compactShekels(p.valueIls, locale)}
                      </text>
                    )}
                    <rect
                      x={Math.max(0, cx - width / Math.max(points.length * 2, 4))}
                      y={0}
                      width={width / Math.max(points.length, 2)}
                      height={height}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoverIdx(i)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </CardShell>
  );
}
