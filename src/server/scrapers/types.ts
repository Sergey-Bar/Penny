import "server-only";

export interface ScrapedTransaction {
  type: "normal" | "installments";
  identifier?: string | number;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  installments?: { number: number; total: number };
  status: "completed" | "pending";
}

export interface ScrapedAccount {
  accountNumber: string;
  /** Current balance, when the bank reports one (bank accounts, not cards). */
  balance?: number;
  transactions: ScrapedTransaction[];
}

export interface ScrapedSecurity {
  accountNumber: string;
  equityNumber: string;
  name: string;
  type: "stock" | "fund" | "bond";
  currency: string;
  symbol: string | null;
  quantity: number | null;
  value: number;
  valueIls: number | null;
  costBasis: number | null;
  details?: Record<string, unknown>;
}

export interface ScrapeResult {
  success: boolean;
  accounts: ScrapedAccount[];
  securities?: ScrapedSecurity[];
  errorMessage?: string;
  /** A transient failure worth one more attempt. */
  retryable?: boolean;
}
