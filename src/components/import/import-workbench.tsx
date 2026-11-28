"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Undo2 } from "lucide-react";
import { israelToday } from "@/lib/dates";
import { normalizeImportRow } from "@/lib/import/normalize";
import { SourcePicker } from "@/components/import/source-picker";
import { ImportGrid } from "@/components/import/import-grid";
import { SummaryBar } from "@/components/import/summary-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ImportDraftRow,
  ImportMapping,
  ImportSummary,
  NormalizedRow,
  PreviewRow,
  SignConvention,
} from "@/lib/import/types";

interface AccountDto {
  id: number;
  provider: string;
  kind: "bank" | "card" | "other";
  number: string;
  label: string;
  currency: string;
}

interface CategoryDto {
  id: number;
  name: string;
  kind: "expense" | "income";
  color: string | null;
}

interface ParseDto {
  parseId: string;
  format: string;
  file: { name: string; sha256: string; size: number };
  sheetName: string;
  sheets: { name: string; hidden: boolean }[];
  header: { row: number; cells: string[] };
  mapping: ImportMapping;
  signConvention: SignConvention;
  dateOrder: "dmy" | "mdy" | "ymd";
  account: { id: number; label: string; kind: string; provider: string } | null;
  accountHint: { provider: string; kind: "bank" | "card"; label: string } | null;
  balance: { value: number; asOf: string; rowIndex: number } | null;
  rows: { total: number; offset: number; limit: number; page: ImportDraftRow[] };
  warnings: { code: string; detail?: string }[];
  pendingId?: number;
}

interface PreviewDto {
  rows: PreviewRow[];
  summary: ImportSummary;
}

interface BatchDto {
  id: number;
  fileName: string | null;
  accountLabel: string | null;
  status: string;
  added: number;
  duplicates: number;
  errors: number;
  createdAt: string;
  groupId: string | null;
  groupCount: number;
}

interface PendingDto {
  id: number;
  fileName: string;
  reasonCode: string | null;
  size: number;
  status: string;
}

