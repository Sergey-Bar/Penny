import "server-only";

import { getAppSettings } from "@/server/db/queries/settings";
import { getAllCategories } from "@/server/db/queries/categories";
import { getRecentCorrections } from "@/server/db/queries/category-corrections";
import {
  batchSetNeedsReview,
  batchUpdateCategories,
  getTransactionsForCategorization,
  getUncategorizedIdsByKind,
} from "@/server/db/queries/transactions";
import { lookupMerchantCategoriesBulk } from "@/server/lib/merchant-memory";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { logError } from "@/server/lib/log";
import { friendlyAIError } from "@/server/sync/orchestrator";

const BATCH_SIZE = 50;

export interface AICategorizeResult {
  categorized: number;
  warning: string | null;
}

/**
 * The AI lane: only rows memory and the dictionary left unresolved, in capped batches. A provider
 * failure never escapes into sync or post-processing; the job dead-letters on its own.
 */
export async function categorizeWithAI(
  workspaceId: number,
  maxBatches = 8,
): Promise<AICategorizeResult> {
  const settings = getAppSettings(workspaceId);
  let aiProvider: ReturnType<typeof createAIProvider> = null;
  try {
    aiProvider = createAIProvider();
  } catch (error) {
    logError("ai/categorize-provider", error);
  }
  if (!aiProvider) return { categorized: 0, warning: null };

  if (settings.aiProvider === "ollama") {
    const ollama = await ensureOllamaRunning(settings.ollamaUrl);
    if (!ollama.ok) return { categorized: 0, warning: ollama.error ?? "Ollama is not reachable" };
  }

  let categorized = 0;
  let warning: string | null = null;
  let batches = 0;

  for (const kind of ["expense", "income"] as const) {
    if (batches >= maxBatches) break;
    const uncategorizedIds = getUncategorizedIdsByKind(workspaceId, kind);
    if (uncategorizedIds.length === 0) continue;
    const categories = getAllCategories(workspaceId, kind);
    if (categories.length === 0) continue;
    const categoryInput = categories.map((category) => ({
      name: category.name,
      description: category.description,
    }));
    const pastCorrections = getRecentCorrections(workspaceId, kind);
    const allTxns = getTransactionsForCategorization(workspaceId, uncategorizedIds);
    const memoryMap = lookupMerchantCategoriesBulk(
      workspaceId,
      allTxns.map((transaction) => transaction.description),
    );
    const remaining = allTxns.filter((transaction) => {
      const remembered = memoryMap.get(transaction.description);
      return !(remembered && remembered.kind === kind);
    });

    for (let index = 0; index < remaining.length && batches < maxBatches; index += BATCH_SIZE) {
      batches++;
      const batch = remaining.slice(index, index + BATCH_SIZE);
      try {
        const mappings = await aiProvider.categorize(
          batch.map((transaction) => ({
            description: transaction.description,
            amount: transaction.chargedAmount,
            currency: transaction.originalCurrency,
            memo: transaction.memo,
          })),
          categoryInput,
          { pastCorrections },
        );
        const updates: {
          id: number;
          categoryId: number;
          aiConfidence: number | null;
          origin: string;
          confidence: number | null;
          reasons: unknown;
        }[] = [];
        const reviewFlags: { id: number; needsReview: boolean }[] = [];
        for (const mapping of mappings) {
          const category = categories.find((candidate) => candidate.name === mapping.categoryName);
          const transaction = batch[mapping.index];
          if (!category || !transaction) continue;
          const confidence = mapping.confidence ?? null;
          updates.push({
            id: transaction.id,
            categoryId: category.id,
            aiConfidence: confidence,
            origin: "ai",
            confidence,
            reasons: [{ code: "aiSuggested" }],
          });
          reviewFlags.push({
            id: transaction.id,
            needsReview: confidence == null || confidence <= 4,
          });
        }
        if (updates.length > 0) {
          batchUpdateCategories(workspaceId, updates);
          batchSetNeedsReview(workspaceId, reviewFlags);
          categorized += updates.length;
        }
      } catch (error) {
        logError("ai/categorize", error, { kind });
        warning ??= friendlyAIError(error, settings.ollamaModel);
      }
    }
  }

  return { categorized, warning };
}
