"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Check, X, Loader2, Sparkles, ShieldCheck, ExternalLink, Plug } from "lucide-react";
import { BANK_PROVIDERS } from "@/lib/types";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { cn } from "@/lib/utils";
import { useSyncErrorText } from "@/hooks/use-sync-error-text";

type RowStatus = "idle" | "running" | "awaiting-otp" | "manual-2fa" | "done" | "error";

export interface ProviderRow {
  provider: string;
  status: RowStatus;
  added: number;
  updated: number;
  errorMessage?: string;
  syncRunId?: number;
}

interface SyncProgressDialogProps {
  open: boolean;
  providers: string[];
  rows: ProviderRow[];
  stage: string | null;
  done: boolean;
  summary: { added: number; updated: number; categorized: number } | null;
  aiWarning?: string | null;
  onClose: () => void;
  onSubmitOtp?: (syncRunId: number, code: string) => Promise<void>;
}

const STAGE_LABEL_KEYS: Record<string, string> = {
  "ollama-start": "stageOllamaStart",
  categorizing: "stageCategorizing",
  "memory-hit": "stageMemoryHit",
};

export function SyncProgressDialog({
  open,
  providers,
  rows,
  stage,
  done,
  summary,
  aiWarning,
  onClose,
  onSubmitOtp,
}: SyncProgressDialogProps) {
  const t = useTranslations("syncDialog");
  const fullRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.provider, r]));
    return providers.map<ProviderRow>(
      (p) =>
        map.get(p) ?? {
          provider: p,
          status: "idle",
          added: 0,
          updated: 0,
        },
    );
  }, [providers, rows]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        data-sync-progress-dialog="true"
        className="max-h-[85vh] max-w-md overflow-y-auto p-0 sm:max-w-md"
        showCloseButton
      >
        <div className="px-6 pt-6 pb-2">
          <HeroDots done={done} warning={Boolean(aiWarning)} />
          <DialogTitle className="mt-4 text-center font-semibold text-2xl">
            {done ? (aiWarning ? t("titleSkipped") : t("titleDone")) : t("titleSyncing")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-center text-xs">
            {done
              ? aiWarning
                ? t("descSkipped")
                : t("descDone")
              : stage
                ? STAGE_LABEL_KEYS[stage]
                  ? t(STAGE_LABEL_KEYS[stage])
                  : t("working")
                : t("descReaching")}
          </DialogDescription>
        </div>

        <div className="space-y-2 px-6 pb-2">
          {fullRows.map((row) => (
            <ProviderRowView key={row.provider} row={row} onSubmitOtp={onSubmitOtp} />
          ))}
        </div>

        {summary && (
          <div className="mx-6 mb-4 mt-2 overflow-hidden rounded-2xl bg-card p-4">
            <div className="flex items-center justify-around gap-3 text-center">
              <SummaryStat label={t("statNew")} value={summary.added} accent />
              <Divider />
              <SummaryStat label={t("statUpdated")} value={summary.updated} />
              <Divider />
              <SummaryStat label={t("statCategorized")} value={summary.categorized} />
            </div>
          </div>
        )}

        {done && aiWarning && (
          <div
            className="mx-6 mb-6 flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center"
            style={{
              background: "color-mix(in oklch, var(--status-heads-up) 14%, var(--card))",
              borderColor: "color-mix(in oklch, var(--status-heads-up) 35%, var(--border))",
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in oklch, var(--status-heads-up) 28%, var(--card))",
                color: "var(--status-heads-up)",
              }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <p className="min-w-0 flex-1 text-muted-foreground">{aiWarning}</p>
            <IconButton
              label={t("connectAi")}
              variant="default"
              size="icon-sm"
              nativeButton={false}
              className="self-start sm:self-auto"
              render={<Link href="/settings/ai" />}
            >
              <Plug className="size-3.5" aria-hidden />
            </IconButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderRowView({
  row,
  onSubmitOtp,
}: {
  row: ProviderRow;
  onSubmitOtp?: (syncRunId: number, code: string) => Promise<void>;
}) {
  const info = BANK_PROVIDERS.find((b) => b.id === row.provider);
  const label = info?.name ?? row.provider;
  const color = info?.color ?? "#888";
  const isInteractive2fa = row.status === "awaiting-otp";
  const errorText = useSyncErrorText();
  const t = useTranslations("syncDialog");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 transition-[width,opacity,background-color,color,transform] duration-300",
        row.status === "running" &&
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--ring)_30%,transparent)]",
        isInteractive2fa &&
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--status-heads-up)_50%,transparent)]",
      )}
    >
      <div className="relative flex items-center gap-3">
        {row.status === "running" && (
          <div
            className="pointer-events-none absolute inset-0 animate-pulse opacity-60"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${color}22 50%, transparent 100%)`,
            }}
          />
        )}

        <div className="relative">
          <ProviderBadge color={color} name={label} domain={info?.domain} size={36} radius={10} />
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.status === "idle" && t("rowWaiting")}
            {row.status === "running" && t("rowPulling")}
            {row.status === "awaiting-otp" && t("rowAwaitingOtp")}
            {row.status === "manual-2fa" && (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {t("rowManual2fa")}
              </span>
            )}
            {row.status === "done" &&
              (row.added === 0 && row.updated === 0
                ? t("rowUpToDate")
                : row.updated
                  ? t("rowAddedUpdated", { added: row.added, updated: row.updated })
                  : t("rowAdded", { added: row.added }))}
          </div>
          {row.status === "error" && (
            <div className="break-words text-xs text-muted-foreground">
              {row.errorMessage ? errorText(row.errorMessage).message : t("rowFailed")}
            </div>
          )}
        </div>

        <div className="relative">
          <StatusBadge status={row.status} color={color} />
        </div>
      </div>

      {isInteractive2fa && onSubmitOtp && row.syncRunId ? (
        <OtpInputArea syncRunId={row.syncRunId} onSubmit={onSubmitOtp} />
      ) : null}
    </div>
  );
}

function OtpInputArea({
  syncRunId,
  onSubmit,
}: {
  syncRunId: number;
  onSubmit: (syncRunId: number, code: string) => Promise<void>;
}) {
  const t = useTranslations("syncDialog");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(syncRunId, trimmed);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("otpSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mt-3 flex items-center gap-2 border-t border-border/60 pt-3"
    >
      <Input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={t("otpPlaceholder")}
        className="font-mono"
        disabled={submitting}
        aria-label={t("otpLabel")}
      />
      <IconButton
        label={submitting ? t("otpSubmitting") : t("otpSubmit")}
        variant="default"
        size="icon-sm"
        type="submit"
        disabled={submitting || code.trim().length < 4}
      >
        {submitting ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
      </IconButton>
      {error && <p className="absolute -bottom-5 start-0 text-xs text-destructive">{error}</p>}
    </form>
  );
}

function StatusBadge({ status, color }: { status: RowStatus; color: string }) {
  const t = useTranslations("syncDialog");
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin" style={{ color }} />;
  }
  if (status === "awaiting-otp") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: "var(--status-heads-up)" }}
        aria-label={t("otpWaitingLabel")}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-background" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "manual-2fa") {
    return <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--status-heads-up)" }} />;
  }
  if (status === "done") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full motion-safe:animate-[checkPop_350ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
        style={{ background: "var(--status-on-track)" }}
      >
        <Check className="h-3.5 w-3.5 text-background" strokeWidth={3} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: "var(--status-over)" }}
      >
        <X className="h-3.5 w-3.5 text-background" strokeWidth={3} />
      </div>
    );
  }
  return <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />;
}

function HeroDots({ done, warning }: { done: boolean; warning?: boolean }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "relative h-16 w-16",
          done && "motion-safe:animate-[pop_500ms_cubic-bezier(0.16,1,0.3,1)_forwards]",
        )}
      >
        <Dot x={32} y={42} r={20} color="var(--primary)" delay={0} done={done} />
        <Dot x={32} y={20} r={9} color="var(--status-heads-up)" delay={150} done={done} />
        <Dot x={48} y={28} r={7} color="var(--status-plenty-left)" delay={300} done={done} />
        {done && (
          <div
            className="absolute inset-0 flex items-center justify-center motion-safe:animate-[fadeIn_500ms_ease-out_forwards]"
            style={{ animationDelay: "200ms", opacity: 0 }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: warning ? "var(--status-heads-up)" : "var(--status-on-track)",
              }}
            >
              {warning ? (
                <Sparkles className="h-5 w-5 text-background" strokeWidth={2.5} />
              ) : (
                <Check className="h-5 w-5 text-background" strokeWidth={3} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({
  x,
  y,
  r,
  color,
  delay,
  done,
}: {
  x: number;
  y: number;
  r: number;
  color: string;
  delay: number;
  done: boolean;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background: color,
        animation: done ? "none" : `dotPulse 1.4s ease-in-out ${delay}ms infinite`,
        opacity: done ? 0.35 : 1,
        transition: "opacity 400ms ease",
      }}
    />
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <span
        className={cn(
          "font-semibold text-2xl tabular-nums",
          accent && "text-[var(--status-on-track)]",
          "motion-safe:animate-[countIn_450ms_cubic-bezier(0.16,1,0.3,1)_forwards]",
        )}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  );
}

function Divider() {
  return <span className="h-8 w-px bg-border" />;
}
