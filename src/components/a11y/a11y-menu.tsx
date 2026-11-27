"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Accessibility, RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { useActiveProfileId } from "@/lib/workspace-store";
import {
  A11Y_CLASSES_KEY,
  A11Y_KEY,
  A11Y_TOGGLES,
  DEFAULT_A11Y,
  TEXT_SCALES,
  a11yClasses,
  applyA11yClasses,
  parseA11y,
  type A11yPrefs,
  type Contrast,
  type TextScale,
} from "@/lib/a11y-prefs";

type Ctx = {
  prefs: A11yPrefs;
  set: (patch: Partial<A11yPrefs>) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};
const A11yContext = createContext<Ctx | null>(null);

export function useA11y() {
  const v = useContext(A11yContext);
  if (!v) throw new Error("useA11y requires A11yProvider");
  return v;
}

const profileKey = (id: number | null) => `${A11Y_KEY}.profile${id ?? "default"}`;
function writeLocal(id: number | null, p: A11yPrefs) {
  try {
    localStorage.setItem(profileKey(id), JSON.stringify(p));
    localStorage.setItem(A11Y_CLASSES_KEY, a11yClasses(p).join(" "));
  } catch {
    /* Works without storage; the choice just won't survive a reload. */
  }
}

const noSubscribe = () => () => {}; // read once per render; this provider's own writes go through state

/** Owns the accessibility choices for the active profile and the menu sheet; Alt+A opens it from anywhere. */
export function A11yProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const profileId = useActiveProfileId();
  // undefined: server and hydration render; false: no storage.
  const raw = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(profileKey(profileId));
      } catch {
        return false;
      }
    },
    () => undefined,
  );
  const stored = useMemo(
    () => (raw === undefined || raw === false ? DEFAULT_A11Y : parseA11y(raw)),
    [raw],
  );
  const [own, setOwn] = useState<{ id: number | null; p: A11yPrefs } | null>(null);
  const prefs = own?.id === profileId ? own.p : stored;
  const latest = useRef(prefs); // quick successive changes each build on the last one, not a stale render

  useEffect(() => {
    let live = true;
    loadPreference("a11y")
      .then((v) => {
        if (live && v) {
          const p = parseA11y(v);
          latest.current = p;
          setOwn({ id: profileId, p });
          writeLocal(profileId, p);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [profileId]);

  useEffect(() => {
    latest.current = prefs;
    applyA11yClasses(document.documentElement, prefs);
  }, [prefs]);

  const set = useCallback(
    (patch: Partial<A11yPrefs>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setOwn({ id: profileId, p: next });
      writeLocal(profileId, next);
      void storePreference("a11y", next).catch(() => {}); // local copy already applied; server sync is best effort
    },
    [profileId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.code: the same physical key in Hebrew and English layouts.
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat && e.code === "KeyA") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <A11yContext.Provider value={{ prefs, set, open, setOpen }}>
      {children}
      <A11ySheet />
      {prefs.readingGuide && <ReadingGuide />}
    </A11yContext.Provider>
  );
}

function A11ySheet() {
  const { open, setOpen } = useA11y();
  const t = useTranslations("a11y");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pe-12">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <Accessibility className="size-5" aria-hidden />
            {t("title")}
          </SheetTitle>
          <SheetDescription>{t("intro")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <A11yOptions />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The controls themselves: in the sheet and on Settings › Accessibility. */
export function A11yOptions({ idPrefix = "a11y-sheet" }: { idPrefix?: string }) {
  const { prefs, set } = useA11y();
  const t = useTranslations("a11y");
  const row = "flex min-h-11 items-center justify-between gap-4 py-1";
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("textSize")}</h3>
        <Segmented<TextScale>
          label={t("textSize")}
          value={prefs.textScale}
          onChange={(v) => set({ textScale: v })}
          options={TEXT_SCALES.map((s) => ({ value: s, label: `${s}%` }))}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("contrast")}</h3>
        <Segmented<Contrast>
          label={t("contrast")}
          value={prefs.contrast}
          onChange={(v) => set({ contrast: v })}
          options={[
            { value: "off", label: t("contrastOff") },
            { value: "light", label: t("contrastLight") },
            { value: "dark", label: t("contrastDark") },
          ]}
        />
      </div>
      <div className="divide-y divide-border rounded-2xl bg-card px-4 py-1">
        {A11Y_TOGGLES.map((k) => (
          <div key={k} className={row}>
            <Label htmlFor={`${idPrefix}-${k}`} className="flex-1 text-sm">
              {t(k)}
            </Label>
            <Switch
              id={`${idPrefix}-${k}`}
              checked={prefs[k]}
              onCheckedChange={(on) => set({ [k]: on })}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => set({ ...DEFAULT_A11Y })} className="min-h-11">
          <RotateCcw className="size-4" aria-hidden />
          {t("reset")}
        </Button>
        <Link
          href="/accessibility"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("statement")}
        </Link>
      </div>
    </div>
  );
}

/** A bar that follows the pointer, to keep the eye on one line. Decorative and never in the way of clicks. */
function ReadingGuide() {
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => setY(e.clientY);
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  if (y == null) return null;
  return <div aria-hidden className="a11y-reading-guide" style={{ top: y + 14 }} />;
}
