"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useHousehold } from "@/hooks/use-household";
import { getLifeProgress, saveLifeProgress } from "@/lib/api";
import { LIFE_STAGES, relevantStages, type L, type LifeStage } from "@/lib/life-stages";
import { LifeHero } from "@/components/ui/page-hero";
import { cn } from "@/lib/utils";

type Progress = Record<string, string[]>;

export function LifeStages() {
  const t = useTranslations("life");
  const lang = useLocale() === "en" ? "en" : "he";
  const tx = (l: L) => l[lang];
  const qc = useQueryClient();
  const { household, loading } = useHousehold();
  const {
    data: progress = {},
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["life-progress"], queryFn: getLifeProgress });
  const save = useMutation({
    mutationFn: saveLifeProgress,
    onMutate: (next: Progress) => {
      const prev = qc.getQueryData<Progress>(["life-progress"]);
      qc.setQueryData(["life-progress"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["life-progress"], ctx?.prev);
      toast.error(t("saveFailed"));
    },
  });

  const nowIds = relevantStages(household).slice(0, 3);
  const now = nowIds.map((id) => LIFE_STAGES.find((s) => s.id === id)!);
  const others = LIFE_STAGES.filter((s) => !nowIds.includes(s.id));

  function toggle(stage: string, item: string, done: boolean) {
    const cur = progress[stage] ?? [];
    save.mutate({ ...progress, [stage]: done ? [...cur, item] : cur.filter((i) => i !== item) });
  }

  // Every stage card is always open: no folding.
  const row = (s: LifeStage) => {
    const done = (progress[s.id] ?? []).length;
    return (
      <li
        key={s.id}
        id={`stage-${s.id}`}
        className="scroll-mt-20 overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="card-title">{tx(s.title)}</h3>
            <p
              className={cn(
                "shrink-0 text-footnote tabular-nums",
                done === s.items.length && done > 0
                  ? "font-medium text-status-on-track"
                  : "text-muted-foreground",
              )}
            >
              {t("progress", { done, total: s.items.length })}
            </p>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-[var(--chart-1)] transition-[width] duration-300"
              style={{ width: `${s.items.length ? (done / s.items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="space-y-4 border-t border-border/60 px-5 py-4">
          <p className="text-footnote text-pretty text-muted-foreground">{tx(s.intro)}</p>
          <ul className="-mx-2">
            {s.items.map((i) => {
              const checked = (progress[s.id] ?? []).includes(i.id);
              return (
                <li key={i.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 transition-[background-color] duration-150 hover:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-ring">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-[var(--primary)] focus-visible:outline-none"
                      checked={checked}
                      onChange={(e) => toggle(s.id, i.id, e.target.checked)}
                    />
                    <span
                      className={cn("text-pretty", checked && "text-muted-foreground line-through")}
                    >
                      {tx(i.text)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {s.links.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-footnote font-semibold text-muted-foreground">
                {t("linksTitle")}
              </h4>
              <ul className="space-y-2">
                {s.links.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-6 items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline focus-visible:underline"
                    >
                      {tx(l.title)} <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only">{t("newTab")}</span>
                    </a>
                    <span className="block text-caption text-muted-foreground">
                      {t("source", {
                        source: t(l.source === "gov" ? "sourceGov" : "sourceKolzchut"),
                        date: l.lastChecked,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-muted-foreground">{t("linksNote")}</p>
            </div>
          )}
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-footnote text-pretty text-muted-foreground">
            {t(s.gentle ? "footerGentle" : "footer")}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <LifeHero
        loading={loading || isPending}
        error={isError}
        onRetry={() => refetch()}
        stage={now[0] && tx(now[0].title)}
        done={now[0] ? (progress[now[0].id] ?? []).length : 0}
        total={now[0]?.items.length ?? 0}
      />
      <section aria-labelledby="life-now" className="space-y-3">
        <h2 id="life-now" className="px-1 text-title font-semibold">
          {t("nowTitle")}
        </h2>
        {loading ? null : now.length ? (
          <ul className="grid items-start gap-4 lg:grid-cols-2">{now.map((s) => row(s))}</ul>
        ) : (
          <p className="px-1 text-footnote text-muted-foreground">{t("nowEmpty")}</p>
        )}
      </section>
      <section aria-labelledby="life-all" className="space-y-3">
        <h2 id="life-all" className="px-1 text-title font-semibold">
          {t("allTitle")}
        </h2>
        <nav
          aria-labelledby="life-all"
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0"
        >
          <ul className="flex gap-2 pb-1 md:flex-wrap">
            {others.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#stage-${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-footnote font-medium transition-[background-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {tx(s.title)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="grid items-start gap-4 lg:grid-cols-2">{others.map((s) => row(s))}</ul>
      </section>
    </div>
  );
}
