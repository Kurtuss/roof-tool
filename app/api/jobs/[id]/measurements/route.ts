/**
 * POST /api/jobs/[id]/measurements
 * Manually enter or override measurements for a job.
 * Used when ODM fails or measurements are known from another source.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pitchBracket } from "@/lib/quotes";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const db    = getDb();
  const jobId = parseInt((await params).id);

  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const job = db.prepare("SELECT id, status FROM jobs WHERE id = ?").get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json();
  const {
    total_sqft,
    pitch_degrees,
    eave_length_ft,
    ridge_length_ft,
    valley_length_ft,
  } = body;

  // Validate required fields
  if (!total_sqft || total_sqft <= 0) {
    return NextResponse.json({ error: "total_sqft is required and must be > 0" }, { status: 400 });
  }
  if (pitch_degrees === undefined || pitch_degrees < 0 || pitch_degrees > 90) {
    return NextResponse.json({ error: "pitch_degrees must be between 0 and 90" }, { status: 400 });
  }

  const pitch  = Number(pitch_degrees);
  const bracket = pitchBracket(pitch);
  const complexity = +Math.min(1 + (pitch / 90) * 0.5, 1.5).toFixed(3);

  // Clear any previous measurements
  db.prepare("DELETE FROM measurements WHERE job_id = ?").run(jobId);

  db.prepare(`
    INSERT INTO measurements
      (job_id, total_sqft, pitch_degrees, pitch_bracket,
       ridge_length_ft, eave_length_ft, valley_length_ft,
       complexity_score, odm_task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    jobId,
    Number(total_sqft),
    pitch,
    bracket,
    Number(ridge_length_ft  ?? 0),
    Number(eave_length_ft   ?? 0),
    Number(valley_length_ft ?? 0),
    complexity
  );

  // Mark job quote_ready and clear any error
  db.prepare(`
    UPDATE jobs
    SET status = 'quote_ready', error_message = NULL, completed_at = datetime('now')
    WHERE id = ?
  `).run(jobId);

  return NextResponse.json({ ok: true, pitch_bracket: bracket, complexity_score: complexity });
}
