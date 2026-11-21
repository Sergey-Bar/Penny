"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, FileUp, Landmark, Plus, Search, Settings as SettingsIcon, WalletCards } from "lucide-react";
import { SyncButton } from "@/components/dashboard/sync-button";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OPEN_COMMAND_PALETTE } from "./command-palette";
import { NotificationsBell } from "./notifications-bell";
import { cn } from "@/lib/utils";

/** The row above every page on wide screens: add a transaction (and its siblings) on the start; sync, alerts and settings on the end. */
export function TopBar() {
  const t = useTranslations("topBar");
  const tShell = useTranslations("shell");
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); router.push("/transactions?add=1"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const icon = cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-xl");

  return (
    <div className="hidden md:block">
      <div className="mx-auto flex min-h-14 max-w-[1920px] items-center gap-2 px-6 pt-3 lg:px-8">
        <div className="inline-flex rounded-xl shadow-sm">
          <Link href="/transactions?add=1" aria-keyshortcuts="N" title={t("addHint")} className={cn(buttonVariants(), "rounded-e-none rounded-s-xl")}>
            <Plus className="size-4" aria-hidden />
            {tShell("addTransaction")}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t("moreAdd")} className={cn(buttonVariants({ size: "icon" }), "rounded-s-none rounded-e-xl border-s border-primary-foreground/25")}>
              <ChevronDown className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => router.push("/settings/data")}><FileUp className="size-4" aria-hidden />{t("importFile")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings/bank")}><Landmark className="size-4" aria-hidden />{t("connectBank")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/investments")}><WalletCards className="size-4" aria-hidden />{t("addAccount")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Search sits in the middle of the bar, where the eye looks for it, not wedged into the side menu. */}
        <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /"
          className="mx-auto flex min-h-10 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/4%)] transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 text-start">{t("search")}</span>
          <kbd dir="ltr" className="rounded-md border border-border bg-muted px-1.5 font-sans text-[11px]">Ctrl K</kbd>
        </button>
        <div className="flex items-center gap-2">
          <SyncButton onComplete={() => queryClient.invalidateQueries()} showLabel={false} />
          {/* The bell is for what happened; advice and alerts live with Pip in the side rail. */}
          <NotificationsBell />
          <Link href="/settings" aria-label={t("settings")} title={t("settings")} className={icon}>
            <SettingsIcon className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
