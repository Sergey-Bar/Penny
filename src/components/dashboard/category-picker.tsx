"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { buildPickerSections, type PickerSection, type PickerView } from "@/lib/category-tree";
import { translateCategoryName } from "@/lib/i18n-data";
import { getActiveProfileIdSync } from "@/lib/workspace-store";
import type { Category } from "@/lib/types";

const VIEWS: PickerView[] = ["groups", "color", "az"];
const viewKey = () => `penny.categoryPickerView.${getActiveProfileIdSync() ?? "default"}`;

function readView(): PickerView {
  try {
    const v = window.localStorage.getItem(viewKey()) as PickerView | null;
    return v && VIEWS.includes(v) ? v : "groups";
  } catch {
    return "groups";
  }
}

/**
 * View (groups / color / A-Z, remembered per profile) + search over categories, shared by
 * the row picker and the /transactions category filter. Call `onOpenChange` from the popover.
 */
export function useCategoryBrowser(categories: Category[]) {
  const tCat = useTranslations("categoriesSeeded");
  const [view, setView] = useState<PickerView>("groups");
  const [query, setQuery] = useState("");
  const label = (c: Category) => translateCategoryName(c.name, tCat);
  const sections = useMemo(() => {
    // Built inside the memo: `label` closes over tCat, which is the real dependency.
    const translate = (c: Category) => translateCategoryName(c.name, tCat);
    return buildPickerSections(categories, view, query, translate);
  }, [categories, view, query, tCat]);
  const changeView = (v: PickerView) => {
    setView(v);
    try {
      window.localStorage.setItem(viewKey(), v);
    } catch {
      /* the choice still applies now */
    }
  };
  const onOpenChange = (next: boolean) => {
    if (next) setView(readView());
    else setQuery("");
  };
  return { view, changeView, query, setQuery, sections, label, onOpenChange };
}

/** Up/Down move between options (and from the search box into the list). */
export function categoryListKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if ((e.target as HTMLElement).closest('[role="radiogroup"]')) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-cat-option]")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = items[e.key === "ArrowDown" ? Math.min(i + 1, items.length - 1) : i - 1];
  e.preventDefault();
  (next ?? e.currentTarget.querySelector<HTMLElement>("input"))?.focus();
}

/** The view switch and search box. */
export function CategoryBrowserHeader({
  browser,
  listId,
}: {
  browser: ReturnType<typeof useCategoryBrowser>;
  listId: string;
}) {
  const t = useTranslations("categoryPicker");
  return (
    <>
      <Segmented
        label={t("view")}
        value={browser.view}
        onChange={browser.changeView}
        options={VIEWS.map((v) => ({ value: v, label: t(v) }))}
      />
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          value={browser.query}
          onChange={(e) => browser.setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          aria-controls={listId}
          className="ps-8"
        />
      </div>
    </>
  );
}

/** Sections of categories; `renderTitle` lets a caller make a group's title choosable. */
export function CategorySectionList({
  browser,
  listId,
  className,
  renderItem,
  renderTitle,
}: {
  browser: ReturnType<typeof useCategoryBrowser>;
  listId: string;
  className?: string;
  renderItem: (c: Category, indented: boolean) => ReactNode;
  renderTitle?: (s: PickerSection) => ReactNode;
}) {
  const t = useTranslations("categoryPicker");
  const { sections, view } = browser;
  return (
    <div
      id={listId}
      className={className ?? "overflow-y-auto overscroll-contain"}
      aria-live="polite"
    >
      {sections.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : (
        sections.map((s) => (
          <div
            key={s.key}
            role="group"
            aria-label={s.title ?? (s.key === "other" ? t("other") : t("colorGroup"))}
            className="py-1"
          >
            {s.title && renderTitle ? (
              renderTitle(s)
            ) : s.title || s.key === "other" ? (
              <div
                aria-hidden
                className="flex items-center gap-2 px-2 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground"
              >
                {s.color ? (
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                ) : null}
                {s.title ?? t("other")}
              </div>
            ) : view === "color" ? (
              <div
                aria-hidden
                className="mx-2 my-1 h-1 rounded-full"
                style={{ backgroundColor: s.color }}
              />
            ) : null}
            {s.items.map((c) => renderItem(c, view === "groups" && !!s.title))}
          </div>
        ))
      )}
    </div>
  );
}

/** Choose or change a transaction's category: by group, by color or A-Z, with search. */
export function CategoryPicker({
  categories,
  currentId,
  disabled,
  trigger,
  onSelect,
  onCreate,
  createLabel,
}: {
  categories: Category[];
  currentId: number | null;
  disabled?: boolean;
  trigger: ReactNode;
  onSelect: (id: number) => void;
  onCreate: () => void;
  createLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const browser = useCategoryBrowser(categories);
  const listId = useId();
  const onOpenChange = (next: boolean) => {
    browser.onOpenChange(next);
    setOpen(next);
  };
  const choose = (id: number) => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="tap-target inline-flex min-w-0 max-w-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        disabled={disabled}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[360px] flex-col gap-2 overflow-hidden p-2"
        onKeyDown={categoryListKeyDown}
      >
        <CategoryBrowserHeader browser={browser} listId={listId} />
        <CategorySectionList
          browser={browser}
          listId={listId}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          renderItem={(c, indented) => (
            <button
              key={c.id}
              type="button"
              data-cat-option
              aria-pressed={c.id === currentId}
              onClick={() => choose(c.id)}
              className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${indented ? "ps-5" : ""} ${c.id === currentId ? "font-semibold" : ""}`}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="truncate" title={browser.label(c)}>
                {browser.label(c)}
              </span>
            </button>
          )}
        />
        <button
          type="button"
          data-cat-option
          onClick={() => {
            setOpen(false);
            onCreate();
          }}
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border-t border-border px-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Plus aria-hidden className="size-3.5" />
          {createLabel}
        </button>
      </PopoverContent>
    </Popover>
  );
}
