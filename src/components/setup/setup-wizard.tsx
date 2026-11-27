"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useA11y } from "@/components/a11y/a11y-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AIStep } from "@/components/setup/ai-step";
import { MonthlyTargetStep } from "@/components/setup/monthly-target-step";
import { BudgetsStep } from "@/components/setup/budgets-step";
import { CompleteStep } from "@/components/setup/complete-step";
import { WorkspaceNameStep } from "@/components/setup/workspace-name-step";
import { ConnectStep, IntroStep, ProfileStep, TourStep } from "@/components/setup/onboarding-steps";
import { createWorkspace, saveOnboardingStep } from "@/lib/api";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/onboarding";
import { setActiveWorkspaceId } from "@/lib/workspace-store";
import { useQueryClient } from "@tanstack/react-query";

export type SetupMode = "first-run" | "new-workspace";

type WizardStep = OnboardingStep | "name";

const NEW_WORKSPACE_STEPS: readonly WizardStep[] = ["name", "connect", "target", "budgets", "done"];

export function SetupWizard({
  mode = "first-run",
  initialStep = "welcome",
  resumable = false,
}: {
  mode?: SetupMode;
  initialStep?: OnboardingStep;
  resumable?: boolean;
}) {
  const t = useTranslations("setup");
  const tOn = useTranslations("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const firstRun = mode === "first-run";
  const steps: readonly WizardStep[] = firstRun ? ONBOARDING_STEPS : NEW_WORKSPACE_STEPS;
  const [step, setStep] = useState<WizardStep>(firstRun ? initialStep : "name");
  const [creating, setCreating] = useState(false);
  const moved = useRef(false);

  const index = steps.indexOf(step);
  const go = (to: WizardStep) => {
    moved.current = true;
    setStep(to);
    // Resumable: the next visit to Home brings people back to this step.
    if (resumable) void saveOnboardingStep(to as OnboardingStep).catch(() => {});
  };
  const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => go(steps[Math.max(index - 1, 0)]);

  useEffect(() => {
    if (moved.current) window.scrollTo({ top: 0 });
  }, [step]);

  // After a step change, focus the new heading so keyboard and screen-reader users start at the top of it.
  const focusHeading = () => {
    if (!moved.current) return;
    const h = document.querySelector<HTMLElement>("main h1");
    h?.setAttribute("tabindex", "-1");
    h?.classList.add("outline-none");
    h?.focus();
  };

  async function handleNameSubmit(name: string) {
    setCreating(true);
    try {
      const ws = await createWorkspace(name);
      setActiveWorkspaceId(ws.id);
      void queryClient.invalidateQueries();
      go("connect");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspaceCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleFinish() {
    if (firstRun) await saveOnboardingStep("complete").catch(() => {});
    const banks = queryClient.getQueryData<unknown[]>(["integrations"])?.length ?? 0;
    void queryClient.invalidateQueries();
    router.push(banks ? "/settings/bank?sync=1" : "/");
  }

  async function skip() {
    await saveOnboardingStep("complete").catch(() => {});
    router.push("/");
  }

  const labels: Record<WizardStep, string> = {
    name: t("stepName"),
    welcome: tOn("stepWelcome"),
    profile: tOn("stepProfile"),
    connect: t("stepConnect"),
    target: t("stepTarget"),
    budgets: t("stepBudgets"),
    ai: t("stepAi"),
    tour: tOn("stepTour"),
    done: t("stepDone"),
  };

  return (
    <MotionConfig reducedMotion={useA11y().prefs.stopMotion ? "always" : "user"}>
      <div className="profiles-screen relative min-h-screen w-full">
        <header className="relative z-10 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-6 md:px-8">
          <BrandMark />
          <DotStepper index={index} labels={steps.map((s) => labels[s])} />
          {firstRun ? (
            <button
              type="button"
              onClick={skip}
              className="min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {tOn("skip")}
            </button>
          ) : (
            <a
              href="https://github.com/Sergey-Bar/Penny"
              target="_blank"
              rel="noreferrer"
              className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
            >
              {t("docs")}
            </a>
          )}
        </header>

        <main className="relative z-10 mx-auto px-6 pb-16 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
              onAnimationComplete={(def) => {
                if (def !== "exit") focusHeading();
              }}
            >
              {step === "name" && (
                <WorkspaceNameStep onComplete={handleNameSubmit} submitting={creating} />
              )}
              {step === "welcome" && <IntroStep onComplete={next} />}
              {step === "profile" && <ProfileStep onComplete={next} onBack={back} />}
              {step === "connect" && (
                <ConnectStep onComplete={next} onBack={firstRun ? back : undefined} />
              )}
              {step === "target" && <MonthlyTargetStep onComplete={next} onBack={back} />}
              {step === "budgets" && <BudgetsStep onComplete={next} onBack={back} />}
              {step === "ai" && (
                <>
                  <AIStep onComplete={next} onBack={back} />
                  {/* Optional: moving on keeps whatever AI setting is there now. */}
                  <div className="mt-4 flex justify-center">
                    <Button variant="ghost" size="lg" onClick={next}>
                      {tOn("later")}
                    </Button>
                  </div>
                </>
              )}
              {step === "tour" && <TourStep onComplete={next} onBack={back} />}
              {step === "done" && <CompleteStep onFinish={handleFinish} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div>
        <div className="font-semibold text-lg leading-none tracking-tight">Penny</div>
      </div>
    </div>
  );
}

/** Progress: a dot per step; narrow screens name only the current one. */
function DotStepper({ index, labels }: { index: number; labels: string[] }) {
  const t = useTranslations("onboarding");
  return (
    <div className="order-last flex w-full items-center justify-center gap-2 md:order-none md:w-auto">
      <p className="sr-only" aria-live="polite">
        {t("progress", { n: index + 1, total: labels.length, step: labels[index] })}
      </p>
      {labels.map((label, i) => {
        const state = i < index ? "done" : i === index ? "active" : "todo";
        return (
          <div key={label} aria-hidden className="flex items-center gap-2">
            <DotLabel label={label} state={state} />
            {i < labels.length - 1 && (
              <motion.div
                animate={{
                  background: i < index ? "var(--primary)" : "var(--border)",
                }}
                transition={{ duration: 0.35 }}
                className="h-px w-3.5 rounded-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DotLabel({ label, state }: { label: string; state: "todo" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={{
          background:
            state === "active"
              ? "var(--foreground)"
              : state === "done"
                ? "var(--primary)"
                : "var(--border)",
          scale: state === "active" ? 1.4 : 1,
        }}
        transition={{ duration: 0.25 }}
        className="h-1.5 w-1.5 rounded-full"
      />
      <span
        className={`text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
          state === "active" ? "" : "hidden xl:inline"
        } ${
          state === "active"
            ? "text-foreground"
            : state === "done"
              ? "text-primary"
              : "text-muted-foreground/60"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
