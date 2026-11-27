import "server-only";

import { registerSyncJobHandlers } from "./sync";
import { registerMaintenanceJobHandlers } from "./maintenance";
import { registerIntelligenceJobHandlers } from "./intelligence";
import { registerImportJobHandlers } from "./import";
import { registerPipJobHandlers } from "./pip";

let registered = false;

export function registerAllJobHandlers(): void {
  if (registered) return;
  registered = true;
  registerSyncJobHandlers();
  registerMaintenanceJobHandlers();
  registerIntelligenceJobHandlers();
  registerImportJobHandlers();
  registerPipJobHandlers();
}
