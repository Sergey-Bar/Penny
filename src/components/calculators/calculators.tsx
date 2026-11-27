"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Banknote,
  Car,
  Hammer,
  House,
  Landmark,
  LineChart,
  Percent,
  Scale,
  Sprout,
  Wallet,
} from "lucide-react";
import { NumField } from "@/components/ui/num-field";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import {
  growth,
  payoffPlan,
  renovationBudget,
  RENO_COSTS,
  type Debt,
  type DebtStrategy,
  type Room,
} from "@/lib/calculators";
import { shekels } from "@/lib/money";

const pct = (v: number) => Math.round(v * 10000) / 100;

/** Every calculator in the app, by life topic. Existing FI tools live on /fi. */
const HUB = [
  {
    key: "money",
    items: [
      { href: "/calculators/growth", key: "growth", Icon: Sprout },
      { href: "/calculators/debt", key: "debt", Icon: Scale },
      { href: "/fi", key: "fi", Icon: LineChart },
    ],
  },
  {
    key: "home",
    items: [
      { href: "/calculators/mortgage", key: "mortgage", Icon: Percent },
      { href: "/discounted-home", key: "discountedHome", Icon: House },
      { href: "/calculators/renovation", key: "renovation", Icon: Hammer },
      { href: "/fi", key: "rentBuy", Icon: Landmark },
    ],
  },
  {
    key: "life",
    items: [
      { href: "/car", key: "car", Icon: Car },
      { href: "/fi", key: "takeHome", Icon: Wallet },
      { href: "/fi", key: "fees", Icon: Banknote },
    ],
  },
] as const;

