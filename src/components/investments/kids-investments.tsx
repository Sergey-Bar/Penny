"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assetProviderKey } from "@/lib/account-groups";
import { getAssets, getPlan, savePlan } from "@/lib/api";
import { useHousehold } from "@/hooks/use-household";
import { shekels } from "@/lib/money";
import {
  KID_TRACKS,
  kidProjection,
  STATE_MONTHLY_PER_CHILD,
  type KidPlan,
  type KidTrack,
} from "@/lib/kids";
import { CardShell } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";

const blank = (memberId: string): KidPlan => ({
  memberId,
  stateValue: 0,
  track: "medium",
  doubling: false,
  extraMonthly: 0,
  returnPct: 4,
  assetIds: [],
});

/** Savings for every child plus the parents' own investments, per child, projected to 18 and 21. */
export function KidsInvestments() {
  const t = useTranslations("kidsInvest");
  const locale = useLocale();
  const selectedProvider = useSearchParams().get("provider");
  const { household } = useHousehold();
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const qc = useQueryClient();
  const [editing, setEditing] = useState<KidPlan | null>(null);
  const children = household.members.filter((m) => m.role === "child");
  const owned = (assets.data?.assets ?? [])
    .filter((a) => !a.isLiability && a.source !== "bank")
    .filter((a) => !selectedProvider || assetProviderKey(a) === selectedProvider);
  if (selectedProvider && owned.length === 0) return null;
  const year = new Date().getFullYear();

  async function save(k: KidPlan) {
    if (!plan.data) return;
    try {
      await savePlan({
        ...plan.data.plan,
        kids: [...plan.data.plan.kids.filter((x) => x.memberId !== k.memberId), k],
      });
      await qc.invalidateQueries({ queryKey: ["plan"] });
      setEditing(null);
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  return (
    <CardShell id="kids" label={t("title")} className="scroll-mt-20">
      {children.length === 0 ? (
        <p className="text-footnote text-pretty text-muted-foreground">
          {t("noChildren")}{" "}
          <Link href="/settings/household" className="text-primary underline underline-offset-4">
            {t("addChild")}
          </Link>
        </p>
      ) : (
        <ul className="space-y-4">
          {children.map((c) => {
            const k = plan.data?.plan.kids.find((x) => x.memberId === c.id) ?? blank(c.id);
            const holdings = owned
              .filter((a) => k.assetIds.includes(a.id))
              .reduce((s, a) => s + (a.valueIls ?? 0), 0);
            const age = c.birthYear ? year - c.birthYear : null;
            const p = age == null ? null : kidProjection(k, holdings, age);
            const e = editing?.memberId === c.id ? editing : null;
            return (
              <li key={c.id} className="rounded-xl bg-muted/50 p-4">
                <p className="font-semibold">
                  {c.name || t("child")}
                  {age != null && (
                    <span className="ms-2 text-footnote font-normal text-muted-foreground">
                      {t("age", { age })}
                    </span>
                  )}
                </p>
                <p className="text-footnote text-muted-foreground">
                  {t("stateLine", {
                    amount: shekels(k.stateValue, locale),
                    track: t(`track_${k.track}`),
                    monthly: shekels(STATE_MONTHLY_PER_CHILD * (k.doubling ? 2 : 1), locale),
                  })}{" "}
                  ·{" "}
                  {t("parentLine", {
                    amount: shekels(holdings, locale),
                    monthly: shekels(k.extraMonthly, locale),
                  })}
                </p>
                {p ? (
                  <p className="mt-2 text-footnote font-medium">
                    {t("projection", {
                      at18: shekels(p.at18, locale),
                      at21: shekels(p.at21, locale),
                      ret: k.returnPct,
                    })}
                  </p>
                ) : (
                  <p className="mt-2 text-footnote text-muted-foreground">{t("needBirthYear")}</p>
                )}
                {e ? (
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void save(e);
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberField
                        id={`kid-${c.id}-state`}
                        label={t("stateValue")}
                        unit="₪"
                        value={e.stateValue}
                        onChange={(v) =>
                          setEditing({ ...e, stateValue: Math.max(0, Number(v) || 0) })
                        }
                      />
                      <label className="space-y-1.5 text-sm font-medium">
                        {t("track")}
                        <select
                          className="min-h-11 w-full rounded-md border bg-background px-3 font-normal"
                          value={e.track}
                          onChange={(ev) =>
                            setEditing({ ...e, track: ev.target.value as KidTrack })
                          }
                        >
                          {KID_TRACKS.map((tr) => (
                            <option key={tr} value={tr}>
                              {t(`track_${tr}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <NumberField
                        id={`kid-${c.id}-extra`}
                        label={t("extraMonthly")}
                        unit="₪"
                        value={e.extraMonthly}
                        onChange={(v) =>
                          setEditing({ ...e, extraMonthly: Math.max(0, Number(v) || 0) })
                        }
                      />
                      <NumberField
                        id={`kid-${c.id}-ret`}
                        label={t("returnPct")}
                        unit="%"
                        value={e.returnPct}
                        onChange={(v) =>
                          setEditing({ ...e, returnPct: Math.min(15, Math.max(0, Number(v) || 0)) })
                        }
                      />
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={e.doubling}
                        onChange={(ev) => setEditing({ ...e, doubling: ev.target.checked })}
                      />
                      {t("doubling", { amount: shekels(STATE_MONTHLY_PER_CHILD, locale) })}
                    </label>
                    {owned.length > 0 && (
                      <fieldset className="space-y-1 text-sm">
                        <legend className="font-semibold">{t("holdings")}</legend>
                        {owned.map((a) => (
                          <label key={a.id} className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={e.assetIds.includes(a.id)}
                              onChange={(ev) =>
                                setEditing({
                                  ...e,
                                  assetIds: ev.target.checked
                                    ? [...e.assetIds, a.id]
                                    : e.assetIds.filter((id) => id !== a.id),
                                })
                              }
                            />
                            {a.name}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className="flex gap-2">
                      <Button type="submit">{t("save")}</Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(k)}
                  >
                    {t("edit")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-caption text-pretty text-muted-foreground">
        {t("assumption", { amount: shekels(STATE_MONTHLY_PER_CHILD, locale) })}
      </p>
    </CardShell>
  );
}
