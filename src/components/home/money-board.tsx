"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { getAssets, getCashAhead, getCashflowHealth } from "@/lib/api";
import { usePlan } from "@/hooks/use-plan";
import { useHousehold } from "@/hooks/use-household";
import { buildMoneyMap, type MapArea, type MapRow } from "@/lib/money-map";
import { boardLots, houseCount, type BoardLot } from "@/lib/money-board";
import { shekels } from "@/lib/money";
import { dirFor, isLocale, defaultLocale } from "@/i18n/routing";
import { CardSkeleton } from "./card-shell";

/** Each area's colour: the strip along its lot's outer edge, its buildings and its dot in the list. */
const TONE: Record<MapArea | "budget" | "transactions", string> = {
  cashflow: "var(--success)",
  cushion: "var(--chart-2)",
  investments: "var(--accent-color)",
  pension: "var(--chart-5)",
  debts: "var(--error)",
  property: "var(--chart-4)",
  netWorth: "var(--accent-color)",
  budget: "var(--chart-3)",
  transactions: "var(--text-secondary)",
};

// True 30° isometric projection, as on the website's map.
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const P = (x: number, y: number, z = 0) => `${r1((x - y) * C)},${r1((x + y) * S - z)}`;
const G = 104; // one lot
const HALF = 46; // half of a lot's top face

/** A box drawn as its three visible faces; light comes from the upper left. */
function Box({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  color,
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
}) {
  return (
    <g>
      <polygon
        points={`${P(x, y + d, z)} ${P(x + w, y + d, z)} ${P(x + w, y + d, z + h)} ${P(x, y + d, z + h)}`}
        fill={`color-mix(in oklab, ${color} 78%, black)`}
      />
      <polygon
        points={`${P(x + w, y, z)} ${P(x + w, y + d, z)} ${P(x + w, y + d, z + h)} ${P(x + w, y, z + h)}`}
        fill={`color-mix(in oklab, ${color} 58%, black)`}
      />
      <polygon
        points={`${P(x, y, z + h)} ${P(x + w, y, z + h)} ${P(x + w, y + d, z + h)} ${P(x, y + d, z + h)}`}
        fill={color}
      />
    </g>
  );
}

