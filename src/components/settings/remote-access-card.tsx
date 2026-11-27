"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard, StatusChip } from "@/components/settings/section-shell";
import { fetchJSON } from "@/lib/api";
import type { RemoteAccessStatus } from "@/lib/remote-access";

type Mode = RemoteAccessStatus["mode"];

export function RemoteAccessCard() {
  const t = useTranslations("remoteAccess");
  const [status, setStatus] = useState<RemoteAccessStatus | null>(null);
  const [mode, setMode] = useState<Mode>("off");
  const [host, setHost] = useState("");
  const [teamDomain, setTeamDomain] = useState("");
  const [aud, setAud] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJSON<RemoteAccessStatus>("/api/remote-access")
      .then((value) => {
        if (cancelled) return;
        setStatus(value);
        setMode(value.mode);
        setHost(value.host ?? "");
        setTeamDomain(value.teamDomain ?? "");
        setAud(value.aud ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await fetchJSON<RemoteAccessStatus>("/api/remote-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, host, teamDomain, aud }),
      });
      setStatus(next);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("lockRequired"));
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await fetchJSON<RemoteAccessStatus>("/api/remote-access", { method: "DELETE" });
      setStatus(next);
      setMode("off");
      setMessage(t("saved"));
    } catch {
      setMessage(t("lockRequired"));
    } finally {
      setSaving(false);
    }
  }

  if (!status) return null;
  const envManaged = status.source === "env";
  const active = status.mode !== "off";

  return (
    <SettingCard
      title={t("title")}
      description={t("description")}
      aside={<StatusChip on={active} label={active ? t("mode") : t("modeOff")} />}
    >
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-footnote text-muted-foreground">
          <Globe2 className="size-4" aria-hidden />
          {active ? t("active", { host: status.host ?? "" }) : t("inactive")}
        </p>
        {!status.lockEnabled && mode !== "off" && (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive"
            role="alert"
          >
            {t("lockRequired")}
          </p>
        )}
        {envManaged && (
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-footnote">
            {t("envManaged")}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="remote-mode">{t("mode")}</Label>
            <select
              id="remote-mode"
              value={mode}
              disabled={envManaged}
              onChange={(event) => setMode(event.target.value as Mode)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="off">{t("modeOff")}</option>
              <option value="quick">{t("modeQuick")}</option>
              <option value="named">{t("modeNamed")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remote-host">{t("host")}</Label>
            <Input
              id="remote-host"
              value={host}
              disabled={envManaged || mode === "off"}
              onChange={(event) => setHost(event.target.value)}
              placeholder={t("hostHint")}
              dir="ltr"
            />
          </div>
          {mode === "named" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="remote-team">{t("teamDomain")}</Label>
                <Input
                  id="remote-team"
                  value={teamDomain}
                  disabled={envManaged}
                  onChange={(event) => setTeamDomain(event.target.value)}
                  placeholder={t("teamDomainHint")}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remote-aud">{t("aud")}</Label>
                <Input
                  id="remote-aud"
                  value={aud}
                  disabled={envManaged}
                  onChange={(event) => setAud(event.target.value)}
                  dir="ltr"
                />
              </div>
            </>
          )}
        </div>
        {mode === "quick" && (
          <p className="rounded-xl border border-status-heads-up/40 bg-status-heads-up/10 p-3 text-footnote">
            {t("quickWarning")}
          </p>
        )}
        {mode === "named" && (
          <p className="text-footnote text-muted-foreground">{t("namedHelp")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={saving || envManaged}>
            {t("save")}
          </Button>
          <Button variant="ghost" onClick={() => void disable()} disabled={saving || envManaged}>
            {t("disable")}
          </Button>
          {message && (
            <span className="text-footnote text-muted-foreground" role="status">
              {message}
            </span>
          )}
        </div>
      </div>
    </SettingCard>
  );
}
