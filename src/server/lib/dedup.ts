import "server-only";

import crypto from "crypto";

interface DedupFields {
  accountNumber: string;
  date: string;
  originalAmount: number;
  originalCurrency: string;
  description: string;
  identifier?: string | number | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  /** Import v2 account identity; keeps equal rows on two providers from hashing alike. */
  accountIdentity?: string | number | null;
}

export function computeDedupHash(fields: DedupFields): string {
  const parts = [
    fields.accountNumber,
    fields.date,
    String(fields.originalAmount),
    fields.originalCurrency,
    fields.description,
    fields.identifier != null ? String(fields.identifier) : "",
    fields.installmentNumber != null ? String(fields.installmentNumber) : "",
    fields.installmentTotal != null ? String(fields.installmentTotal) : "",
  ];
  if (fields.accountIdentity != null) parts.push(String(fields.accountIdentity));

  // "\" and "|" inside a field are escaped so a "|" in a description cannot pass for the boundary
  // between two fields. A field without either character is unchanged, so every hash already stored
  // stays valid; only rows whose text holds one of them hash differently from before.
  const escaped = parts.map((p) => p.replace(/[\\|]/g, "\\$&"));
  return crypto.createHash("sha256").update(escaped.join("|")).digest("hex");
}
