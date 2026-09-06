import { getSql } from "@/lib/db";
import { customText } from "@/lib/custom";
import type { Cell } from "@/lib/xlsx";

/**
 * Tabular exports for contacts and donations. Queries run through the scoped
 * client, so RLS decides which rows a user can export (a volunteer's export
 * excludes restricted contacts and their gifts). Returns headers + rows that
 * both the CSV and XLSX serializers consume.
 */

export type Dataset = { headers: string[]; rows: Cell[][] };

export async function contactsDataset(): Promise<Dataset> {
  const sql = getSql();
  const rows = (await sql`
    SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
           c.address_line, c.city, c.state, c.postal_code,
           array_to_string(c.tags, ', ') AS tags,
           h.name AS household, c.source, c.notes, c.custom, c.created_at
    FROM contacts c
    LEFT JOIN households h ON h.id = c.household_id
    ORDER BY c.last_name NULLS LAST, c.first_name NULLS LAST, c.id
  `) as Record<string, unknown>[];

  const headers = [
    "ID", "First name", "Last name", "Email", "Phone",
    "Address", "City", "State", "Postal code",
    "Tags", "Household", "Source", "Notes", "Custom fields", "Created",
  ];
  const data = rows.map((r) => [
    Number(r.id),
    str(r.first_name), str(r.last_name), str(r.email), str(r.phone),
    str(r.address_line), str(r.city), str(r.state), str(r.postal_code),
    str(r.tags), str(r.household), str(r.source), str(r.notes),
    customText(r.custom), isoDate(r.created_at),
  ] as Cell[]);
  return { headers, rows: data };
}

export async function donationsDataset(): Promise<Dataset> {
  const sql = getSql();
  const rows = (await sql`
    SELECT d.id, d.donated_at, d.amount::float AS amount,
           ct.id AS contact_id,
           coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'') AS donor,
           ct.email AS donor_email,
           cp.name AS campaign, d.created_at
    FROM donations d
    JOIN contacts ct ON ct.id = d.contact_id
    LEFT JOIN campaigns cp ON cp.id = d.campaign_id
    ORDER BY d.donated_at DESC, d.id DESC
  `) as Record<string, unknown>[];

  const headers = ["ID", "Date", "Amount", "Contact ID", "Donor", "Donor email", "Campaign", "Recorded"];
  const data = rows.map((r) => [
    Number(r.id),
    isoDate(r.donated_at),
    Number(r.amount),
    Number(r.contact_id),
    str(r.donor).trim(),
    str(r.donor_email),
    str(r.campaign),
    isoDate(r.created_at),
  ] as Cell[]);
  return { headers, rows: data };
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Dates as YYYY-MM-DD (or full ISO for timestamps) without locale surprises. */
function isoDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  // date columns already come back as YYYY-MM-DD; timestamps as ISO — take the date part.
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel reads accents correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return "﻿" + lines.join("\r\n");
}
