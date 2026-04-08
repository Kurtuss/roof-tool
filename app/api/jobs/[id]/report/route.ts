/**
 * GET /api/jobs/[id]/report
 * Generates a branded PDF roof report and streams it back.
 * Assembles job data, calls the Python reportlab script, returns the PDF.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadCompanyInfo } from "@/lib/company";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const db = getDb();
  const id = parseInt((await params).id);

  // Load all job data
  const job = db
    .prepare(
      `SELECT j.*, c.name as client_name, c.address, c.phone, c.email,
              c.drive_folder_name, c.lat, c.lng
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       WHERE j.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const measurement = db
    .prepare("SELECT * FROM measurements WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(id) as Record<string, unknown> | undefined;

  const satellite_estimate = db
    .prepare("SELECT * FROM satellite_estimates WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(id) as Record<string, unknown> | undefined;

  // Get the most recent quote
  const quoteRow = db
    .prepare("SELECT * FROM quotes WHERE job_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(id) as { line_items: string; service_types: string } | undefined;

  let quote = null;
  if (quoteRow) {
    quote = {
      ...quoteRow,
      line_items: JSON.parse(quoteRow.line_items),
      service_types: JSON.parse(quoteRow.service_types),
    };
  }

  const company = loadCompanyInfo();

  // Assemble data for the Python script
  const reportData = {
    job,
    measurement: measurement ?? null,
    satellite_estimate: satellite_estimate ?? null,
    quote,
    company,
  };

  // Write to temp file
  const tmpDir = os.tmpdir();
  const jsonPath = path.join(tmpDir, `roof-report-${id}-${Date.now()}.json`);
  const pdfPath = path.join(tmpDir, `roof-report-${id}-${Date.now()}.pdf`);

  try {
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));

    // Find the script
    const scriptPath = path.join(process.cwd(), "scripts", "generate-report.py");

    // Run Python script — try "python" first (Windows), fall back to "python3" (Mac/Linux)
    let pythonCmd = "python";
    try {
      execSync(`python --version`, { stdio: "pipe" });
    } catch {
      pythonCmd = "python3";
    }

    execSync(`${pythonCmd} "${scriptPath}" "${jsonPath}" "${pdfPath}"`, {
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Read the generated PDF
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Clean up temp files
    try { fs.unlinkSync(jsonPath); } catch {}
    try { fs.unlinkSync(pdfPath); } catch {}

    const clientName = (job.client_name as string ?? "Client").replace(/[^a-zA-Z0-9]/g, "_");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Roof_Report_${clientName}.pdf"`,
      },
    });
  } catch (err) {
    // Clean up on error
    try { fs.unlinkSync(jsonPath); } catch {}
    try { fs.unlinkSync(pdfPath); } catch {}

    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Report generation failed:", message);
    return NextResponse.json({ error: "Failed to generate report", detail: message }, { status: 500 });
  }
}
