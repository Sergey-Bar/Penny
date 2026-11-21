"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, CreditCard, Calculator, Plus, Grid2X2 } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { NAVIGATION_GROUPS } from "./navigation-groups";

export function MobileDock() {
  const path = usePathname(); const t = useTranslations("nav"); const tShell = useTranslations("shell"); const tNav = useTranslations("navGroups");
  const { setOpenMobile } = useSidebar();

  const activeHref = NAVIGATION_GROUPS.flatMap(group => group.items).find(item => item.match(path))?.href;
  // Same names as the menu; the last button opens the full menu.
  const items = [ { href: "/", name: tNav("pages.home"), Icon: LayoutDashboard }, { href: "/transactions", name: tNav("pages.transactions"), Icon: CreditCard }, { href: "/transactions?add=1", name: tShell("addTransaction"), Icon: Plus }, { href: "/budget", name: tNav("pages.budget"), Icon: Calculator }, { href: "/more", name: tShell("menu"), Icon: Grid2X2 } ];
  return <nav className="mobile-dock" aria-label={t("mobileNavigation")}>{items.map(({ href, name, Icon }) => href === "/more" ? <button key={href} type="button" onClick={() => setOpenMobile(true)} aria-label={tShell("openFullNavigation")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-3 text-xs"><Icon size={21} aria-hidden /><span>{tShell("menu")}</span></button> : href.includes("add=1") ? <Link key={href} href={href} aria-label={name} className="mobile-dock-add"><span><Icon size={24} aria-hidden /></span></Link> : <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined}><Icon size={21} aria-hidden /><span>{name}</span></Link>)}</nav>;
}
