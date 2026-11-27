"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import type { ActivitySnapshot } from "@/lib/types";

interface PendingOtpItem {
  syncRunId: number;
  provider: string;
  label?: string;
}

const HOUSE_MAP = new Map<string, { he: string; en: string }>(
  INVESTMENT_HOUSES.map((h) => [h.id, h.name]),
);

async function fetchPendingOtps(): Promise<{ pending: PendingOtpItem[] }> {
  const res = await fetch("/api/sync/otp", { cache: "no-store" });
  if (!res.ok) return { pending: [] };
  return res.json() as Promise<{ pending: PendingOtpItem[] }>;
}

/**
 * Global SMS / OTP prompt shown on any route when a background or main-button sync
 * (bank or investment house) pauses for a one-time verification code.
 */
export function GlobalOtpDialog() {
  const locale = useLocale();
  const he = locale === "he";
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activity = queryClient.getQueryData<ActivitySnapshot>(["activity"]);
  const syncActive = activity?.sync.active === true;

  const { data } = useQuery({
    queryKey: ["sync-otp-pending"],
    queryFn: fetchPendingOtps,
    refetchInterval: (q) => {
      const hasPending = (q.state.data?.pending.length ?? 0) > 0;
      return hasPending || syncActive ? 2000 : 8000;
    },
    refetchIntervalInBackground: false,
  });

  const pending = data?.pending ?? [];
  const hasSyncDialogOpen =
    typeof document !== "undefined" &&
    Boolean(document.querySelector("[data-sync-progress-dialog]"));

  // SyncProgressDialog handles positive bank syncRunIds inline when it is open;
  // pension OTPs (negative syncRunId) or any OTP when on another screen use this global dialog.
  const activeOtp = pending.find((p) => p.syncRunId < 0 || !hasSyncDialogOpen) ?? null;

  if (!activeOtp) return null;

  const house = HOUSE_MAP.get(activeOtp.provider);
  const providerTitle =
    activeOtp.label && activeOtp.label !== activeOtp.provider
      ? `${house ? (he ? house.he : house.en) : activeOtp.provider} · ${activeOtp.label}`
      : house
        ? he
          ? house.he
          : house.en
        : activeOtp.provider;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sync/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncRunId: activeOtp.syncRunId, code: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(err.message ?? (he ? "שליחת הקוד נכשלה" : "Failed to submit code"));
        return;
      }
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["sync-otp-pending"] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <KeyRound className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">
              {he ? "נדרש קוד אימות (SMS)" : "Verification code required"}
            </DialogTitle>
            <DialogDescription className="truncate text-xs">{providerTitle}</DialogDescription>
          </div>
        </div>
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3">
          <Input
            autoFocus
            dir="ltr"
            inputMode="numeric"
            placeholder={he ? "הזינו את הקוד שהתקבל ב-SMS" : "Enter SMS code"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={submitting}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!code.trim() || submitting}>
              {submitting ? (he ? "שולח…" : "Sending…") : he ? "אישור" : "Submit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
