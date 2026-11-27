import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/components/home/home-page";
import { ProfileGate } from "@/components/profiles/profile-gate";
import { onboardingStep } from "@/server/lib/onboarding";
import { HOME_VIEW_COOKIE, homeViewFrom } from "@/lib/home-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  // A new install (or one that stopped half way) goes to first-run onboarding; it can be skipped from there.
  if (onboardingStep()) redirect("/setup");
  // Home opens on Focus: one calm page. The detailed dashboard lives here for people who switched to it.
  if (homeViewFrom((await cookies()).get(HOME_VIEW_COOKIE)?.value) === "focus") redirect("/focus");
  return (
    <AppShell>
      <ProfileGate />
      <HomePage />
    </AppShell>
  );
}
