/**
 * GET  /api/settings/company — return company info strings
 * POST /api/settings/company — update company info strings
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadCompanyInfo, CompanyInfo } from "@/lib/company";

const DEFAULTS = ["company_name", "company_tagline", "company_phone", "company_email", "company_address"] as const;

export async function GET() {
  return NextResponse.json(loadCompanyInfo());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<CompanyInfo>;
  const db   = getDb();

  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const update = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) stmt.run(key, value);
  });

  const entries = DEFAULTS
    .filter((k) => body[k] !== undefined)
    .map((k) => [k, String(body[k] ?? "")] as [string, string]);

  if (entries.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  update(entries);

  return NextResponse.json({ ok: true, saved: entries.map(([k]) => k) });
}
