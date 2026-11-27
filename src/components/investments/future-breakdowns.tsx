"use client";

import type { ReactNode } from "react";
import { shekels } from "@/lib/money";
import type { Asset } from "@/lib/types";

export const UNTAXED_ASSET_TYPES = new Set([
  "pension",
  "study_fund",
  "provident",
  "real_estate",
  "vehicle",
  "cash",
  "deposit",
]);

interface FutureTotals {
  assets: number;
  liquid: number;
  liabilities: number;
  deferredTax: number;
  netWorth: number;
  liquidNetWorth: number;
}

type TranslateInvestments = (key: string) => string;

function typeLabel(type: string, ti: TranslateInvestments): string {
  try {
    return ti(`type_${type}`);
  } catch {
    return type;
  }
}

function groupByType(items: Asset[]): Array<{ type: string; count: number; total: number }> {
  const map = new Map<string, { count: number; total: number }>();
  for (const a of items) {
    const v = a.valueIls ?? 0;
    const prev = map.get(a.type) ?? { count: 0, total: 0 };
    map.set(a.type, { count: prev.count + 1, total: prev.total + v });
  }
  return [...map.entries()]
    .map(([type, d]) => ({ type, count: d.count, total: d.total }))
    .sort((a, b) => b.total - a.total);
}

