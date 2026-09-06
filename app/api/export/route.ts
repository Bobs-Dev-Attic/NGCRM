import { NextResponse } from "next/server";
import { runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";
import { contactsDataset, donationsDataset, toCsv, type Dataset } from "@/lib/export";
import { toXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export contacts or donations as CSV or XLSX. Auth-gated and RLS-scoped — the
 * file contains exactly the rows the signed-in user is allowed to see.
 *   GET /api/export?type=contacts|donations&format=csv|xlsx
 */
export async function GET(req: Request) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "donations" ? "donations" : "contacts";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  return runWithContext(ctx, async () => {
    try {
      const ds: Dataset = type === "donations" ? await donationsDataset() : await contactsDataset();
      const date = new Date().toISOString().slice(0, 10);
      const base = `${type}-${date}`;
      const sheet = type === "donations" ? "Donations" : "Contacts";

      if (format === "xlsx") {
        const buf = toXlsx(sheet, ds.headers, ds.rows);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${base}.xlsx"`,
            "Cache-Control": "no-store",
          },
        });
      }

      const csv = toCsv(ds.headers, ds.rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
