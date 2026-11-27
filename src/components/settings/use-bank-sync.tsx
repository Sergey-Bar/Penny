"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { startSync, type SyncProgressEvent } from "@/lib/api";

export interface SyncState {
  syncing: boolean;
  stage: string;
}

export function useBankSync() {
  const t = useTranslations("bankSync");
  const queryClient = useQueryClient();
  const [state, setState] = useState<Record<number, SyncState>>({});

  const start = useCallback(
    (credentialId: number) => {
      setState((prev) => ({
        ...prev,
        [credentialId]: { syncing: true, stage: t("connecting") },
      }));
      const { cancel } = startSync(credentialId, (event: SyncProgressEvent) => {
        if (event.type === "provider-start") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: t("pulling") },
          }));
        } else if (event.type === "provider-2fa-needed") {
          cancel();
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          const label =
            (event.data.label as string | undefined) ??
            (event.data.provider as string | undefined) ??
            t("bankFallback");
          toast.warning(t("needs2fa", { label }), {
            description: t("needs2faDescription"),
            duration: 12000,
            closeButton: true,
          });
        } else if (event.type === "provider-2fa-manual") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: t("solve2fa") },
          }));
        } else if (event.type === "provider-done") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          const ok = event.data.ok as boolean | undefined;
          const errorMessage = event.data.errorMessage as string | undefined;
          if (ok === false && errorMessage) {
            toast.error(errorMessage, { duration: Infinity, closeButton: true });
          }
          void queryClient.invalidateQueries({ queryKey: ["integrations"] });
          void queryClient.invalidateQueries({ queryKey: ["assets"] });
          void queryClient.invalidateQueries({ queryKey: ["asset-history"] });
          void queryClient.invalidateQueries({ queryKey: ["home"] });
          void queryClient.invalidateQueries({ queryKey: ["activity"] });
          void queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
        } else if (event.type === "stage") {
          const s = event.data.stage as string;
          setState((prev) =>
            prev[credentialId]?.syncing
              ? {
                  ...prev,
                  [credentialId]: {
                    syncing: true,
                    stage: s === "categorizing" ? t("categorizing") : t("working"),
                  },
                }
              : prev,
          );
        } else if (event.type === "complete") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          const data = event.data as {
            added: number;
            updated: number;
            categorized: number;
          };
          toast.success(t("complete", data));
          void queryClient.invalidateQueries({ queryKey: ["integrations"] });
          void queryClient.invalidateQueries({ queryKey: ["summary"] });
          void queryClient.invalidateQueries({ queryKey: ["transactions"] });
          void queryClient.invalidateQueries({ queryKey: ["assets"] });
          void queryClient.invalidateQueries({ queryKey: ["asset-history"] });
          void queryClient.invalidateQueries({ queryKey: ["home"] });
          void queryClient.invalidateQueries({ queryKey: ["activity"] });
          void queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          void queryClient.invalidateQueries({ queryKey: ["activity"] });
          void queryClient.invalidateQueries({ queryKey: ["integrations"] });
          toast.error((event.data.message as string) ?? t("failed"), {
            duration: Infinity,
            closeButton: true,
          });
        }
      });
    },
    [queryClient, t],
  );

  const stateFor = (credentialId: number): SyncState =>
    state[credentialId] ?? { syncing: false, stage: "" };

  const anySyncing = Object.values(state).some((s) => s.syncing);

  return { start, stateFor, anySyncing };
}
