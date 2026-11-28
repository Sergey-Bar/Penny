import type { Asset } from "./types";

export const ACCOUNT_GROUPS = [
  "bank",
  "investments",
  "property",
  "vehicles",
  "other",
  "liabilities",
] as const;
export type AccountGroupKey = (typeof ACCOUNT_GROUPS)[number];

const INVESTMENT = new Set([
  "stock",
  "fund",
  "bond",
  "crypto",
  "metal",
  "study_fund",
  "provident",
  "pension",
]);

export function accountGroupOf(a: Pick<Asset, "type" | "isLiability" | "source">): AccountGroupKey {
  if (a.isLiability) return "liabilities";
  if (a.source === "bank" || a.type === "cash" || a.type === "deposit") return "bank";
  if (INVESTMENT.has(a.type)) return "investments";
  if (a.type === "real_estate" || a.type === "business") return "property";
  if (a.type === "vehicle") return "vehicles";
  return "other";
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes a provider-group house prefix (both languages, plus the short "אקסלנס" label). */
export function stripInvestmentHousePrefix(
  name: string,
  house: { he: string; en: string } | null | undefined,
): string {
  const prefixes = [house?.he, house?.en, "אקסלנס"].filter((value): value is string =>
    Boolean(value),
  );
  return prefixes.reduce(
    (value, prefix) => value.replace(new RegExp(`^${escapeRegExp(prefix)}\\s*-\\s*`), ""),
    name,
  );
}

export function assetProviderKey(
  a: Pick<Asset, "note" | "name"> & { provider?: string | null },
): string | null {
  if (a.note?.startsWith("pension:")) {
    const seg = a.note.split(":")[1];
    if (seg && !/^\d+$/.test(seg)) return seg;
  }
  if (a.note?.startsWith("bank-securities:")) {
    const seg = a.note.split(":")[1];
    if (seg) return seg;
  }
  if (typeof a.provider === "string" && a.provider.trim()) return a.provider.trim();
  if (a.name.startsWith("אקסלנס - ")) return "excellence";
  return null;
}

/** Accounts sorted into the sidebar's groups, biggest first; liabilities total is negative. Empty groups are left out.
 * `moves` puts an account (by id) in a group of the person's choice; a debt always stays a debt. */
export function groupAccounts(assets: Asset[], moves: Record<number, AccountGroupKey> = {}) {
  return ACCOUNT_GROUPS.map((key) => {
    const items = assets
      .filter(
        (a) =>
          (a.isLiability
            ? "liabilities"
            : (moves[a.id] !== "liabilities" && moves[a.id]) || accountGroupOf(a)) === key,
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        value: (key === "liabilities" ? -1 : 1) * Math.abs(a.valueIls ?? 0),
        providerKey: assetProviderKey(a),
      }))
      .sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    return { key, items, total: items.reduce((s, x) => s + x.value, 0) };
  }).filter((g) => g.items.length > 0);
}

export type GroupedSidebarEntry<T extends { value: number; providerKey: string | null }> =
  { kind: "item"; item: T } | { kind: "provider"; providerKey: string; total: number; items: T[] };

/** Collapses investments sharing a providerKey into a subgroup when 2+ items belong to it. */
export function groupItemsByProvider<T extends { value: number; providerKey: string | null }>(
  items: T[],
  groupByProvider = true,
): GroupedSidebarEntry<T>[] {
  if (!groupByProvider) {
    return items
      .map((item) => ({ kind: "item" as const, item }))
      .sort((a, b) => Math.abs(b.item.value) - Math.abs(a.item.value));
  }
  const byProvider = new Map<string, T[]>();
  for (const item of items) {
    if (!item.providerKey) continue;
    const list = byProvider.get(item.providerKey);
    if (list) list.push(item);
    else byProvider.set(item.providerKey, [item]);
  }
  const seenProviders = new Set<string>();
  const entries: GroupedSidebarEntry<T>[] = [];
  for (const item of items) {
    const pk = item.providerKey;
    const group = pk ? byProvider.get(pk) : undefined;
    if (pk && group && group.length >= 2) {
      if (seenProviders.has(pk)) continue;
      seenProviders.add(pk);
      entries.push({
        kind: "provider",
        providerKey: pk,
        total: group.reduce((s, x) => s + x.value, 0),
        items: group,
      });
    } else {
      entries.push({ kind: "item", item });
    }
  }
  return entries.sort((a, b) => {
    const va = a.kind === "provider" ? Math.abs(a.total) : Math.abs(a.item.value);
    const vb = b.kind === "provider" ? Math.abs(b.total) : Math.abs(b.item.value);
    return vb - va;
  });
}
