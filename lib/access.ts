import { getDefaultOrgId, type RequestContext } from "@/lib/db";

/**
 * Demo access roles. In a real deployment these would come from authenticated
 * identity (session/JWT) set server-side; here we accept a header from the
 * browser so the RLS behavior can be demonstrated by switching roles. The header
 * is a stand-in for real auth — it does not weaken RLS, which enforces whatever
 * role is in effect.
 */
export const ROLES = ["admin", "staff", "volunteer"] as const;
export type Role = (typeof ROLES)[number];

export function normalizeRole(v: string | null | undefined): Role {
  return v && (ROLES as readonly string[]).includes(v) ? (v as Role) : "staff";
}

/** Build the request identity (org + role) for RLS scoping. */
export async function contextFromRequest(req: Request): Promise<RequestContext> {
  const role = normalizeRole(req.headers.get("x-ngcrm-role"));
  const orgId = await getDefaultOrgId();
  return { orgId, userId: "demo-user", role };
}
