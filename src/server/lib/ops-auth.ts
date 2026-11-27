import "server-only";

import { ApiError } from "@/server/lib/api-error";
import { accessEnabled, currentUser } from "@/server/lib/user-access";

/**
 * `/api/ops/*` is admin-only. With no users configured the app is single-user local, so the local
 * owner is the admin; with access enabled a non-admin gets 403.
 */
export function requireOpsAdmin(request: Request): void {
  if (!accessEnabled()) return;
  const user = currentUser(request);
  if (!user?.isAdmin) throw new ApiError("admin required", 403, "admin_required");
}
