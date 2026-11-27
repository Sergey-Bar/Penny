import "server-only";

export { normalizeMerchantV1 as normalizeMerchant } from "@/lib/merchant-normalize";

export function translateMerchant(key: string, table: Record<string, string>): string | null {
  return table[key] ?? null;
}
