import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildMultiServiceQuote, loadPricingConfig } from "@/lib/quotes";
import { ServiceType, Measurement } from "@/types";

const VALID_SERVICES: ServiceType[] = ["reroof", "spray", "tuneup", "gutter_clean"];

// POST /api/quotes — generate a quote for a job
// Accepts either:
//   { jobId, serviceType: "reroof" }             — single (backward compat)
//   { jobId, serviceTypes: ["reroof", "gutter_clean"] }  — multi-service
export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body.jobId as number;

  // Normalise to array
  let serviceTypes: ServiceType[];
  if (Array.isArray(body.serviceTypes) && body.serviceTypes.length > 0) {
    serviceTypes = body.serviceTypes;
  } else if (body.serviceType) {
    serviceTypes = [body.serviceType];
  } else {
    return NextResponse.json({ error: "serviceType or serviceTypes is required" }, { status: 400 });
  }

  // Validate
  const invalid = serviceTypes.filter((s: string) => !VALID_SERVICES.includes(s as ServiceType));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid service type(s): ${invalid.join(", ")}` }, { status: 400 });
  }

  // De-duplicate while preserving order
  serviceTypes = [...new Set(serviceTypes)];

  const db = getDb();

  const measurement = db
    .prepare("SELECT * FROM measurements WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(jobId) as Measurement | undefined;

  if (!measurement) {
    return NextResponse.json(
      { error: "No measurements found for this job — run processing first" },
      { status: 422 }
    );
  }

  const cfg   = loadPricingConfig();
  const quote = buildMultiServiceQuote(jobId, serviceTypes, measurement, cfg);

  const result = db
    .prepare(
      `INSERT INTO quotes (job_id, service_types, line_items, subtotal, tax_rate, tax, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`
    )
    .run(
      quote.job_id,
      JSON.stringify(quote.service_types),
      JSON.stringify(quote.line_items),
      quote.subtotal,
      quote.tax_rate,
      quote.tax,
      quote.total
    );

  return NextResponse.json({
    id: result.lastInsertRowid,
    ...quote,
  });
}
