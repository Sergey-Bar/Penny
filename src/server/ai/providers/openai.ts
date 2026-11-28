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
import { parseCategoryResponse } from "./parse";

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
    return parseCategoryResponse(
      text,
      categories.map((c) => c.name),
      allowProposals,
    );
  }
}