export function CalculatorsHub() {
  const t = useTranslations("calculators");
  return (
    <div className="space-y-8">
      {HUB.map((g) => (
        <section key={g.key} aria-labelledby={`calc-${g.key}`}>
          <h2
            id={`calc-${g.key}`}
            className="mb-3 px-1 text-footnote font-semibold text-muted-foreground"
          >
            {t(`group.${g.key}`)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map(({ href, key, Icon }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="flex h-full items-start gap-4 rounded-2xl bg-card p-5 transition-[background-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-selection text-accent-c"
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-headline font-semibold">
                      {t(`item.${key}.title`)}
                    </span>
                    <span className="mt-0.5 block text-footnote text-pretty text-muted-foreground">
                      {t(`item.${key}.hint`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-card p-5 sm:p-6">
      <h2 id={id} className="mb-4 text-headline font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Nudge({ text, link }: { text: string; link: string }) {
  return (
    <div className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-pretty">
      <p>{text}</p>
      <Link
        href="/investments"
        className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {link}
      </Link>
    </div>
  );
}

export function GrowthCalculator() {
  const t = useTranslations("calculators.growthCalc");
  const tc = useTranslations("calculators");
  const locale = useLocale();
  const [v, setV] = useState({ initial: 10_000, monthly: 1_000, years: 20, ret: 0.06 });
  const g = growth(v.initial, v.monthly, v.years, v.ret);
  const late = growth(v.initial, v.monthly, Math.max(0, v.years - 5), v.ret);
  const max = Math.max(g.balance, 1);
  return (
    <div className="space-y-6">
      <Panel id="g-in" title={t("inputs")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <NumField
            id="g-initial"
            label={t("initial")}
            value={v.initial}
            step={1000}
            onChange={(n) => setV({ ...v, initial: n })}
          />
          <NumField
            id="g-monthly"
            label={t("monthly")}
            value={v.monthly}
            step={100}
            onChange={(n) => setV({ ...v, monthly: n })}
          />
          <NumField
            id="g-years"
            label={t("years")}
            value={v.years}
            min={1}
            max={60}
            onChange={(n) => setV({ ...v, years: n })}
          />
          <NumField
            id="g-ret"
            label={t("ret")}
            value={pct(v.ret)}
            step={0.5}
            max={20}
            onChange={(n) => setV({ ...v, ret: n / 100 })}
          />
        </div>
      </Panel>
      <Panel id="g-out" title={t("result", { years: v.years })}>
        <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
          {shekels(g.balance, locale)}
        </p>
        <p className="mt-1 text-sm text-pretty">
          {t("split", {
            deposited: shekels(g.deposited, locale),
            earned: shekels(g.earned, locale),
          })}
        </p>
        <div className="mt-5 flex h-40 items-end gap-1" role="img" aria-label={t("chartLabel")}>
          {g.yearly.map((y) => (
            <div
              key={y.year}
              className="flex flex-1 flex-col justify-end"
              style={{ height: `${(y.balance / max) * 100}%` }}
            >
              <div
                className="rounded-t bg-emerald-500"
                style={{ flexGrow: Math.max(0, y.balance - y.deposited) }}
              />
              <div className="bg-indigo-400" style={{ flexGrow: y.deposited }} />
            </div>
          ))}
        </div>
        <ul className="mt-3 flex gap-4 text-footnote text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-indigo-400" aria-hidden />
            {t("deposited")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden />
            {t("earned")}
          </li>
        </ul>
        {v.years > 5 && (
          <p className="mt-4 text-sm text-pretty">
            {t("waitCost", { amount: shekels(g.balance - late.balance, locale) })}
          </p>
        )}
        <Nudge text={t("nudge")} link={tc("investLink")} />
        <p className="mt-4 text-footnote text-muted-foreground">{tc("disclaimer")}</p>
      </Panel>
    </div>
  );
}

const newDebt = (): Debt => ({ name: "", balance: 0, ratePct: 0, minPayment: 0 });

export function DebtCalculator() {
  const t = useTranslations("calculators.debtCalc");
  const tc = useTranslations("calculators");
  const locale = useLocale();
  const [debts, setDebts] = useState<Debt[]>([
    { name: t("sampleCard"), balance: 8_000, ratePct: 16, minPayment: 300 },
    { name: t("sampleLoan"), balance: 40_000, ratePct: 8, minPayment: 1_100 },
    { name: t("sampleOverdraft"), balance: 6_000, ratePct: 12, minPayment: 200 },
  ]);
  const [budget, setBudget] = useState(2_500);
  const [strategy, setStrategy] = useState<DebtStrategy>("avalanche");
  const named = debts.map((d, i) => ({ ...d, name: d.name || t("debtN", { n: i + 1 }) }));
  const plan = payoffPlan(named, budget, strategy);
  const other = payoffPlan(named, budget, strategy === "avalanche" ? "snowball" : "avalanche");
  const minimums = named.reduce((s, d) => s + d.minPayment, 0);
  const set = (i: number, patch: Partial<Debt>) =>
    setDebts(debts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const years = (m: number) =>
    t("duration", {
      years: Math.floor(m / 12),
      months: m % 12,
      both: m >= 12 && m % 12 ? "yes" : "no",
    });

  return (
    <div className="space-y-6">
      <Panel id="d-in" title={t("debts")}>
        <ul className="space-y-4">
          {debts.map((d, i) => (
            <li
              key={i}
              className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-end"
            >
              <div className="col-span-2 space-y-1.5 md:col-span-1">
                <label htmlFor={`debt-name-${i}`} className="text-sm font-medium">
                  {t("name")}
                </label>
                <Input
                  id={`debt-name-${i}`}
                  maxLength={40}
                  value={d.name}
                  placeholder={t("debtN", { n: i + 1 })}
                  onChange={(e) => set(i, { name: e.target.value })}
                />
              </div>
              <NumField
                id={`debt-bal-${i}`}
                label={t("balance")}
                value={d.balance}
                step={500}
                onChange={(n) => set(i, { balance: n })}
              />
              <NumField
                id={`debt-rate-${i}`}
                label={t("rate")}
                value={d.ratePct}
                step={0.5}
                onChange={(n) => set(i, { ratePct: n })}
              />
              <NumField
                id={`debt-min-${i}`}
                label={t("min")}
                value={d.minPayment}
                step={50}
                onChange={(n) => set(i, { minPayment: n })}
              />
              <button
                type="button"
                onClick={() => setDebts(debts.filter((_, j) => j !== i))}
                disabled={debts.length === 1}
                className="min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
        {debts.length < 8 && (
          <button
            type="button"
            onClick={() => setDebts([...debts, newDebt()])}
            className="mt-3 min-h-11 rounded-full px-3 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("add")}
          </button>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2 md:items-end">
          <NumField
            id="debt-budget"
            label={t("budget")}
            value={budget}
            step={100}
            onChange={setBudget}
          />
          <Segmented
            label={t("strategy")}
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: "avalanche", label: t("avalanche") },
              { value: "snowball", label: t("snowball") },
            ]}
          />
        </div>
        <p className="mt-2 text-footnote text-muted-foreground">{t(`${strategy}Hint`)}</p>
      </Panel>
      <Panel id="d-out" title={t("result")}>
        <div aria-live="polite">
          {!plan ? (
            <p className="text-sm">{t("tooLow", { amount: shekels(minimums, locale) })}</p>
          ) : (
            <>
              <p className="text-2xl font-semibold">{years(plan.months)}</p>
              <p className="mt-1 text-sm">
                {t("interest", { amount: shekels(plan.interest, locale) })}
              </p>
              {other && Math.abs(other.interest - plan.interest) >= 1 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("compare", {
                    strategy: t(strategy === "avalanche" ? "snowball" : "avalanche"),
                    amount: shekels(other.interest, locale),
                    time: years(other.months),
                  })}
                </p>
              )}
              <ol className="mt-4 space-y-1.5 text-sm">
                {plan.paidOff.map((p, i) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span>
                      {i + 1}. {p.name}
                    </span>
                    <span className="text-muted-foreground">{years(p.month)}</span>
                  </li>
                ))}
              </ol>
              <Nudge
                text={t("nudge", { amount: shekels(budget, locale) })}
                link={tc("investLink")}
              />
            </>
          )}
        </div>
        <p className="mt-4 text-footnote text-muted-foreground">{tc("disclaimer")}</p>
      </Panel>
    </div>
  );
}

const KINDS: Room["kind"][] = ["kitchen", "bathroom", "room", "flooring", "paint"];
type Finish = 0 | 1 | 2;

export function RenovationCalculator() {
  const t = useTranslations("calculators.renoCalc");
  const tc = useTranslations("calculators");
  const locale = useLocale();
  const [finish, setFinish] = useState<Finish>(1);
  const [count, setCount] = useState<Record<Room["kind"], number>>({
    kitchen: 1,
    bathroom: 1,
    room: 0,
    flooring: 0,
    paint: 1,
    other: 0,
  });
  const [extra, setExtra] = useState(0);
  const [v, setV] = useState({ buffer: 0.15, savings: 60_000, rate: 0.08, years: 5 });
  const rooms: Room[] = [
    ...KINDS.flatMap((k) =>
      Array.from({ length: count[k] }, () => ({ kind: k, cost: RENO_COSTS[k][finish] })),
    ),
    { kind: "other", cost: extra },
  ];
  const r = renovationBudget(rooms, v.buffer, v.savings, v.rate * 100, v.years);
  const money = (n: number) => shekels(n, locale);

  return (
    <div className="space-y-6">
      <Panel id="r-in" title={t("what")}>
        <Segmented
          label={t("finish")}
          value={finish}
          onChange={setFinish}
          options={[
            { value: 0, label: t("basic") },
            { value: 1, label: t("standard") },
            { value: 2, label: t("premium") },
          ]}
          className="mb-4"
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {KINDS.map((k) => (
            <NumField
              key={k}
              id={`reno-${k}`}
              label={t(`kind.${k}`, { cost: money(RENO_COSTS[k][finish]) })}
              value={count[k]}
              max={10}
              onChange={(n) => setCount({ ...count, [k]: Math.round(n) })}
            />
          ))}
          <NumField
            id="reno-extra"
            label={t("extra")}
            value={extra}
            step={1000}
            onChange={setExtra}
          />
        </div>
      </Panel>
      <Panel id="r-pay" title={t("pay")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <NumField
            id="reno-buffer"
            label={t("buffer")}
            value={pct(v.buffer)}
            max={50}
            onChange={(n) => setV({ ...v, buffer: n / 100 })}
          />
          <NumField
            id="reno-savings"
            label={t("savings")}
            value={v.savings}
            step={5000}
            onChange={(n) => setV({ ...v, savings: n })}
          />
          <NumField
            id="reno-rate"
            label={t("rate")}
            value={pct(v.rate)}
            step={0.25}
            onChange={(n) => setV({ ...v, rate: n / 100 })}
          />
          <NumField
            id="reno-years"
            label={t("years")}
            value={v.years}
            min={1}
            max={15}
            onChange={(n) => setV({ ...v, years: n })}
          />
        </div>
      </Panel>
      <Panel id="r-out" title={t("result")}>
        <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
          {money(r.total)}
        </p>
        <dl className="mt-3 grid max-w-md grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("base")}</dt>
          <dd className="tabular-nums">{money(r.base)}</dd>
          <dt className="text-muted-foreground">{t("bufferAmount")}</dt>
          <dd className="tabular-nums">{money(r.buffer)}</dd>
          <dt className="text-muted-foreground">{t("fromSavings")}</dt>
          <dd className="tabular-nums">{money(r.fromSavings)}</dd>
          {r.loan > 0 && (
            <>
              <dt className="text-muted-foreground">{t("loan")}</dt>
              <dd className="tabular-nums">{money(r.loan)}</dd>
              <dt className="text-muted-foreground">{t("monthly")}</dt>
              <dd className="tabular-nums">{money(r.monthly)}</dd>
              <dt className="text-muted-foreground">{t("interest")}</dt>
              <dd className="tabular-nums">{money(r.interest)}</dd>
            </>
          )}
        </dl>
        {r.loan > 0 && r.monthly > 0 && (
          <Nudge
            text={t("nudge", {
              months: Math.ceil(r.loan / r.monthly),
              monthly: money(r.monthly),
              interest: money(r.interest),
            })}
            link={tc("investLink")}
          />
        )}
        <p className="mt-4 text-footnote text-muted-foreground">{t("disclaimer")}</p>
      </Panel>
    </div>
  );
}
