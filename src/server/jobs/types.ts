export type JobLane = "critical" | "maintenance";

export type JobStatus = "queued" | "leased" | "succeeded" | "dead" | "cancelled";

export interface JobRow {
  id: number;
  workspace_id: number | null;
  type: string;
  lane: JobLane;
  idempotency_key: string | null;
  payload_version: number;
  payload_json: string;
  state_json: string;
  status: JobStatus;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  shadow: number;
  last_error_code: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface JobPayload {
  [key: string]: unknown;
}

interface JobHandlerContext {
  job: JobRow;
  payload: JobPayload;
  state: Record<string, unknown>;
  shadow: boolean;
  signal: AbortSignal;
  /** Merges into state_json immediately so a resumed attempt skips completed steps. */
  saveState: (patch: Record<string, unknown>) => void;
  /** Additive progress events for the manual SSE stream; a scheduled run has a no-op. */
  emit: (event: string, data: Record<string, unknown>) => void;
}

export interface JobHandler {
  lane: JobLane;
  priority: number;
  maxAttempts?: number;
  /** Delays after failed attempts, in milliseconds. */
  retryDelaysMs?: number[];
  payloadSchema?: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: unknown } | { success: false; error: { message: string } };
  };
  run: (context: JobHandlerContext) => Promise<void>;
}

export interface EnqueueJobInput {
  workspaceId?: number | null;
  type: string;
  payload?: JobPayload;
  idempotencyKey?: string | null;
  priority?: number;
  delayMs?: number;
  maxAttempts?: number;
  shadow?: boolean;
  /** Create the job already leased to this owner (the manual SSE sync claims it inline). */
  leaseOwner?: string | null;
  leaseSeconds?: number;
  lane?: JobLane;
}
