"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { InstitutionGrid, InstitutionTile } from "@/components/settings/institution-grid";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import {
  INTERACTIVE,
  isPensionFund,
  LOGIN_FIELDS,
  type LoginField,
  type PensionFund,
} from "@/lib/pension";
import { parseSyncError } from "@/lib/sync-errors";
import {
  deletePension,
  getPensionCredentials,
  listPension,
  pensionAction,
  type PensionConnection,
} from "@/lib/api";
import { PensionReportImport } from "./pension-report-import";

function formatSyncTime(ts: string, locale: string): string {
  const iso = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

const FIELD_INPUTS = {
  id: { label: "pensionId", props: { inputMode: "numeric", autoComplete: "off" } },
  phone: { label: "pensionPhone", props: { inputMode: "tel", autoComplete: "tel" } },
  username: { label: "pensionUsername", props: { autoComplete: "username" } },
  password: {
    label: "pensionPassword",
    props: { type: "password", autoComplete: "current-password" },
  },
} as const satisfies Record<LoginField, { label: string; props: object }>;

/** Progress steps the custom scrapers report; the library's own progress text is not shown. */
const STEPS: Partial<
  Record<
    string,
    "pensionStepLogin" | "pensionStepOtp" | "pensionStepBalances" | "pensionStepExport"
  >
> = {
  login: "pensionStepLogin",
  otp: "pensionStepOtp",
  balances: "pensionStepBalances",
  export: "pensionStepExport",
};

/** Investment houses: the wired funds connect and sync balances into assets; the rest are listed as coming soon. */
export function InvestmentHouses({ mode = "all" }: { mode?: "all" | "connected" | "catalog" }) {
  const t = useTranslations("settings.bank");
  const tError = useTranslations("syncErrors");
  // Known sync errors are stored in English; show them in the user's language.
  const errorText = (message: string) => {
    const { key, detail } = parseSyncError(message);
    return key ? [tError(key), detail].filter(Boolean).join(" ") : message;
  };
  const locale = useLocale();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["pension"],
    queryFn: listPension,
    // Poll only while a sync runs or waits for the SMS code.
    refetchInterval: (q) =>
      q.state.data?.connections.some((c) => c.state === "running" || c.state === "otp")
        ? 2000
        : false,
  });
  const [form, setForm] = useState<
    | ({
        connectionId?: number;
        fundId: PensionFund;
        label: string;
        isChild?: boolean;
      } & Record<LoginField, string>)
    | null
  >(null);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<number | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["pension"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
  };
  const act = useMutation({
    mutationFn: pensionAction,
    onSuccess: () => {
      setForm(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("pensionFailed")),
  });
  const connections = list.data?.connections ?? [];
  const editingHouse = form ? INVESTMENT_HOUSES.find((h) => h.id === form.fundId) : null;

  const openEdit = async (c: PensionConnection) => {
    if (!isPensionFund(c.fundId)) return;
    try {
      const res = await getPensionCredentials(c.id);
      const creds = res.connection.credentials;
      setForm({
        connectionId: c.id,
        fundId: c.fundId,
        label: res.connection.label ?? "",
        id: creds.id ?? "",
        phone: creds.phone ?? "",
        username: creds.username ?? "",
        password: creds.password ?? "",
      });
    } catch {
      setForm({
        connectionId: c.id,
        fundId: c.fundId,
        label: c.label ?? "",
        id: "",
        phone: "",
        username: "",
        password: "",
      });
      toast.error(t("pensionFailed"));
    }
  };

  const runningLine = (step: (typeof STEPS)[string]) =>
    step ? `${t("pensionRunning")} (${t(step)})` : t("pensionRunning");
  const statusLine = (c: PensionConnection) =>
    c.state === "running"
      ? runningLine(STEPS[c.message ?? ""])
      : c.state === "error" || (c.state === "idle" && c.lastError)
        ? t("pensionError", { message: errorText(c.message ?? c.lastError ?? "") })
        : c.lastSyncAt
          ? t("lastSync", { time: formatSyncTime(c.lastSyncAt, locale) })
          : t("statusNeverSynced");

  const showConnected = mode === "all" || mode === "connected";
  const showCatalog = mode === "all" || mode === "catalog";

  if (mode === "connected" && connections.length === 0) return null;

  return (
    <section
      aria-labelledby={showCatalog ? "investment-houses" : "investment-houses-connected"}
      className="space-y-3"
    >
      {showCatalog && (
        <div className="mb-2 flex items-center gap-1 px-4">
          <h3 id="investment-houses" className="text-sm font-semibold text-muted-foreground">
            {t("groupInvestment")}
          </h3>
          <InfoTip text={t("investmentNote")} />
        </div>
      )}

      {showConnected && connections.length > 0 && (
        <div className="space-y-2">
          <h3
            id={showCatalog ? undefined : "investment-houses-connected"}
            className="px-4 text-sm font-semibold text-muted-foreground"
          >
            {locale === "he"
              ? `בתי השקעות מחוברים · ${connections.length}`
              : `Connected investment houses · ${connections.length}`}
          </h3>
          <InstitutionGrid>
            {connections.map((c) => {
              const h = INVESTMENT_HOUSES.find((x) => x.id === c.fundId);
              if (!h) return null;
              const houseName = locale === "he" ? h.name.he : h.name.en;
              const title = c.label ? `${houseName} · ${c.label}` : houseName;
              return (
                <InstitutionTile
                  key={c.id}
                  label={title}
                  color={h.color}
                  domain={h.domain}
                  subline={<span role="status">{statusLine(c)}</span>}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={c.state === "running" || c.state === "otp"}
                        onClick={() => act.mutate({ sync: c.id })}
                      >
                        {t("syncShort")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t("connect")} · ${title}`}
                        onClick={() => void openEdit(c)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setConfirmDisconnectId((prev) => (prev === c.id ? null : c.id))
                        }
                      >
                        {t("pensionDisconnect")}
                      </Button>
                    </div>
                    {confirmDisconnectId === c.id && (
                      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/60 p-2 text-xs">
                        <span className="basis-full text-muted-foreground">
                          {locale === "he"
                            ? "למחוק גם את הנכסים המסונכרנים?"
                            : "Delete synced assets too?"}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setConfirmDisconnectId(null);
                            void deletePension(c.id, true).then(refresh);
                          }}
                        >
                          {locale === "he" ? "נתק ומחק נכסים" : "Disconnect & delete"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setConfirmDisconnectId(null);
                            void deletePension(c.id, false).then(refresh);
                          }}
                        >
                          {locale === "he" ? "שמור נכסים" : "Keep assets"}
                        </Button>
                      </div>
                    )}
                    {c.state === "otp" && (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act.mutate({ otp: c.id, code: codes[c.id] ?? "" });
                        }}
                      >
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          autoFocus
                          placeholder={t("pensionCode")}
                          aria-label={t("pensionCode")}
                          value={codes[c.id] ?? ""}
                          onChange={(e) => setCodes({ ...codes, [c.id]: e.target.value })}
                          required
                          className="h-8 min-w-0 flex-1 text-xs"
                        />
                        <Button type="submit" size="sm" className="h-8 shrink-0 px-2.5 text-xs">
                          {t("pensionSend")}
                        </Button>
                      </form>
                    )}
                  </div>
                </InstitutionTile>
              );
            })}
          </InstitutionGrid>
        </div>
      )}

      {showCatalog && (
        <InstitutionGrid>
          {[...INVESTMENT_HOUSES]
            .sort((x, y) =>
              locale === "he"
                ? x.name.he.localeCompare(y.name.he, "he")
                : x.name.en.localeCompare(y.name.en, "en"),
            )
            .map((h) => {
              const name = locale === "he" ? h.name.he : h.name.en;
              const wired = isPensionFund(h.id);
              const count = connections.filter((c) => c.fundId === h.id).length;
              return (
                <InstitutionTile key={h.id} label={name} color={h.color} domain={h.domain}>
                  {!wired ? (
                    <span className="self-start rounded-full bg-muted px-2.5 py-1 text-caption text-muted-foreground">
                      {t("comingSoon")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${t("connect")} · ${name}`}
                      onClick={() => {
                        if (isPensionFund(h.id)) {
                          setForm({
                            fundId: h.id,
                            label: count > 0 ? `#${count + 1}` : "",
                            id: "",
                            phone: "",
                            username: "",
                            password: "",
                          });
                        }
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {t("connect")}
                    </Button>
                  )}
                </InstitutionTile>
              );
            })}
        </InstitutionGrid>
      )}

      <Dialog
        open={Boolean(form && editingHouse)}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        {form && editingHouse && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t("connect")} · {locale === "he" ? editingHouse.name.he : editingHouse.name.en}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {LOGIN_FIELDS[form.fundId].includes("password")
                    ? t("pensionPasswordHint")
                    : INTERACTIVE[form.fundId]
                      ? t("pensionInteractive")
                      : t("pensionOtpHint")}
                </span>
                {editingHouse.domain && (
                  <a
                    href={`https://${editingHouse.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    dir="ltr"
                  >
                    {editingHouse.domain}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = form.label.trim();
                const finalLabel =
                  form.isChild && !trimmed.includes("ילד") && !trimmed.toLowerCase().includes("kid")
                    ? trimmed
                      ? `${trimmed} (${locale === "he" ? "ילד" : "Child"})`
                      : locale === "he"
                        ? "חשבון ילד"
                        : "Child account"
                    : trimmed;
                act.mutate({
                  ...(form.connectionId != null ? { connectionId: form.connectionId } : {}),
                  fundId: form.fundId,
                  label: finalLabel,
                  ...Object.fromEntries(LOGIN_FIELDS[form.fundId].map((f) => [f, form[f]])),
                });
              }}
            >
              <label className="grid gap-1 text-xs font-medium">
                {locale === "he" ? "תווית (אופציונלי)" : "Label (optional)"}
                <Input
                  type="text"
                  placeholder={locale === "he" ? "למשל: שלי / ילד 1" : "e.g. Mine / Kid 1"}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.isChild)}
                  onChange={(e) => setForm({ ...form, isChild: e.target.checked })}
                  className="size-4 rounded border-border accent-primary"
                />
                {locale === "he" ? "חשבון של ילד" : "Child's account"}
              </label>
              {LOGIN_FIELDS[form.fundId].map((f) => (
                <label key={f} className="grid gap-1 text-xs font-medium">
                  {t(FIELD_INPUTS[f].label)}
                  <Input
                    {...FIELD_INPUTS[f].props}
                    value={form[f]}
                    onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                    required
                  />
                </label>
              ))}
              <DialogFooter className="mt-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  {t("pensionCancel")}
                </Button>
                <Button type="submit" disabled={act.isPending}>
                  {t("connect")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {showCatalog && <PensionReportImport />}
    </section>
  );
}
