"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJSON } from "@/lib/api";
import { PipPanel } from "./pip-panel";

export function PipDock() {
  const t = useTranslations("pip");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchJSON<{ enabled: boolean }>("/api/pip/status")
      .then((status) => {
        if (!cancelled) setEnabled(status.enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!enabled || pathname === "/ask") return null;
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("title")}
          aria-modal="false"
          className="glass-popover fixed bottom-24 end-3 z-50 flex h-[min(38rem,calc(100dvh-8rem))] w-[min(25rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-border p-3 shadow-xl md:bottom-6 md:end-6"
        >
          <PipPanel onClose={() => setOpen(false)} />
        </div>
      )}
      <Button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? t("close") : t("open")}
        className="fixed bottom-24 end-3 z-40 gap-2 shadow-lg md:bottom-6 md:end-6"
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="hidden sm:inline">Pip</span>
      </Button>
    </>
  );
}
