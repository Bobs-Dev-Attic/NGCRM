import { getTokenFromCookie, verifySession, authSecret } from "@/lib/auth";
import type { RequestContext } from "@/lib/db";

export const ROLES = ["admin", "staff", "volunteer"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Build the request identity (org + role) from the authenticated session cookie.
 * Returns null when there is no valid session — callers should reject (401).
 * The role and org come from the signed session, so they cannot be spoofed by
 * the client, and RLS enforces whatever identity is in effect.
 */
export async function contextFromRequest(req: Request): Promise<RequestContext | null> {
  const token = getTokenFromCookie(req.headers.get("cookie"));
  if (!token) return null;
  try {
    const payload = await verifySession(token, authSecret());
    if (!payload) return null;
    return { orgId: payload.orgId, userId: String(payload.userId), role: payload.role };
  } catch {
    return null;
  }
}
