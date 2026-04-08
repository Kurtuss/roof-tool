import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadPricingConfig } from "@/lib/quotes";

// GET /api/settings — return current pricing config
export async function GET() {
  const cfg = loadPricingConfig();
  return NextResponse.json(cfg);
}

// POST /api/settings — update any pricing keys
export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, number>;
  const db   = getDb();

  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const update = db.transaction((entries: [string, number][]) => {
    for (const [key, value] of entries) {
      stmt.run(key, String(value));
    }
  });

  update(Object.entries(body) as [string, number][]);

  return NextResponse.json({ ok: true, saved: Object.keys(body) });
}
