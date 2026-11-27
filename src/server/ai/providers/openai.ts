import "server-only";

import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";
import { fetchExternal } from "@/server/lib/fetch-external";

function parseConfidence(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.round(n);
  if (clamped < 1 || clamped > 7) return undefined;
  return clamped;
}

export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] },
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const pastCorrections = options?.pastCorrections ?? [];
    const prompt = buildCategorizationPrompt(
      transactions,
      categories,
      allowProposals,
      pastCorrections,
    );

    const res = await fetchExternal(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      },
      120_000,
    );
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return parseResponse(
      text,
      categories.map((c) => c.name),
      allowProposals,
    );
  }
}

function parseResponse(
  text: string,
  validCategories: string[],
  allowProposals: boolean,
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const validSet = new Set(validCategories.map((c) => c.toLowerCase()));

  const results: CategoryMapping[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).index !== "number" ||
      typeof (item as Record<string, unknown>).categoryName !== "string"
    ) {
      continue;
    }
    const typed = item as {
      index: number;
      categoryName: string;
      confidence?: unknown;
    };
    const name = typed.categoryName.trim();
    const isExisting = validSet.has(name.toLowerCase());
    if (!isExisting && !allowProposals) continue;
    results.push({
      index: typed.index,
      categoryName: name,
      isNew: !isExisting,
      confidence: parseConfidence(typed.confidence),
    });
  }
  return results;
}
