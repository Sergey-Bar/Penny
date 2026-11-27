/** Rollout modes for the durable backend (`backend_v2`). */
export type BackendMode = "off" | "shadow" | "on";

export function parseBackendMode(value: unknown): BackendMode | null {
  if (value === "off" || value === "shadow" || value === "on") return value;
  return null;
}