function Row({
  label,
  amount,
  muted,
  bold,
}: {
  label: ReactNode;
  amount: ReactNode;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-xs ${
        muted ? "text-muted-foreground" : ""
      } ${bold ? "font-semibold text-foreground" : ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <bdi className="shrink-0 tabular-nums">{amount}</bdi>
    </div>
  );
}

export function buildFutureBreakdowns({
  assets,
  totals,
  locale,
  ti,
}: {
  assets: Asset[];
  totals: FutureTotals;
  locale: string;
  ti: TranslateInvestments;
}) {
  const he = locale === "he";
  const nonLiab = assets.filter((a) => !a.isLiability);
  const liabList = assets.filter((a) => a.isLiability);
  const mortgages = liabList
    .filter((a) => a.type === "mortgage")
    .reduce((s, a) => s + (a.valueIls ?? 0), 0);
  const nonMortgageLiabilities = totals.liabilities - mortgages;

  const assetGroups = groupByType(nonLiab);
  const assetsInfo = (
    <div className="space-y-2.5 text-xs">
      <p className="text-muted-foreground leading-relaxed">
        {he
          ? "סך כל הנכסים: חשבונות בנק, השקעות, פנסיה, השתלמות, נדל״ן ונכסים נוספים."
          : "Total assets: bank accounts, investments, pension, study funds, property and other assets."}
      </p>
      <div className="space-y-1 border-t border-border/70 pt-2">
        {assetGroups.map((g) => (
          <Row
            key={g.type}
            label={`${typeLabel(g.type, ti)}${g.count > 1 ? ` (${g.count})` : ""}`}
            amount={shekels(g.total, locale)}
          />
        ))}
      </div>
      <div className="border-t border-border/70 pt-1.5">
        <Row
          label={he ? "סה״כ נכסים" : "Total assets"}
          amount={shekels(totals.assets, locale)}
          bold
        />
      </div>
    </div>
  );

  const liabilitiesInfo = (
    <div className="space-y-2.5 text-xs">
      <p className="text-muted-foreground leading-relaxed">
        {he
          ? "סך כל ההתחייבויות: משכנתא, הלוואות וכרטיסי אשראי."
          : "Total liabilities: mortgages, loans and credit balances."}
      </p>
      <div className="space-y-1 border-t border-border/70 pt-2">
        {liabList.length === 0 ? (
          <p className="text-muted-foreground">
            {he ? "אין התחייבויות רשומות." : "No liabilities recorded."}
          </p>
        ) : (
          liabList.map((a) => (
            <Row
              key={a.id}
              label={`${a.name} (${typeLabel(a.type, ti)})`}
              amount={shekels(-(a.valueIls ?? 0), locale)}
            />
          ))
        )}
      </div>
      <div className="border-t border-border/70 pt-1.5">
        <Row
          label={he ? "סה״כ התחייבויות" : "Total liabilities"}
          amount={shekels(-totals.liabilities, locale)}
          bold
        />
      </div>
    </div>
  );

  const taxedAssets = nonLiab
    .filter((a) => !UNTAXED_ASSET_TYPES.has(a.type) && a.gainIls != null && a.gainIls > 0)
    .sort((a, b) => (b.gainIls ?? 0) - (a.gainIls ?? 0));
  const totalTaxableGain = taxedAssets.reduce((s, a) => s + (a.gainIls ?? 0), 0);

  const exemptAssets = nonLiab.filter((a) => UNTAXED_ASSET_TYPES.has(a.type));
  const exemptGroups = groupByType(exemptAssets);
  const noGainTaxable = nonLiab.filter(
    (a) => !UNTAXED_ASSET_TYPES.has(a.type) && (a.gainIls == null || a.gainIls <= 0),
  );
  const noGainTotal = noGainTaxable.reduce((s, a) => s + (a.valueIls ?? 0), 0);

  const deferredTaxInfo = (
    <div className="space-y-2.5 text-xs">
      <p className="text-muted-foreground leading-relaxed">{ti("deferredTaxHint")}</p>
      <div className="space-y-1.5 border-t border-border/70 pt-2">
        <p className="font-semibold text-foreground">
          {he ? "חושב מס (25% על רווח חיובי):" : "Taxed (25% on positive gain):"}
        </p>
        {taxedAssets.length === 0 ? (
          <p className="text-muted-foreground">
            {he
              ? "אין השקעות חייבות במס עם רווח חיובי."
              : "No taxable holdings with positive gain."}
          </p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto pe-1">
            {taxedAssets.map((a) => {
              const gain = a.gainIls ?? 0;
              const tax = gain * 0.25;
              return (
                <div key={a.id} className="space-y-0.5">
                  <Row label={a.name} amount={shekels(-tax, locale)} />
                  <div className="text-[0.6875rem] text-muted-foreground">
                    {he ? "רווח:" : "Gain:"} <bdi>{shekels(gain, locale)}</bdi> × 25%
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {taxedAssets.length > 0 && (
          <div className="border-t border-border/50 pt-1">
            <Row
              label={
                he
                  ? `סה״כ רווח חייב (${shekels(totalTaxableGain, locale)}) × 25%`
                  : `Total taxable gain (${shekels(totalTaxableGain, locale)}) × 25%`
              }
              amount={shekels(-totals.deferredTax, locale)}
              bold
            />
          </div>
        )}
      </div>

      {(exemptGroups.length > 0 || noGainTaxable.length > 0) && (
        <div className="space-y-1 border-t border-border/70 pt-2">
          <p className="font-semibold text-foreground">
            {he ? "לא חושב עליהם מס:" : "Excluded from tax:"}
          </p>
          {exemptGroups.map((g) => (
            <Row
              key={g.type}
              label={`${typeLabel(g.type, ti)} (${he ? "פטור / מסלול אחר" : "exempt"})`}
              amount={shekels(g.total, locale)}
              muted
            />
          ))}
          {noGainTaxable.length > 0 && (
            <Row
              label={
                he
                  ? `ללא רווח חיובי / עלות חסרה (${noGainTaxable.length})`
                  : `No positive gain / cost missing (${noGainTaxable.length})`
              }
              amount={shekels(noGainTotal, locale)}
              muted
            />
          )}
        </div>
      )}
    </div>
  );

  const liquidAssets = nonLiab.filter((a) => a.liquid);
  const illiquidAssets = nonLiab.filter((a) => !a.liquid);
  const liquidGroups = groupByType(liquidAssets);
  const illiquidGroups = groupByType(illiquidAssets);
  const illiquidTotal = illiquidAssets.reduce((s, a) => s + (a.valueIls ?? 0), 0);

  const liquidNetWorthInfo = (
    <div className="space-y-2.5 text-xs">
      <p className="text-muted-foreground leading-relaxed">{ti("liquidNetWorthHint")}</p>
      <div className="space-y-1 border-t border-border/70 pt-2">
        <p className="font-semibold text-foreground">
          {he ? "נכסים נזילים שנכנסו:" : "Liquid assets included:"}
        </p>
        {liquidGroups.map((g) => (
          <Row
            key={g.type}
            label={`${typeLabel(g.type, ti)}${g.count > 1 ? ` (${g.count})` : ""}`}
            amount={shekels(g.total, locale)}
          />
        ))}
        <Row
          label={he ? "סה״כ נזיל" : "Total liquid"}
          amount={shekels(totals.liquid, locale)}
          bold
        />
      </div>

      <div className="space-y-1 border-t border-border/70 pt-2">
        <Row
          label={he ? "פחות חובות (ללא משכנתא)" : "Less debts (excl. mortgage)"}
          amount={shekels(-nonMortgageLiabilities, locale)}
        />
        {mortgages > 0 && (
          <div className="text-[0.6875rem] text-muted-foreground">
            {he
              ? `משכנתא (${shekels(mortgages, locale)}) לא הופחתה כי ההחזר כבר בהוצאות החודשיות.`
              : `Mortgage (${shekels(mortgages, locale)}) excluded as payments are in monthly spending.`}
          </div>
        )}
        <Row
          label={he ? "פחות מס רווח הון עתידי" : "Less future capital gains tax"}
          amount={shekels(-totals.deferredTax, locale)}
        />
      </div>

      {illiquidGroups.length > 0 && (
        <div className="space-y-1 border-t border-border/70 pt-2">
          <p className="font-semibold text-muted-foreground">
            {he
              ? `לא נכלל (לא נזיל — ${shekels(illiquidTotal, locale)}):`
              : `Excluded (illiquid — ${shekels(illiquidTotal, locale)}):`}
          </p>
          {illiquidGroups.map((g) => (
            <Row
              key={g.type}
              label={`${typeLabel(g.type, ti)}${g.count > 1 ? ` (${g.count})` : ""}`}
              amount={shekels(g.total, locale)}
              muted
            />
          ))}
        </div>
      )}

      <div className="border-t border-border/70 pt-1.5">
        <Row
          label={he ? "= זמין לפרישה מוקדמת" : "= Available for early retirement"}
          amount={shekels(totals.liquidNetWorth, locale)}
          bold
        />
      </div>
    </div>
  );

  return { assetsInfo, liabilitiesInfo, deferredTaxInfo, liquidNetWorthInfo };
}
