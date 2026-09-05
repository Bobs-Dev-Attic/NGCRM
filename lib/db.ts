import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless SQL client.
 *
 * Uses the HTTP driver, which works on both the Vercel Node.js and Edge
 * runtimes. Query with the tagged-template form for automatic parameterization:
 *
 *   const rows = await sql`SELECT * FROM contacts WHERE id = ${id}`;
 */

// Lazily instantiate so importing this module doesn't throw when env is absent
// (e.g. during `next build` on a machine without the secret).
let client: NeonQueryFunction<false, false> | undefined;

export function getSql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
      );
    }
    client = neon(url);
  }
  return client;
}