const MAPPING_FIELDS: { key: keyof ImportMapping; label: string }[] = [
  { key: "date", label: "date" },
  { key: "processedDate", label: "processedDate" },
  { key: "description", label: "description" },
  { key: "amount", label: "amount" },
  { key: "debit", label: "debit" },
  { key: "credit", label: "credit" },
  { key: "kind", label: "kind" },
  { key: "memo", label: "memo" },
  { key: "balance", label: "balance" },
  { key: "identifier", label: "identifier" },
  { key: "originalAmount", label: "originalAmount" },
  { key: "originalCurrency", label: "originalCurrency" },
  { key: "installmentNumber", label: "installmentNumber" },
  { key: "installmentTotal", label: "installmentTotal" },
  { key: "accountRaw", label: "accountRaw" },
  { key: "categoryRaw", label: "categoryRaw" },
];

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`) as Error & {
      code?: string;
      batchId?: number;
      status?: number;
    };
    error.code = body?.code;
    error.batchId = (body as { batchId?: number } | null)?.batchId;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

const post = <T,>(url: string, body: unknown) =>
  requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function emptyPreviewSummary(): ImportSummary {
  return {
    ready: 0,
    duplicates: 0,
    possibleDuplicates: 0,
    errors: 0,
    skipped: 0,
    needsReview: 0,
    autoCategorized: 0,
    expenses: 0,
    income: 0,
    transfers: 0,
    net: 0,
    byAccount: [],
  };
}

function addPreviewSummary(target: ImportSummary, source: ImportSummary): void {
  target.ready += source.ready;
  target.duplicates += source.duplicates;
  target.possibleDuplicates += source.possibleDuplicates;
  target.errors += source.errors;
  target.skipped += source.skipped;
  target.needsReview += source.needsReview;
  target.autoCategorized += source.autoCategorized;
  target.expenses += source.expenses;
  target.income += source.income;
  target.transfers += source.transfers;
  target.net += source.net;
  const byAccount = new Map(target.byAccount.map((entry) => [entry.accountId, entry] as const));
  for (const entry of source.byAccount) {
    const existing = byAccount.get(entry.accountId);
    if (existing) {
      existing.count += entry.count;
      existing.net += entry.net;
    } else {
      target.byAccount.push({ ...entry });
    }
  }
}

/** The v2 import workbench: parse, map, edit, preview, save, undo. */
export function ImportWorkbench({ defaultAccountLabel }: { defaultAccountLabel?: string }) {
  const t = useTranslations("importV2");
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [parse, setParse] = useState<ParseDto | null>(null);
  const [drafts, setDrafts] = useState<ImportDraftRow[]>([]);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [dateOrder, setDateOrder] = useState<"dmy" | "mdy" | "ymd">("dmy");
  const [signConvention, setSignConvention] = useState<SignConvention>("bankSigned");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [includePossible, setIncludePossible] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyImported, setAlreadyImported] = useState<number | null>(null);
  const [saved, setSaved] = useState<{
    batchId: number;
    added: number;
    duplicates: number;
    groupId: string | null;
  } | null>(null);
  const [newAccount, setNewAccount] = useState<{
    label: string;
    number: string;
    kind: "bank" | "card" | "other";
  }>({ label: defaultAccountLabel ?? "", number: "", kind: "bank" });
  const [pendingSave, setPendingSave] = useState<{
    groupId: string | null;
    token: string;
    fingerprint: string;
  } | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const parseSequence = useRef(0);
  const previewSequence = useRef(0);

  const accountsQuery = useQuery({
    queryKey: ["import-v2-accounts"],
    queryFn: () => requestJson<{ accounts: AccountDto[] }>("/api/import/accounts"),
  });
  const metaQuery = useQuery({
    queryKey: ["import-v2-meta"],
    queryFn: () =>
      requestJson<{
        accounts: { accountNumber: string; label: string | null }[];
        categories: CategoryDto[];
        members: { id: string }[];
      }>("/api/import/sheet"),
  });
  const historyQuery = useQuery({
    queryKey: ["import-v2-batches"],
    queryFn: () => requestJson<{ batches: BatchDto[] }>("/api/import/batches"),
  });
  const pendingQuery = useQuery({
    queryKey: ["import-v2-pending"],
    queryFn: () => requestJson<{ files: PendingDto[] }>("/api/import/pending"),
  });

  const accounts = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);
  const categories = useMemo(() => metaQuery.data?.categories ?? [], [metaQuery.data]);
  const effectiveAccountId =
    accountId ??
    parse?.account?.id ??
    (defaultAccountLabel
      ? accounts.find(
          (candidate) => candidate.label.toLowerCase() === defaultAccountLabel.toLowerCase(),
        )?.id
      : undefined) ??
    accounts[0]?.id ??
    null;
  const account = accounts.find((candidate) => candidate.id === effectiveAccountId) ?? null;

  const parseError = useCallback(
    (cause: unknown) => {
      const code = (cause as { code?: string } | null)?.code;
      let label: string | null = null;
      if (code) {
        try {
          label = t(`errors.${code}`);
        } catch {
          label = code;
        }
      }
      setError(label || (cause instanceof Error ? cause.message : t("errors.generic")));
    },
    [t],
  );

  const loadAll = useCallback(async (result: ParseDto): Promise<ImportDraftRow[]> => {
    const rows = [...result.rows.page];
    let offset = rows.length;
    while (offset < result.rows.total) {
      const page = await requestJson<{ rows: { page: ImportDraftRow[] } }>(
        `/api/import/parse/${result.parseId}?offset=${offset}&limit=1000`,
      );
      if (page.rows.page.length === 0) break;
      rows.push(...page.rows.page);
      offset += page.rows.page.length;
    }
    return rows;
  }, []);

  const applyParse = useCallback(
    async (result: ParseDto, pending: number | null, isCurrent: () => boolean) => {
      const allDrafts = await loadAll(result);
      if (!isCurrent()) return;
      setParse(result);
      setMapping(result.mapping);
      setDateOrder(result.dateOrder);
      setSignConvention(result.signConvention);
      setPendingId(pending);
      setDrafts(allDrafts);
      setPreview(null);
      setAlreadyImported(null);
      if (result.accountHint) {
        setNewAccount((current) =>
          current.label
            ? current
            : { label: result.accountHint!.label, number: "", kind: result.accountHint!.kind },
        );
      }
      setAccountId((current) => current ?? result.account?.id ?? null);
    },
    [loadAll],
  );

  const parseSource = useCallback(
    async (
      source: { file?: File; text?: string; name?: string; pending?: number; displayName?: string },
      options: Record<string, unknown> = {},
    ) => {
      const request = ++parseSequence.current;
      const isCurrent = () => request === parseSequence.current;
      setParsing(true);
      setError(null);
      try {
        if (source.pending != null) {
          setSourceText(null);
          setSourceName(null);
          setDocumentName(null);
          const result = await post<ParseDto>(`/api/import/pending/${source.pending}`, {
            action: "open",
            ...options,
          });
          if (!isCurrent()) return;
          await applyParse(result, source.pending, isCurrent);
        } else if (source.file) {
          setSourceText(null);
          setSourceName(null);
          setDocumentName(null);
          const form = new FormData();
          form.append("file", source.file);
          form.append("options", JSON.stringify({ limit: 1000, ...options }));
          const result = await requestJson<ParseDto>("/api/import/parse", {
            method: "POST",
            body: form,
          });
          if (!isCurrent()) return;
          await applyParse(result, null, isCurrent);
        } else if (source.text) {
          setSourceText(source.text);
          setSourceName(source.name ?? source.displayName ?? "הודבק.csv");
          setDocumentName(source.displayName ?? null);
          const virtual = new File([source.text], source.name ?? "הודבק.csv", {
            type: "text/plain",
          });
          const form = new FormData();
          form.append("file", virtual);
          form.append("options", JSON.stringify({ limit: 1000, ...options }));
          const result = await requestJson<ParseDto>("/api/import/parse", {
            method: "POST",
            body: form,
          });
          if (!isCurrent()) return;
          await applyParse(result, null, isCurrent);
        }
      } catch (cause) {
        if (isCurrent()) parseError(cause);
      } finally {
        if (isCurrent()) setParsing(false);
      }
    },
    [applyParse, parseError],
  );

  const importDocument = async (file: File) => {
    setParsing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const document = await requestJson<{
        rows: { date: string; description: string; amount: number }[];
      }>("/api/import/document", { method: "POST", body: form });
      if (!document.rows || document.rows.length === 0)
        throw Object.assign(new Error("no rows"), { code: "noRows" });
      const lines = [
        "date\tdescription\tamount",
        ...document.rows.map(
          (row) => `${row.date}\t${row.description.replace(/\t/g, " ")}\t${row.amount}`,
        ),
      ];
      await parseSource({
        text: lines.join("\n"),
        name: file.name.replace(/\.[^.]+$/, ".csv"),
        displayName: file.name,
      });
    } catch (cause) {
      parseError(cause);
    } finally {
      setParsing(false);
    }
  };

  const reparse = (patch: Record<string, unknown> = {}) => {
    const options = {
      sheetName: parse?.sheetName ?? undefined,
      headerRow: parse?.header.row ?? undefined,
      mapping: mapping ?? undefined,
      dateOrder,
      signConvention,
      accountId,
      ...patch,
    };
    if (file) void parseSource({ file }, options);
    else if (pendingId != null) void parseSource({ pending: pendingId }, options);
    else if (sourceText)
      void parseSource(
        {
          text: sourceText,
          name: sourceName ?? undefined,
          displayName: documentName ?? undefined,
        },
        options,
      );
    else if (pasteText) void parseSource({ text: pasteText }, options);
  };

  const { normalized, localErrors } = useMemo<{
    normalized: NormalizedRow[];
    localErrors: PreviewRow[];
  }>(() => {
    if (!account) return { normalized: [], localErrors: [] };
    const accountsById = new Map(accounts.map((candidate) => [candidate.id, candidate] as const));
    const rows: NormalizedRow[] = [];
    const errors: PreviewRow[] = [];
    for (const row of drafts) {
      if (!row.include) continue;
      const rowAccount = accountsById.get(row.accountId ?? account.id) ?? account;
      const result = normalizeImportRow(
        { ...row, accountId: rowAccount.id },
        {
          dateOrder,
          signConvention,
          accountKind: rowAccount.kind,
          accountId: rowAccount.id,
          accountCurrency: rowAccount.currency,
          today: israelToday(),
          hasCardCoverage: accounts.some((candidate) => candidate.kind === "card"),
          hasTransferPair: false,
        },
      );
      if (result.row) {
        rows.push(result.row);
        continue;
      }
      // A row the normalizer rejects must not look "valid" in the grid just because the server
      // preview never saw it.
      const code = result.reasons.find((reason) =>
        [
          "dateMissing",
          "dateInvalid",
          "amountMissing",
          "amountInvalid",
          "amountZero",
          "amountRange",
        ].includes(reason.code),
      )?.code;
      errors.push({
        rowIndex: row.rowIndex,
        status: "error",
        code: code ?? result.reasons[0]?.code ?? null,
        kind: row.kind === "income" ? "income" : row.kind === "transfer" ? "transfer" : "expense",
        kindSource: "default",
        categoryId: null,
        categorySource: null,
        confidence: 0,
        reasons: result.reasons,
      });
    }
    return { normalized: rows, localErrors: errors };
  }, [drafts, account, accounts, dateOrder, signConvention]);

  useEffect(() => {
    let cancelled = false;
    const request = ++previewSequence.current;
    const isCurrent = () => !cancelled && request === previewSequence.current;
    const runPreview = async () => {
      if (!account || (normalized.length === 0 && localErrors.length === 0)) {
        if (isCurrent()) {
          setPreview(null);
          setChecking(false);
        }
        return;
      }
      if (isCurrent()) setChecking(true);
      try {
        const groups = new Map<number, NormalizedRow[]>();
        for (const row of normalized) {
          const list = groups.get(row.accountId) ?? [];
          list.push(row);
          groups.set(row.accountId, list);
        }
        const rows: PreviewRow[] = [...localErrors];
        const summary = emptyPreviewSummary();
        summary.errors += localErrors.length;
        for (const [groupId, groupRows] of groups) {
          for (let offset = 0; offset < groupRows.length; offset += 5000) {
            const result = await post<PreviewDto>("/api/import/preview", {
              accountId: groupId,
              rows: groupRows.slice(offset, offset + 5000),
            });
            if (!isCurrent()) return;
            rows.push(...result.rows);
            addPreviewSummary(summary, result.summary);
          }
        }
        if (isCurrent()) setPreview({ rows, summary });
      } catch (cause) {
        if (isCurrent()) parseError(cause);
      } finally {
        if (isCurrent()) setChecking(false);
      }
    };
    const timer = setTimeout(() => {
      void runPreview();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // parseError is stable; the serialized rows make this one dependency for 5000-row grids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(normalized), JSON.stringify(localErrors), account?.id]);

  const previewMap = useMemo(() => {
    const map = new Map((preview?.rows ?? []).map((row) => [row.rowIndex, row]));
    // Show a local normalization failure immediately, before the debounced server preview.
    for (const error of localErrors) if (!map.has(error.rowIndex)) map.set(error.rowIndex, error);
    return map;
  }, [preview, localErrors]);

  const updateRow = (index: number, patch: Partial<ImportDraftRow>) =>
    setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index: number) =>
    setDrafts((current) => current.filter((_, i) => i !== index));

  const createAccount = async () => {
    if (!newAccount.label.trim()) return;
    try {
      const result = await post<{ account: AccountDto }>("/api/import/accounts", {
        action: "create",
        provider: "file",
        kind: newAccount.kind,
        label: newAccount.label.trim(),
        number: newAccount.number.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["import-v2-accounts"] });
      setAccountId(result.account.id);
      setNewAccount({ label: "", number: "", kind: "bank" });
      setShowNewAccount(false);
    } catch (cause) {
      parseError(cause);
    }
  };

  const doSave = async (force = false) => {
    if (!account || normalized.length === 0) return;
    setSaving(true);
    setError(null);
    const fingerprint = JSON.stringify({ rows: normalized, includePossible });
    if (pendingSave && pendingSave.fingerprint !== fingerprint) {
      parseError(new Error(t("partialEditBlocked")));
      setSaving(false);
      return;
    }
    try {
      const chunkSize = 5000;
      const groups = new Map<number, NormalizedRow[]>();
      for (const row of normalized) {
        const list = groups.get(row.accountId) ?? [];
        list.push(row);
        groups.set(row.accountId, list);
      }
      const needsGroup = normalized.length > chunkSize || groups.size > 1;
      const groupId = pendingSave?.groupId ?? (needsGroup ? `g_${crypto.randomUUID()}` : null);
      const token = pendingSave?.token ?? crypto.randomUUID();
      // Keep the same token and group across a retry so already-committed chunks replay instead
      // of becoming a second batch.
      setPendingSave({ groupId, token, fingerprint });
      let firstBatch = 0;
      let added = 0;
      let duplicates = 0;
      let chunkIndex = 0;
      for (const [targetAccountId, groupRows] of groups) {
        for (let offset = 0; offset < groupRows.length; offset += chunkSize) {
          const chunk = groupRows.slice(offset, offset + chunkSize);
          const hasStatementBalance = offset === 0 && targetAccountId === parse?.account?.id;
          const result = await post<{ batchId: number; added: number; duplicates: number }>(
            "/api/import/save",
            {
              accountId: targetAccountId,
              origin: pendingId != null ? "folder" : pasteText ? "paste" : "upload",
              rows: chunk,
              fileName: parse?.file.name ?? file?.name ?? null,
              fileSha256: offset === 0 ? (parse?.file.sha256 ?? null) : null,
              fileSize: parse?.file.size ?? file?.size ?? null,
              sourceFormat: parse?.format ?? null,
              balance: hasStatementBalance ? parse?.balance : undefined,
              mapping,
              header: parse?.header.cells,
              parseId: null,
              pendingId: null,
              clientToken: `${token}-${targetAccountId}-${offset / chunkSize}`,
              groupId,
              chunkIndex,
              includePossible,
              force,
            },
          );
          chunkIndex++;
          if (firstBatch === 0) firstBatch = result.batchId;
          added += result.added;
          duplicates += result.duplicates;
        }
      }
      // A fully successful save finishes the pending file once, after every account/chunk.
      if (pendingId != null) {
        await post(`/api/import/pending/${pendingId}`, { action: "finish" }).catch(() => null);
      }
      const result = { batchId: firstBatch, added, duplicates };
      for (const key of [
        "transactions",
        "summary",
        "home",
        "import-v2-batches",
        "import-v2-pending",
        "import-v2-accounts",
      ])
        void queryClient.invalidateQueries({ queryKey: [key] });
      setSaved({ ...result, groupId });
      setParse(null);
      setDrafts([]);
      setFile(null);
      setPasteText("");
      setSourceText(null);
      setSourceName(null);
      setDocumentName(null);
      setPendingId(null);
      setPreview(null);
      setPendingSave(null);
      toast.success(t("savedToast", { added: result.added, duplicates: result.duplicates }));
    } catch (cause) {
      const coded = cause as { code?: string; batchId?: number };
      if (coded.code === "alreadyImported" && coded.batchId) setAlreadyImported(coded.batchId);
      else parseError(cause);
    } finally {
      setSaving(false);
    }
  };

  const undo = async (batchId: number, groupId?: string | null) => {
    try {
      const result = groupId
        ? await requestJson<{ removed: number }>(
            `/api/import/group/${encodeURIComponent(groupId)}?confirm=1`,
            { method: "DELETE" },
          )
        : await requestJson<{ removed: number }>(`/api/import/batch/${batchId}?confirm=1`, {
            method: "DELETE",
          });
      toast.success(t("undoneToast", { count: result.removed }));
      for (const key of ["transactions", "summary", "home", "import-v2-batches"])
        void queryClient.invalidateQueries({ queryKey: [key] });
      setSaved(null);
    } catch (cause) {
      parseError(cause);
    }
  };

  const reason = (code?: string) => {
    if (!code) return "";
    try {
      return t(`reasons.${code}`);
    } catch {
      return code;
    }
  };

  const warnings = [
    ...(parse?.warnings ?? []).map((warning) => reason(warning.code)),
    ...(alreadyImported ? [t("alreadyImported")] : []),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {!parse && (
        <>
          <SourcePicker
            busy={parsing}
            onFile={(next) => {
              setFile(next);
              setPasteText("");
              void parseSource({ file: next });
            }}
            onDocument={(next) => void importDocument(next)}
            onPaste={(text) => {
              setPasteText(text);
              setFile(null);
              void parseSource({ text });
            }}
            labels={{
              title: t("source.title"),
              drop: t("source.drop"),
              hint: t("source.hint"),
              paste: t("source.paste"),
              pastePlaceholder: t("source.pastePlaceholder"),
              continue: t("source.continue"),
              reading: t("source.reading"),
              pdf: t("source.pdf"),
              change: t("source.change"),
            }}
          />
          {pendingQuery.data?.files.length ? (
            <div className="rounded-xl border">
              <div className="border-b px-3 py-2 text-footnote font-medium">
                {t("pending.title")}
              </div>
              <ul className="divide-y">
                {pendingQuery.data.files.map((pendingFile) => (
                  <li
                    key={pendingFile.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-footnote">{pendingFile.fileName}</div>
                      <div className="text-caption text-muted-foreground">
                        {reason(pendingFile.reasonCode ?? "pendingRow")}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void parseSource({ pending: pendingFile.id })}
                      >
                        {t("pending.open")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await post(`/api/import/pending/${pendingFile.id}`, {
                            action: "retry",
                          }).catch(() => null);
                          void queryClient.invalidateQueries({ queryKey: ["import-v2-pending"] });
                        }}
                      >
                        {t("pending.retry")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {parse && mapping && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2">
            <div className="min-w-0 text-footnote">
              <span className="font-medium">{documentName ?? parse.file.name}</span>
              <span className="ms-2 text-muted-foreground">
                {t("mapping.rows", { count: drafts.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => reparse()}>
                <RotateCcw className="size-3.5" aria-hidden />
                {t("mapping.reapply")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setParse(null);
                  setDrafts([]);
                  setPreview(null);
                  setFile(null);
                  setPasteText("");
                  setSourceText(null);
                  setSourceName(null);
                  setDocumentName(null);
                  setPendingId(null);
                  setPendingSave(null);
                }}
              >
                {t("mapping.cancel")}
              </Button>
            </div>
          </div>

          <details className="rounded-xl border">
            <summary className="cursor-pointer px-3 py-2 text-footnote font-medium text-muted-foreground">
              {t("mapping.title")}
            </summary>
            <div className="space-y-3 border-t p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {parse.sheets.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>{t("mapping.sheet")}</Label>
                    <select
                      value={parse.sheetName}
                      onChange={(event) =>
                        reparse({ sheetName: event.target.value, mapping: null })
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      {parse.sheets.map((sheet) => (
                        <option key={sheet.name} value={sheet.name}>
                          {sheet.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="import-header-row">{t("mapping.headerRow")}</Label>
                  <Input
                    id="import-header-row"
                    type="number"
                    min={1}
                    defaultValue={parse.header.row + 1}
                    onBlur={(event) =>
                      reparse({ headerRow: Math.max(0, Number(event.target.value) - 1) })
                    }
                    className="h-9"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("mapping.dateOrder")}</Label>
                  <select
                    value={dateOrder}
                    onChange={(event) => setDateOrder(event.target.value as "dmy" | "mdy" | "ymd")}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-footnote"
                  >
                    <option value="dmy">{t("mapping.dmy")}</option>
                    <option value="mdy">{t("mapping.mdy")}</option>
                    <option value="ymd">{t("mapping.ymd")}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("mapping.sign")}</Label>
                  <select
                    value={signConvention}
                    onChange={(event) => setSignConvention(event.target.value as SignConvention)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-footnote"
                  >
                    <option value="bankSigned">{t("mapping.bankSigned")}</option>
                    <option value="cardPositive">{t("mapping.cardPositive")}</option>
                    <option value="cardNegative">{t("mapping.cardNegative")}</option>
                    <option value="explicit">{t("mapping.explicit")}</option>
                    <option value="unknown">{t("mapping.unknown")}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("mapping.account")}</Label>
                  <div className="flex gap-1">
                    <select
                      value={effectiveAccountId ?? ""}
                      onChange={(event) =>
                        setAccountId(event.target.value ? Number(event.target.value) : null)
                      }
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="">{t("mapping.none")}</option>
                      {accounts.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("mapping.createAccount")}
                      onClick={() => setShowNewAccount((value) => !value)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>

              {(accounts.length === 0 || showNewAccount) && (
                <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-4">
                  <Input
                    placeholder={t("mapping.accountLabel")}
                    value={newAccount.label}
                    onChange={(event) =>
                      setNewAccount((current) => ({ ...current, label: event.target.value }))
                    }
                    className="h-9"
                  />
                  <Input
                    placeholder={t("mapping.accountNumber")}
                    value={newAccount.number}
                    onChange={(event) =>
                      setNewAccount((current) => ({ ...current, number: event.target.value }))
                    }
                    className="h-9"
                    dir="ltr"
                  />
                  <select
                    value={newAccount.kind}
                    onChange={(event) =>
                      setNewAccount((current) => ({
                        ...current,
                        kind: event.target.value as "bank" | "card" | "other",
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-footnote"
                  >
                    <option value="bank">{t("kinds.bank")}</option>
                    <option value="card">{t("kinds.card")}</option>
                    <option value="other">{t("kinds.other")}</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void createAccount()}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {t("mapping.createAccount")}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MAPPING_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{t(`mapping.fields.${field.label}`)}</Label>
                    <select
                      value={mapping[field.key] == null ? "" : String(mapping[field.key])}
                      onChange={(event) => {
                        const value = event.target.value === "" ? null : Number(event.target.value);
                        setMapping((current) =>
                          current ? { ...current, [field.key]: value } : current,
                        );
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="">{t("mapping.none")}</option>
                      {parse.header.cells.map((cell, index) => (
                        <option key={index} value={index}>
                          {cell || `#${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => reparse({ mapping })}>
                  {t("mapping.apply")}
                </Button>
              </div>
            </div>
          </details>

          {account && (
            <ImportGrid
              key={parse.parseId}
              drafts={drafts}
              preview={previewMap}
              accounts={accounts}
              categories={categories}
              members={metaQuery.data?.members ?? []}
              onChange={updateRow}
              onRemove={removeRow}
              labels={{
                include: t("grid.include"),
                date: t("mapping.fields.date"),
                description: t("mapping.fields.description"),
                amount: t("mapping.fields.amount"),
                kind: t("mapping.fields.kind"),
                account: t("mapping.account"),
                category: t("grid.category"),
                memo: t("mapping.fields.memo"),
                owner: t("grid.owner"),
                business: t("grid.business"),
                tags: t("grid.tags"),
                remove: t("grid.remove"),
                page: (page, pages) => t("grid.page", { page, pages }),
                prev: t("grid.prev"),
                next: t("grid.next"),
                status: (status, code) => (code ? reason(code) : t(`status.${status}`)),
                kinds: {
                  auto: t("kinds.auto"),
                  expense: t("kinds.expense"),
                  income: t("kinds.income"),
                  transfer: t("kinds.transfer"),
                  refund: t("kinds.refund"),
                },
                none: t("mapping.none"),
                shared: t("grid.shared"),
              }}
            />
          )}

          {!account && (
            <p className="rounded-xl bg-muted/40 px-3 py-2 text-footnote">
              {t("mapping.accountRequired")}
            </p>
          )}

          <label className="flex items-center gap-2 text-caption text-muted-foreground">
            <input
              type="checkbox"
              checked={includePossible}
              onChange={(event) => setIncludePossible(event.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            {t("summary.includePossible")}
          </label>
          <SummaryBar
            summary={preview?.summary ?? null}
            checking={checking}
            saving={saving}
            canSave={!!account && normalized.length > 0 && !checking}
            warnings={warnings}
            onSave={() => void doSave()}
            onCancel={() => {
              if (alreadyImported) void doSave(true);
              else {
                setParse(null);
                setDrafts([]);
                setPreview(null);
                setFile(null);
                setPasteText("");
                setSourceText(null);
                setSourceName(null);
                setDocumentName(null);
                setPendingId(null);
                setPendingSave(null);
              }
            }}
            labels={{
              ready: t("summary.ready"),
              duplicates: t("summary.duplicates"),
              possible: t("summary.possible"),
              errors: t("summary.errors"),
              review: t("summary.review"),
              categorized: t("summary.categorized"),
              net: t("summary.net"),
              save: (count) => t("summary.save", { count }),
              saving: t("summary.saving"),
              cancel: alreadyImported ? t("alreadyImportedForce") : t("summary.cancel"),
              checking: t("summary.checking"),
              warnings: t("summary.warnings"),
            }}
          />

          {alreadyImported != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[color-mix(in_oklch,var(--status-over)_8%,transparent)] px-3 py-2 text-footnote">
              <span>{t("alreadyImported")}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void undo(alreadyImported)}
              >
                <Undo2 className="size-3.5" aria-hidden />
                {t("undoExisting")}
              </Button>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-muted/50 px-3 py-2 text-footnote" role="status">
              {error}
            </p>
          )}
        </div>
      )}

      {saved && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 text-footnote">
          <span>{t("savedSummary", { added: saved.added, duplicates: saved.duplicates })}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSaved(null)}>
              {t("savedDone")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void undo(saved.batchId, saved.groupId)}
            >
              <Undo2 className="size-3.5" aria-hidden />
              {t("undo")}
            </Button>
          </div>
        </div>
      )}

      {error && !parse && (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-footnote" role="status">
          {error}
        </p>
      )}

      <details className="rounded-xl border" open={false}>
        <summary className="cursor-pointer px-3 py-2 text-footnote font-medium text-muted-foreground">
          {t("history.title")}
        </summary>
        <div className="border-t">
          {historyQuery.isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-footnote text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("history.loading")}
            </div>
          ) : (
            <ul className="divide-y">
              {(historyQuery.data?.batches ?? []).map((batch) => (
                <li
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-footnote" dir="auto">
                      {batch.fileName || t("history.noFile")}
                    </div>
                    <div className="text-caption text-muted-foreground">
                      {t("history.row", {
                        date: batch.createdAt.slice(0, 10),
                        account: batch.accountLabel || "—",
                        added: batch.added,
                        duplicates: batch.duplicates,
                        errors: batch.errors,
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-muted-foreground">
                      {t(`status.${batch.status}`)}
                    </span>
                    {batch.status !== "undone" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void undo(batch.id, batch.groupCount > 1 ? batch.groupId : null)
                        }
                      >
                        {batch.groupCount > 1 ? t("history.undoGroup") : t("history.undo")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {(historyQuery.data?.batches ?? []).length === 0 && (
                <li className="px-3 py-3 text-footnote text-muted-foreground">
                  {t("history.empty")}
                </li>
              )}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
