# ADR 0001: Pip as a grounded household finance agent

- Status: Accepted for Phase 1
- Date: 2026-11-27
- Owners: Penny maintainers

## Context

The existing coach is deterministic and useful, but it cannot answer a free-form question across accounts, budgets, goals, pensions and insurance. A generic chat model on top of the database would be fast to build and easy to demo, but it would also make numbers unverifiable, leak raw rows to a provider and make every answer a fresh source of financial advice.

Pip needs to answer ordinary household questions without becoming an ungrounded advisor. The household data stays local, the model is optional, and an answer must be explainable from stored facts.

## Decision

Pip is a facts-first agent:

1. A versioned Zod tool registry exposes read-only facts. The model never writes SQL and never sees credentials.
2. A deterministic planner selects the smallest set of tools for a question. Tool selection is evaluated by a golden suite before any model-generated tool choice is allowed.
3. Tool results are validated against output schemas. Each result produces an evidence record with an ID and an as-of timestamp.
4. A deterministic answer is always produced from the tool results. A configured provider may phrase the answer, but only after the numeric verifier confirms that every amount in the text appears in the tool results.
5. If the provider is unavailable, unconsented, slow or rejected by the verifier, the deterministic answer is returned. The answer is never blocked on the model.
6. Memory is explicit. A memory item is written only after a user action, is scoped to a workspace and profile, and can be read or deleted in the UI.
7. Write, destructive and external actions are not exposed in Phase 1. They remain behind approvals in later phases.

The agent is exposed through the global Pip dock and through `/ask` when `pip_v2` is on. `/ask` keeps the old deterministic box as the fallback when the flag is off or the workspace has no AI provider.

## Consequences

- A provider outage degrades wording, not facts.
- The same question has a reproducible answer in tests, which makes evaluation meaningful.
- New facts require a tool and a schema, not a prompt edit.
- The model cannot perform an action or see raw transaction rows.
- Phase 1 is deliberately less capable than a fully autonomous agent. The gap register records what is missing.

## Rejected alternatives

- **Let the model query SQL directly.** Rejected: impossible to bound, audit or verify, and easy to exfiltrate rows.
- **Model-only tool selection.** Deferred: the golden set must prove at least 95% selection before the model chooses tools unsupervised.
- **A separate vector database.** Rejected for Phase 1: the knowledge seed is small, versioned and searchable by keywords; a vector store adds a dependency without improving the first use case.
- **Streaming raw model tokens as the final answer.** Rejected: the final text must pass the numeric verifier. SSE streams approved words from the deterministic text or the verified provider text.
