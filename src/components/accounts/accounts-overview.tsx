"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Landmark, Link2, Plus } from "lucide-react";
import { getAssets, getHome } from "@/lib/api";
import { groupAccounts, groupItemsByProvider } from "@/lib/account-groups";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import { accountLabel, translateProviderName } from "@/lib/i18n-data";
import { useSidebarAccountsPref } from "@/components/layout/sidebar-accounts";
import { shekels } from "@/lib/money";
import { CardError, CardSkeleton } from "@/components/home/card-shell";

import { GROUP_ICON, TYPE_ICON } from "./account-icons";

/** All accounts on one page: net total, the bank connections, then every group with its accounts. */
export function AccountsOverview() {
  const t = useTranslations("accountsView");
  const tShell = useTranslations("shell");
  const tBanks = useTranslations("banks");
  const tInv = useTranslations("investments");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const { moves } = useSidebarAccountsPref();
  if (assets.isError) return <CardError label={t("pageTitle")} />;
  if (!assets.data) return <CardSkeleton label={t("pageTitle")} height={320} />;
  const { totals } = assets.data;
  const groups = groupAccounts(
    assets.data.assets.map((a) => ({ ...a, name: accountLabel(a, tBanks) })),
    moves,
  );
  const vehicles = groups.find((g) => g.key === "vehicles")?.total ?? 0;
  const banks = home.data?.bankHealth ?? [];
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href="/investments"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Plus className="size-4" aria-hidden />
          {t("add")}
        </Link>
      </div>
      {/* The household's net worth leads the page as its one large figure; assets and liabilities sit beside it. */}
      <section aria-label={t("netWorth")} className="home-hero text-start">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-muted-foreground">{t("netWorth")}</p>
            <p
              className="text-5xl leading-none font-semibold tracking-tight tabular-nums sm:text-6xl"
              data-money
              data-figure
            >
              <bdi>{money(totals.netWorth)}</bdi>
            </p>
          </div>
          <dl className="ms-auto flex flex-wrap gap-x-8 gap-y-2 max-sm:ms-0 max-sm:w-full">
            {(
              [
                [t("assets"), totals.assets, ""],
                [t("liabilities"), -totals.liabilities, "text-expense"],
                [t("groups.vehicles"), vehicles, "text-muted-foreground"],
              ] as const
            )
              .filter(([, v]) => v !== 0)
              .map(([k, v, c]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted-foreground">{k}</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${c}`} data-money>
                    <bdi>{money(v)}</bdi>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      </section>

      {/* Layout: one list of collapsible groups, each account nested and opening its own page.
          On wide screens the bank connections sit beside it, so a row never spans the whole screen. */}
      {/* One column on a phone still needs a zero minimum, or a long account name widens the whole page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="account-groups" className="min-w-0">
          <h2 id="account-groups" className={`mb-2 ${label}`}>
            {t("manualAccounts")} · {groups.reduce((n, g) => n + g.items.length, 0)}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {groups.map((g) => (
              <details
                key={g.key}
                open
                className="group/acc border-b border-border last:border-b-0"
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open/acc:rotate-0 ltr:-rotate-90 rtl:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
                    aria-hidden
                  >
                    {(() => {
                      const Icon = GROUP_ICON[g.key];
                      return <Icon className="size-4" />;
                    })()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {t(`groups.${g.key}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("accountsCount", { count: g.items.length })}
                  </span>
                  <bdi
                    data-money
                    className={`text-sm font-semibold tabular-nums ${g.total < 0 ? "text-expense" : ""}`}
                  >
                    {money(g.total)}
                  </bdi>
                </summary>
                <ul className="border-t border-border/60 bg-background/30">
                  {groupItemsByProvider(g.items).map((entry) => {
                    if (entry.kind === "item") {
                      const a = entry.item;
                      const full = assets.data!.assets.find((x) => x.id === a.id);
                      return (
                        <li key={a.id}>
                          <Link
                            href={`/accounts/${a.id}`}
                            className="flex min-h-14 items-center gap-3 ps-12 pe-4 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                          >
                            <span
                              className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                              aria-hidden
                            >
                              {(() => {
                                const Icon = TYPE_ICON[a.type];
                                return <Icon className="size-4" />;
                              })()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium" title={a.name}>
                                {a.name}
                              </span>
                              {full && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {tInv(`type_${full.type}`)} · {full.currency}
                                </span>
                              )}
                            </span>
                            <bdi
                              data-money
                              className={`text-sm font-semibold tabular-nums ${a.value < 0 ? "text-expense" : ""}`}
                            >
                              {money(a.value)}
                            </bdi>
                            <ChevronDown
                              className="size-4 text-muted-foreground ltr:-rotate-90 rtl:rotate-90"
                              aria-hidden
                            />
                          </Link>
                        </li>
                      );
                    }
                    const house = INVESTMENT_HOUSES.find((h) => h.id === entry.providerKey);
                    const houseName =
                      house?.name[locale === "he" ? "he" : "en"] ?? entry.providerKey;
                    const stripPrefix = (n: string) =>
                      n
                        .replace(/^אקסלנס\s*-\s*/, "")
                        .replace(new RegExp(`^${houseName}\\s*-\\s*`), "");
                    return (
                      <li key={`provider:${entry.providerKey}`}>
                        <details className="group/prov">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 ps-10 pe-4 hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                            <ChevronDown
                              className="size-4 shrink-0 text-muted-foreground transition-transform group-open/prov:rotate-0 ltr:-rotate-90 rtl:rotate-90 motion-reduce:transition-none"
                              aria-hidden
                            />
                            <span
                              className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                              aria-hidden
                            >
                              <Landmark className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {houseName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t("accountsCount", { count: entry.items.length })}
                            </span>
                            <bdi
                              data-money
                              className={`text-sm font-semibold tabular-nums ${entry.total < 0 ? "text-expense" : ""}`}
                            >
                              {money(entry.total)}
                            </bdi>
                          </summary>
                          <ul className="border-t border-border/40 bg-background/50">
                            {entry.items.map((a) => {
                              const full = assets.data!.assets.find((x) => x.id === a.id);
                              return (
                                <li key={a.id}>
                                  <Link
                                    href={`/accounts/${a.id}`}
                                    className="flex min-h-13 items-center gap-3 ps-18 pe-4 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                  >
                                    <span
                                      className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                                      aria-hidden
                                    >
                                      {(() => {
                                        const Icon = TYPE_ICON[a.type];
                                        return <Icon className="size-3.5" />;
                                      })()}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span
                                        className="block truncate text-sm font-medium"
                                        title={a.name}
                                      >
                                        {stripPrefix(a.name)}
                                      </span>
                                      {full && (
                                        <span className="block truncate text-xs text-muted-foreground">
                                          {tInv(`type_${full.type}`)} · {full.currency}
                                        </span>
                                      )}
                                    </span>
                                    <bdi
                                      data-money
                                      className={`text-sm font-semibold tabular-nums ${a.value < 0 ? "text-expense" : ""}`}
                                    >
                                      {money(a.value)}
                                    </bdi>
                                    <ChevronDown
                                      className="size-4 text-muted-foreground ltr:-rotate-90 rtl:rotate-90"
                                      aria-hidden
                                    />
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="bank-connections" className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="bank-connections" className={label}>
              {t("connections")}
            </h2>
            <Link
              href="/settings/bank"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-selection px-3 text-sm font-medium text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Link2 className="size-4" aria-hidden />
              {t("connect")}
            </Link>
          </div>
          {banks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noConnections")}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {banks.map((b) => (
                <li key={b.id} className="flex min-h-12 items-center gap-3 px-4">
                  <Landmark className="size-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1 truncate text-sm font-medium">
                    {translateProviderName(b.provider, b.providerName, tBanks)}
                    {b.label ? ` · ${b.label}` : ""}
                  </span>
                  <span
                    className={`text-xs ${b.status === "ok" ? "text-status-on-track" : b.status === "error" ? "text-expense" : "text-muted-foreground"}`}
                  >
                    {b.status === "ok"
                      ? tShell("synced")
                      : b.status === "error"
                        ? tShell("error")
                        : tShell("pending")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
