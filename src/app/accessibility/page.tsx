import { getLocale, getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";

/** Required by the Equal Rights for Persons with Disabilities regulations. */
const CONTACT = {
  issueUrl: "https://github.com/Sergey-Bar/Penny/issues",
};
const REVIEWED = new Date("2026-11-14T12:00:00Z");

const DONE = ["done1", "done2", "done3", "done4", "done5", "done6", "done7"] as const;
const LIMITS = ["limits1", "limits2", "limits3", "limits4"] as const;

export default async function AccessibilityStatementPage() {
  const t = await getTranslations("a11y.st");
  const locale = await getLocale();
  // Grouped like Settings: the title sits above the card.
  const section = "[&>div]:rounded-2xl [&>div]:bg-card [&>div]:px-4 [&>div]:py-3";
  const h2 = "mb-2 px-4 text-sm font-semibold text-muted-foreground";
  const date = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    dateStyle: "long",
    timeZone: "Asia/Jerusalem",
  }).format(REVIEWED);
  return (
    <AppShell>
      <PageHeader title={t("title")} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <p className="text-base">{t("intro")}</p>

        <section className={section} aria-labelledby="a11y-standard">
          <h2 id="a11y-standard" className={h2}>
            {t("standardTitle")}
          </h2>
          <div>
            <p className="text-base">{t("standardBody")}</p>
          </div>
        </section>

        <section className={section} aria-labelledby="a11y-done">
          <h2 id="a11y-done" className={h2}>
            {t("doneTitle")}
          </h2>
          <div>
            <ul className="list-disc space-y-2 ps-5 text-base">
              {DONE.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className={section} aria-labelledby="a11y-menu">
          <h2 id="a11y-menu" className={h2}>
            {t("menuTitle")}
          </h2>
          <div>
            <p className="text-base">{t("menuBody")}</p>
          </div>
        </section>

        <section className={section} aria-labelledby="a11y-limits">
          <h2 id="a11y-limits" className={h2}>
            {t("limitsTitle")}
          </h2>
          <div>
            <ul className="list-disc space-y-2 ps-5 text-base">
              {LIMITS.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className={section} aria-labelledby="a11y-support">
          <h2 id="a11y-support" className={h2}>
            {t("supportTitle")}
          </h2>
          <div>
            <p className="text-base">{t("supportBody")}</p>
          </div>
        </section>

        <section className={section} aria-labelledby="a11y-contact">
          <h2 id="a11y-contact" className={h2}>
            {t("contactTitle")}
          </h2>
          <div>
            <p className="text-base">{t("contactBody")}</p>
            <dl className="mt-3 divide-y divide-border border-t border-border text-base [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-x-4 [&>div]:py-2.5 [&>div:last-child]:pb-0">
              <div>
                <dt className="font-medium">{t("contactName")}</dt>
                <dd>{t("contactNameValue")}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("contactChannelValue")}</dt>
                <dd>
                  <a
                    href={CONTACT.issueUrl}
                    dir="ltr"
                    className="text-primary underline underline-offset-4"
                  >
                    {t("contactIssue")}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <p className="px-4 text-footnote text-muted-foreground">{t("reviewed", { date })}</p>
      </div>
    </AppShell>
  );
}
