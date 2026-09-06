import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Neon serverless SQL client with per-request access scoping.
 *
 * Authorization is enforced by Postgres Row-Level Security (RLS), not by the
 * agent. Each request establishes an identity (org + role) in AsyncLocalStorage;
 * `getSql()` then returns a client that wraps every query in a transaction which
 * first sets that identity as session GUCs (app.org_id / app.user_id / app.role).
 * RLS policies read those GUCs, so whatever the agent asks for, the database only
 * returns rows the current identity is allowed to see.
 *
 * When there is no request context (migrations, seeds, tenant bootstrap), queries
 * run unscoped — the policies treat "no identity" as a trusted server path.
 */

export type RequestContext = {
  orgId: number | null;
  userId: string;
  role: string;
  /** Optional embeddings config, so tools can embed-on-write. Never used for GUCs. */
  embed?: { baseUrl: string; apiKey: string; model: string };
};

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return als.getStore();
}

let base: NeonQueryFunction<false, false> | undefined;
function rawClient(): NeonQueryFunction<false, false> {
  if (!base) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
      );
    }
    base = neon(url);
  }
  return base;
}

/** Unscoped client — bypasses request context. Only for tenant bootstrap. */
export function getRawSql(): NeonQueryFunction<false, false> {
  return rawClient();
}

let cachedOrgId: number | null | undefined;
/** The default (demo) org id, or null before the schema is migrated. */
export async function getDefaultOrgId(): Promise<number | null> {
  if (cachedOrgId !== undefined) return cachedOrgId;
  try {
    const r = rawClient();
    const rows = (await r`SELECT min(id)::int AS id FROM orgs`) as { id: number | null }[];
    cachedOrgId = rows[0]?.id ?? null;
  } catch {
    cachedOrgId = null; // orgs table not present yet
  }
  return cachedOrgId;
}

export function getSql(): NeonQueryFunction<false, false> {
  const r = rawClient();
  const ctx = als.getStore();
  if (!ctx) return r; // no request context -> unscoped (scripts / bootstrap)

  // One statement sets all three GUCs (is_local: scoped to the transaction).
  const setAll = () =>
    r`SELECT set_config('app.org_id', ${ctx.orgId == null ? "" : String(ctx.orgId)}, true),
             set_config('app.user_id', ${ctx.userId}, true),
             set_config('app.role', ${ctx.role}, true)`;

  const scoped = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = r(strings, ...(values as never[]));
    return r.transaction([setAll(), q]).then((res) => (res as unknown[])[(res as unknown[]).length - 1]);
  }) as unknown as NeonQueryFunction<false, false>;

  // Preserve sql.transaction([...]) — prepend the context-setting statement.
  (scoped as unknown as { transaction: (q: unknown[]) => Promise<unknown> }).transaction = (
    queries: unknown[]
  ) => r.transaction([setAll(), ...(queries as never[])]).then((res) => (res as unknown[]).slice(1));

  return scoped;
}
