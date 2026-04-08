import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/jobs/[id] — full job detail with images, measurements, quotes
export async function GET(_req: NextRequest, { params }: Params) {
  const db  = getDb();
  const id  = parseInt((await params).id);

  const job = db
    .prepare(
      `SELECT j.*, c.name as client_name, c.address, c.phone, c.email,
              c.drive_folder_name, c.lat, c.lng
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       WHERE j.id = ?`
    )
    .get(id);

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const images = db
    .prepare("SELECT * FROM job_images WHERE job_id = ? ORDER BY angle")
    .all(id);

  const measurement = db
    .prepare("SELECT * FROM measurements WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(id);

  const satellite_estimate = db
    .prepare("SELECT * FROM satellite_estimates WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(id);

  const quotes = db
    .prepare("SELECT * FROM quotes WHERE job_id = ? ORDER BY created_at DESC")
    .all(id);

  // Parse JSON columns for each quote
  const parsedQuotes = (quotes as { line_items: string; service_types: string }[]).map((q) => ({
    ...q,
    line_items: JSON.parse(q.line_items),
    service_types: JSON.parse(q.service_types),
  }));

  return NextResponse.json({ job, images, measurement, satellite_estimate, quotes: parsedQuotes });
}

// PATCH /api/jobs/[id] — update status or notes
export async function PATCH(req: NextRequest, { params }: Params) {
  const db   = getDb();
  const id   = parseInt((await params).id);
  const body = await req.json();
  const { status, notes } = body;

  const fields: string[] = [];
  const vals: unknown[]  = [];

  if (status) { fields.push("status = ?"); vals.push(status); }
  if (notes !== undefined) { fields.push("notes = ?"); vals.push(notes); }
  if (status === "quote_ready" || status === "quote_sent") {
    fields.push("completed_at = datetime('now')");
  }

  if (fields.length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  vals.push(id);
  db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...vals);

  return NextResponse.json({ ok: true });
}