/** A little house: walls and a gabled roof. */
function House({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  const w = 16;
  const d = 16;
  const h = 11;
  const roof = 9;
  return (
    <g>
      <Box x={x} y={y} z={z} w={w} d={d} h={h} color={`color-mix(in oklab, ${color} 30%, white)`} />
      {/* gable on the left face, then the two roof slopes */}
      <polygon
        points={`${P(x, y + d, z + h)} ${P(x + w, y + d, z + h)} ${P(x + w / 2, y + d, z + h + roof)}`}
        fill={`color-mix(in oklab, ${color} 78%, black)`}
      />
      <polygon
        points={`${P(x + w, y, z + h)} ${P(x + w, y + d, z + h)} ${P(x + w / 2, y + d, z + h + roof)} ${P(x + w / 2, y, z + h + roof)}`}
        fill={`color-mix(in oklab, ${color} 62%, black)`}
      />
      <polygon
        points={`${P(x, y, z + h)} ${P(x, y + d, z + h)} ${P(x + w / 2, y + d, z + h + roof)} ${P(x + w / 2, y, z + h + roof)}`}
        fill={color}
      />
    </g>
  );
}

function Lot({ lot, on }: { lot: BoardLot & { tone: string; value: number | null }; on: boolean }) {
  const cx = lot.gx * G;
  const cy = lot.gy * G;
  const z = on ? 20 : 12;
  const empty = lot.value == null;
  const n = empty ? 0 : houseCount(lot.value!);
  // The colour strip runs along the lot's outer edge, as on a board game's property.
  const strip = 15;
  const band =
    lot.gy === 1
      ? { x: cx - HALF, y: cy + HALF - strip, w: HALF * 2, d: strip }
      : lot.gx === 1
        ? { x: cx + HALF - strip, y: cy - HALF, w: strip, d: HALF * 2 }
        : lot.gy === -1
          ? { x: cx - HALF, y: cy - HALF, w: HALF * 2, d: strip }
          : { x: cx - HALF, y: cy - HALF, w: strip, d: HALF * 2 };
  const spots = [
    [-22, -22],
    [4, -22],
    [-22, 4],
    [4, 4],
  ];
  return (
    <g style={{ transition: "opacity 120ms ease" }} opacity={empty ? 0.55 : 1}>
      <Box
        x={cx - HALF}
        y={cy - HALF}
        z={0}
        w={HALF * 2}
        d={HALF * 2}
        h={z}
        color="var(--board-lot)"
      />
      <polygon
        points={`${P(band.x, band.y, z + 0.5)} ${P(band.x + band.w, band.y, z + 0.5)} ${P(band.x + band.w, band.y + band.d, z + 0.5)} ${P(band.x, band.y + band.d, z + 0.5)}`}
        fill={lot.tone}
      />
      {on && (
        <polygon
          points={`${P(cx - HALF, cy - HALF, z + 1)} ${P(cx + HALF, cy - HALF, z + 1)} ${P(cx + HALF, cy + HALF, z + 1)} ${P(cx - HALF, cy + HALF, z + 1)}`}
          fill="none"
          stroke="var(--accent-color)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {n === 4 ? (
        // The largest holdings get one tall building instead of four houses.
        <Box x={cx - 16} y={cy - 16} z={z} w={30} d={30} h={44} color={lot.tone} />
      ) : (
        spots
          .slice(0, n)
          .map(([dx, dy]) => (
            <House key={`${dx}${dy}`} x={cx + dx} y={cy + dy} z={z} color={lot.tone} />
          ))
      )}
    </g>
  );
}

/**
 * Home's board: the household's money as lots around a square, in the spirit of a property board game. Each lot is
 * one area of the household's money with a colour strip on its edge; the more there is in it, the more is built on
 * it, and an empty lot is an invitation to fill it in. The centre holds the net worth. The picture is decorative:
 * every lot is also a row in the list beside it, which is what a keyboard or a screen reader uses.
 */
export function MoneyBoard() {
  const t = useTranslations("home.map");
  const tNav = useTranslations("navGroups");
  const tBoard = useTranslations("board");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const rtl = dirFor(locale) === "rtl";
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const health = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead });
  const { plan } = usePlan();
  const { household, loading } = useHousehold();

  if (assets.isPending || health.isPending || cash.isPending || loading)
    return (
      <div className="md:col-span-2 lg:col-span-3">
        <CardSkeleton label={tBoard("mapTile")} height={300} />
      </div>
    );

  const { rows, more } = buildMoneyMap({
    forecast: cash.data?.safeToSpend ?? null,
    assets: assets.data?.assets ?? null,
    expenses: health.data?.hasData ? health.data.avgExpenses : null,
    emergencyMonths: plan.emergencyMonths,
    hasHomeEvent: household.events.some((e) => e.type === "homePurchase" || e.type === "movedIn"),
  });
  const all = [...rows, ...more];
  const byArea = new Map<MapArea, MapRow>(all.map((r) => [r.area, r]));
  const net = byArea.get("netWorth");

  const lots = boardLots(rtl).map((lot) => {
    const row = lot.id === "budget" || lot.id === "transactions" ? null : byArea.get(lot.id);
    const value =
      lot.id === "budget" || lot.id === "transactions"
        ? 1 // a place to go rather than an amount: always a built lot, with one house
        : row?.value == null
          ? null
          : Math.abs(row.value);
    const owed = lot.id === "debts" && (row?.value ?? 0) > 0;
    return {
      ...lot,
      value,
      href: row?.href ?? (lot.id === "budget" ? "/budget" : "/transactions"),
      tone: lot.id === "debts" && !owed ? "var(--success)" : TONE[lot.id],
      name:
        lot.id === "budget" || lot.id === "transactions"
          ? tNav(`pages.${lot.id}`)
          : t(`area.${lot.id}`),
      amount:
        lot.id === "budget" || lot.id === "transactions" || row?.value == null
          ? null
          : // A debt reads as an amount owed; a shortfall this month keeps its minus sign.
            shekels(Math.round(lot.id === "debts" ? Math.abs(row.value) : row.value), locale),
      invite: lot.id !== "budget" && lot.id !== "transactions" && row?.value == null,
      bad: owed || (lot.id === "cashflow" && (row?.value ?? 0) < 0),
    };
  });
  // Back to front, so nearer lots overlap the ones behind them.
  const drawn = [...lots].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
  const E = G * 1.5 + 14;

  return (
    <section
      aria-label={tBoard("mapTile")}
      className="grid min-w-0 gap-4 rounded-[26px] border border-border bg-card p-5 sm:p-6 md:col-span-2 lg:col-span-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center"
    >
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold">{tBoard("mapTile")}</h2>
        <svg
          viewBox="-290 -175 580 365"
          className="mx-auto mt-2 block w-full max-w-[560px]"
          aria-hidden
          focusable="false"
        >
          {/* the table the board sits on */}
          <ellipse cx="0" cy="112" rx="280" ry="70" fill="var(--board-shadow)" />
          <Box x={-E} y={-E} z={-10} w={E * 2} d={E * 2} h={10} color="var(--board-base)" />
          {drawn.map((lot) => (
            <g
              key={lot.id}
              onPointerEnter={() => setHover(lot.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => router.push(lot.href)}
              style={{ cursor: "pointer" }}
            >
              <Lot lot={lot} on={hover === lot.id} />
            </g>
          ))}
          {/* the centre: the mark, standing on a low plinth */}
          <Box x={-34} y={-34} z={0} w={68} d={68} h={8} color="var(--board-lot)" />
          <Box x={-18} y={-18} z={8} w={36} d={36} h={30} color="var(--brand)" />
          <g
            transform={`translate(${P(0, 0, 38).replace(",", " ")}) matrix(${C} ${S} ${-C} ${S} 0 0)`}
          >
            <rect x="-9" y="-9" width="6" height="18" rx="3" fill="var(--on-brand)" />
            <rect x="3" y="-9" width="6" height="18" rx="3" fill="var(--on-brand)" />
          </g>
        </svg>
      </div>

      <div className="min-w-0">
        {net?.value != null && (
          <div className="mb-3 border-b border-border pb-3">
            <p className="text-[13px] text-muted-foreground">{t("area.netWorth")}</p>
            <p
              className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums"
              data-money
              data-figure
            >
              <bdi>{shekels(Math.round(net.value), locale)}</bdi>
            </p>
          </div>
        )}
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {lots.map((lot) => (
            <li key={lot.id}>
              <Link
                href={lot.href}
                onPointerEnter={() => setHover(lot.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(lot.id)}
                onBlur={() => setHover(null)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring ${hover === lot.id ? "bg-hover" : ""}`}
              >
                <span
                  aria-hidden
                  className="h-5 w-1.5 shrink-0 rounded-full"
                  style={{ background: lot.tone, opacity: lot.invite ? 0.4 : 1 }}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{lot.name}</span>
                {lot.invite ? (
                  <span className="flex items-center gap-1 text-[13px] text-primary">
                    <Plus className="size-3.5" aria-hidden />
                    {tBoard("mapAdd")}
                  </span>
                ) : lot.amount ? (
                  <bdi
                    data-money
                    className={`font-medium tabular-nums ${lot.bad ? "text-expense" : ""}`}
                  >
                    {lot.amount}
                  </bdi>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
