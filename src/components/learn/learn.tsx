"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, Calculator, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Forward } from "@/components/ui/dir-chevron";
import { ARTICLES, TOPICS, TOPIC_LABEL, pick, type Article, type Topic } from "@/content/learn";

export function LearnHub() {
  const t = useTranslations("learn");
  const locale = useLocale();
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = ARTICLES.filter(
    (a) =>
      (topic === "all" || a.topic === topic) &&
      (!query ||
        `${pick(a.title, locale)} ${pick(a.summary, locale)}`.toLowerCase().includes(query)),
  );

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 ps-9"
        />
      </div>
      <Segmented
        label={t("topic")}
        value={topic}
        onChange={setTopic}
        options={[
          { value: "all" as const, label: t("all") },
          ...TOPICS.map((tp) => ({ value: tp, label: pick(TOPIC_LABEL[tp], locale) })),
        ]}
      />
      {shown.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((a) => (
            <li key={a.slug}>
              <ArticleCard a={a} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-footnote text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}

function ArticleCard({ a }: { a: Article }) {
  const t = useTranslations("learn");
  const locale = useLocale();
  return (
    <Link
      href={`/learn/${a.slug}`}
      className="flex h-full gap-4 rounded-2xl bg-card p-5 transition-[background-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-selection text-accent-c"
        aria-hidden
      >
        <BookOpen className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-footnote font-medium text-muted-foreground">
          {pick(TOPIC_LABEL[a.topic], locale)} · {t("minutes", { n: a.minutes })}
        </span>
        <span className="mt-0.5 block text-headline font-semibold text-pretty">
          {pick(a.title, locale)}
        </span>
        <span className="mt-1 block text-sm text-pretty text-muted-foreground">
          {pick(a.summary, locale)}
        </span>
      </span>
    </Link>
  );
}

export function ArticleView({ a }: { a: Article }) {
  const t = useTranslations("learn");
  const locale = useLocale();
  const related = ARTICLES.filter((x) => x.slug !== a.slug && x.topic === a.topic)
    .concat(ARTICLES.filter((x) => x.topic !== a.topic))
    .slice(0, 2);
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-footnote font-medium text-muted-foreground">
          {pick(TOPIC_LABEL[a.topic], locale)}
          <Clock className="ms-2 size-3.5" aria-hidden />
          {t("minutes", { n: a.minutes })}
        </p>
        <p className="text-lg text-pretty text-muted-foreground">{pick(a.summary, locale)}</p>
      </header>

      <div className="space-y-6 rounded-2xl bg-card p-5 sm:p-8">
        {a.sections.map((s) => (
          <section key={s.heading.en} className="space-y-3">
            <h2 className="text-title font-semibold">{pick(s.heading, locale)}</h2>
            {s.body.map((p) => (
              <p key={p.en} className="max-w-prose leading-relaxed text-pretty">
                {pick(p, locale)}
              </p>
            ))}
          </section>
        ))}
      </div>

      <aside className="rounded-2xl bg-emerald-500/10 p-5" aria-label={t("takeaway")}>
        <p className="text-footnote font-semibold text-emerald-700 dark:text-emerald-300">
          {t("takeaway")}
        </p>
        <p className="mt-1 font-medium text-pretty">{pick(a.takeaway, locale)}</p>
        {a.calculator && (
          <Link
            href={a.calculator.href}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Calculator className="size-4" aria-hidden />
            {pick(a.calculator.label, locale)}
          </Link>
        )}
      </aside>

      <section aria-labelledby="learn-related" className="space-y-3">
        <h2 id="learn-related" className="text-footnote font-semibold text-muted-foreground">
          {t("related")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {related.map((r) => (
            <li key={r.slug}>
              <ArticleCard a={r} />
            </li>
          ))}
        </ul>
        <Link
          href="/learn"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t("all")} <Forward />
        </Link>
      </section>
      <p className="text-footnote text-muted-foreground">{t("disclaimer")}</p>
    </article>
  );
}
