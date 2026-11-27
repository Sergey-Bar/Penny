"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportSummary } from "@/lib/import/types";

interface Props {
  summary: ImportSummary | null;
  checking: boolean;
  saving: boolean;
  canSave: boolean;
  labels: {
    ready: string;
    duplicates: string;
    possible: string;
    errors: string;
    review: string;
    categorized: string;
    net: string;
    save: (count: number) => string;
    saving: string;
    cancel: string;
    checking: string;
    warnings: string;
  };
  warnings: string[];
  onSave: () => void;
  onCancel: () => void;
}

const money = (n: number) =>
  `₪${Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;

/** The one place that says what will happen if the user presses save. */
export function SummaryBar({
  summary,
  checking,
  saving,
  canSave,
  labels,
  warnings,
  onSave,
  onCancel,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-center sm:grid-cols-6">
        <Cell label={labels.ready} value={summary?.ready ?? 0} />
        <Cell label={labels.duplicates} value={summary?.duplicates ?? 0} />
        <Cell label={labels.possible} value={summary?.possibleDuplicates ?? 0} />
        <Cell label={labels.errors} value={summary?.errors ?? 0} />
        <Cell label={labels.review} value={summary?.needsReview ?? 0} />
        <Cell label={labels.categorized} value={summary?.autoCategorized ?? 0} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-footnote text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5" aria-hidden />
          )}
          {checking ? labels.checking : `${labels.net}: ${money(summary?.net ?? 0)}`}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave || saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="size-4" aria-hidden />
            )}
            {saving ? labels.saving : labels.save(summary?.ready ?? 0)}
          </Button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg bg-[color-mix(in_oklch,var(--status-over)_8%,transparent)] px-3 py-2 text-caption">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <ul className="space-y-0.5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-body font-semibold tabular-nums">{value.toLocaleString("he-IL")}</div>
      <div className="text-caption text-muted-foreground">{label}</div>
    </div>
  );
}
