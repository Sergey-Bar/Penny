"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportDraftRow, PreviewRow } from "@/lib/import/types";

interface AccountOption {
  id: number;
  label: string;
  kind: "bank" | "card" | "other";
}

interface CategoryOption {
  id: number;
  name: string;
  kind: "expense" | "income";
  color?: string | null;
}

interface Props {
  drafts: ImportDraftRow[];
  preview: Map<number, PreviewRow>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  members: { id: string; name?: string }[];
  labels: {
    include: string;
    date: string;
    description: string;
    amount: string;
    kind: string;
    account: string;
    category: string;
    memo: string;
    owner: string;
    business: string;
    tags: string;
    remove: string;
    page: (page: number, pages: number) => string;
    prev: string;
    next: string;
    status: (status: string, reason?: string) => string;
    kinds: { auto: string; expense: string; income: string; transfer: string; refund: string };
    none: string;
    shared: string;
  };
  onChange: (index: number, patch: Partial<ImportDraftRow>) => void;
  onRemove: (index: number) => void;
}

const PAGE = 100;

/** The editable grid: one row per movement, with include, kind, account, category, owner and tags. */
export function ImportGrid({
  drafts,
  preview,
  accounts,
  categories,
  members,
  labels,
  onChange,
  onRemove,
}: Props) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(drafts.length / PAGE));
  const currentPage = Math.min(page, pages - 1);
  const visible = useMemo(
    () =>
      drafts
        .map((draft, index) => ({ draft, index }))
        .slice(currentPage * PAGE, currentPage * PAGE + PAGE),
    [drafts, currentPage],
  );

  const categoriesFor = (kind: string) =>
    categories.filter((category) =>
      kind === "income"
        ? category.kind === "income"
        : kind === "expense"
          ? category.kind === "expense"
          : true,
    );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1100px] text-footnote">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" scope="col">
                <span className="sr-only">{labels.include}</span>
              </th>
              <th className="px-2 py-2 text-start font-medium">{labels.date}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.description}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.amount}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.kind}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.account}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.category}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.memo}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.owner}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.business}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.tags}</th>
              <th className="w-16 px-2 py-2 text-start font-medium">—</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ draft, index }) => {
              const outcome = preview.get(draft.rowIndex);
              const status = outcome?.status ?? (draft.include ? "valid" : "skipped");
              return (
                <tr key={`${draft.rowIndex}-${index}`} className="border-t align-top">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={draft.include}
                      aria-label={labels.include}
                      onChange={(event) => onChange(index, { include: event.target.checked })}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={draft.date}
                      aria-label={labels.date}
                      onChange={(event) => onChange(index, { date: event.target.value })}
                      className="h-8 w-28 px-2"
                      dir="ltr"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={draft.description}
                      aria-label={labels.description}
                      onChange={(event) => onChange(index, { description: event.target.value })}
                      className="h-8 min-w-48 px-2"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={draft.amount}
                      aria-label={labels.amount}
                      onChange={(event) =>
                        onChange(index, {
                          amount: event.target.value,
                          debit: null,
                          credit: null,
                        })
                      }
                      className="h-8 w-24 px-2 text-end tabular-nums"
                      dir="ltr"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      aria-label={labels.kind}
                      value={draft.kind}
                      onChange={(event) =>
                        onChange(index, { kind: event.target.value as ImportDraftRow["kind"] })
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="auto">{labels.kinds.auto}</option>
                      <option value="expense">{labels.kinds.expense}</option>
                      <option value="income">{labels.kinds.income}</option>
                      <option value="transfer">{labels.kinds.transfer}</option>
                      <option value="refund">{labels.kinds.refund}</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      aria-label={labels.account}
                      value={draft.accountId ?? ""}
                      onChange={(event) =>
                        onChange(index, {
                          accountId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      className="h-8 max-w-40 rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="">{labels.none}</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      aria-label={labels.category}
                      value={draft.categoryId ?? ""}
                      onChange={(event) =>
                        onChange(index, {
                          categoryId: event.target.value ? Number(event.target.value) : null,
                          categoryName: event.target.selectedOptions[0]?.text ?? null,
                        })
                      }
                      className="h-8 max-w-44 rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="">{labels.none}</option>
                      {categoriesFor(draft.kind === "auto" ? "expense" : draft.kind).map(
                        (category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={draft.memo ?? ""}
                      aria-label={labels.memo}
                      onChange={(event) => onChange(index, { memo: event.target.value || null })}
                      className="h-8 min-w-32 px-2"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      aria-label={labels.owner}
                      value={draft.owner ?? ""}
                      onChange={(event) => onChange(index, { owner: event.target.value || null })}
                      className="h-8 max-w-28 rounded-md border border-input bg-background px-2 text-footnote"
                    >
                      <option value="">{labels.none}</option>
                      <option value="shared">{labels.shared}</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name ?? member.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={labels.business}
                      value={draft.businessSharePct}
                      onChange={(event) =>
                        onChange(index, {
                          businessSharePct: Math.min(
                            100,
                            Math.max(0, Number(event.target.value) || 0),
                          ),
                        })
                      }
                      className="h-8 w-16 px-2 text-end tabular-nums"
                      dir="ltr"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <TagsInput
                      label={labels.tags}
                      value={draft.tags}
                      onCommit={(tags) => onChange(index, { tags })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="rounded-full bg-muted px-1.5 py-0.5 text-caption"
                        title={outcome?.reasons.map((r) => r.code).join(", ")}
                      >
                        {labels.status(status, outcome?.code ?? undefined)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={labels.remove}
                        onClick={() => onRemove(index)}
                        className="size-7"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                  {labels.none}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(Math.max(0, currentPage - 1))}
          >
            {labels.prev}
          </Button>
          <span>{labels.page(currentPage + 1, pages)}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}
          >
            {labels.next}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Local text buffer so a comma or a trailing space can be typed. Parsing on every keystroke
 * would immediately rewrite "food, " to "food" and make a second tag impossible to enter.
 */
function TagsInput({
  value,
  label,
  onCommit,
}: {
  value: string[];
  label: string;
  onCommit: (tags: string[]) => void;
}) {
  const joined = value.join(", ");
  const [draft, setDraft] = useState({ source: joined, text: joined });
  const text = draft.source === joined ? draft.text : joined;
  const commit = () =>
    onCommit(
      text
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20),
    );
  return (
    <Input
      aria-label={label}
      value={text}
      onChange={(event) => setDraft({ source: joined, text: event.target.value })}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="h-8 min-w-28 px-2"
    />
  );
}
