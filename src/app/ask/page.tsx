import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { AskBox } from "@/components/ask/ask-box";
import { PipPanel } from "@/components/pip/pip-panel";
import { getPipMode } from "@/server/lib/pip-mode";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("ask");
  const tPip = await getTranslations("pip");
  const pipEnabled = getPipMode() === "on";
  return (
    <AppShell>
      <PageHeader
        title={pipEnabled ? tPip("title") : t("title")}
        meta={pipEnabled ? tPip("subtitle") : t("subtitle")}
      />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        {pipEnabled ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <PipPanel page />
          </div>
        ) : (
          <AskBox />
        )}
      </div>
    </AppShell>
  );
}
