import "server-only";

import { z } from "zod";
import { ApiError } from "@/server/lib/api-error";
import { MoneyContractError, assertCanonicalAmount } from "@/lib/money-contract";

const moneyInput = z.union([z.number(), z.string()]);

function canonicalMoney(value: unknown): number {
  return assertCanonicalAmount(value);
}

export const moneySchema = moneyInput.transform((value, ctx) => {
  try {
    return canonicalMoney(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof MoneyContractError ? error.message : "Invalid amount",
    });
    return z.NEVER;
  }
});

function issues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export async function readValidatedJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("Invalid JSON", 400, "bad_json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError("Invalid request", 400, "bad_request", issues(parsed.error));
  return parsed.data;
}
