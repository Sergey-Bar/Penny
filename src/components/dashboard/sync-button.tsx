"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSyncErrorText } from "@/hooks/use-sync-error-text";
import { IconButton } from "@/components/ui/icon-button";
import { startSync, submitSyncOtp } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { SyncProgressDialog, type ProviderRow } from "./sync-progress-dialog";

interface SyncButtonProps {
  /** Off in the collapsed sidebar, where only the icon fits. */
  showLabel?: boolean;
  onComplete: () => void;
  autoStart?: boolean;
}

export function SyncButton({ onComplete, autoStart = false, showLabel = true }: SyncButtonProps) {
  const t = useTranslations("dashboard");
  const errorText = useSyncErrorText();
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{
    added: number;
    updated: number;
    categorized: number;
  } | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const awaitingOtpRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!done || !dialogOpen) return;
    if (aiWarning) return;
    const t = setTimeout(() => setDialogOpen(false), 3500);
    return () => clearTimeout(t);
  }, [done, dialogOpen, aiWarning]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleSubmitOtp = useCallback(async (syncRunId: number, code: string) => {
    await submitSyncOtp(syncRunId, code);
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setProviders([]);
    setRows([]);
    setStage(null);
    setDone(false);
    setSummary(null);
    setAiWarning(null);
    setDialogOpen(true);
    awaitingOtpRef.current = new Set();

    const { cancel } = startSync(undefined, (event) => {
      if (event.type === "plan") {
        const list = (event.data.providers as string[]) ?? [];
        setProviders(list);
        setRows(list.map((p) => ({ provider: p, status: "idle", added: 0, updated: 0 })));
      } else if (event.type === "provider-start") {
        const provider = event.data.provider as string;
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.provider === provider && r.status === "idle");
          const target = idx >= 0 ? idx : prev.findIndex((r) => r.provider === provider);
          return prev.map((r, i) => (i === target ? { ...r, status: "running" } : r));
        });
      } else if (event.type === "provider-2fa-needed") {
        const provider = event.data.provider as string;
        const syncRunId = event.data.syncRunId as number;
        awaitingOtpRef.current.add(provider);
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.provider === provider && r.status === "running");
          const target = idx >= 0 ? idx : prev.findIndex((r) => r.provider === provider);
          return prev.map((r, i) =>
            i === target ? { ...r, status: "awaiting-otp", syncRunId } : r,
          );
        });
      } else if (event.type === "provider-2fa-submitted") {
        const provider = event.data.provider as string;
        awaitingOtpRef.current.delete(provider);
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider && r.status === "awaiting-otp"
              ? { ...r, status: "running" }
              : r,
          ),
        );
      } else if (event.type === "provider-2fa-manual") {
        const provider = event.data.provider as string;
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider && r.status === "running" ? { ...r, status: "manual-2fa" } : r,
          ),
        );
      } else if (event.type === "provider-done") {
        const provider = event.data.provider as string;
        const ok = event.data.ok as boolean;
        const added = (event.data.added as number) ?? 0;
        const updated = (event.data.updated as number) ?? 0;
        const errorMessage = event.data.errorMessage as string | undefined;
        awaitingOtpRef.current.delete(provider);
        setRows((prev) => {
          const idx = prev.findIndex(
            (r) =>
              r.provider === provider &&
              (r.status === "running" || r.status === "awaiting-otp" || r.status === "manual-2fa"),
          );
          const target = idx >= 0 ? idx : prev.findIndex((r) => r.provider === provider);
          return prev.map((r, i) =>
            i === target
              ? {
                  ...r,
                  status: ok ? "done" : "error",
                  added,
                  updated,
                  errorMessage,
                }
              : r,
          );
        });
        if (!ok && errorMessage) {
          toast.error(`${provider}: ${errorText(errorMessage).message}`, {
            duration: 8000,
            closeButton: true,
          });
        }
      } else if (event.type === "stage") {
        setStage((event.data.stage as string) ?? null);
      } else if (event.type === "complete") {
        const added = (event.data.added as number) ?? 0;
        const updated = (event.data.updated as number) ?? 0;
        const categorized = (event.data.categorized as number) ?? 0;
        const warning = event.data.aiWarning as string | null;
        setSummary({ added, updated, categorized });
        setStage(null);
        setDone(true);
        setSyncing(false);
        setAiWarning(warning ?? null);
        if (warning) {
          toast.warning(t("aiCategorizationIssue"), {
            description: warning,
            duration: 6000,
            closeButton: true,
          });
        }
        onComplete();
      } else if (event.type === "error") {
        const message = event.data.message as string;
        setSyncing(false);
        setDialogOpen(false);
        toast.error(message, {
          duration: Infinity,
          closeButton: true,
          description: t("checkDevTerminal"),
        });
      }
    });

    cancelRef.current = cancel;
  };

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStartedRef.current && !syncing) {
      autoStartedRef.current = true;
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <>
      <IconButton
        showLabel={showLabel}
        label={syncing ? t("syncing") : t("syncAndCategorize")}
        variant={showLabel ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => (syncing ? setDialogOpen(true) : handleSync())}
      >
        <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
      </IconButton>

      <SyncProgressDialog
        open={dialogOpen}
        providers={providers}
        rows={rows}
        stage={stage}
        done={done}
        summary={summary}
        aiWarning={aiWarning}
        onClose={closeDialog}
        onSubmitOtp={handleSubmitOtp}
      />
    </>
  );
}
