import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocode";
import { estimateFromSatellite } from "@/lib/satellite";
import { saveSatelliteEstimate } from "@/lib/satellite-save";

// GET /api/jobs — list all jobs with client name
export async function GET() {
  const db = getDb();
  const jobs = db
    .prepare(
      `SELECT j.*, c.name as client_name, c.address
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       ORDER BY j.created_at DESC`
    )
    .all();
  return NextResponse.json(jobs);
}

// POST /api/jobs — create a new job (and client if needed)
// When an address is provided, automatically runs the satellite estimate
// so measurements are ready when the user opens the job.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientName, driveFolderName, address, phone, email, notes, lat, lng } = body;

  if (!clientName) {
    return NextResponse.json({ error: "clientName is required" }, { status: 400 });
  }

  const db = getDb();

  // Geocode if lat/lng not provided but address is
  let geoLat = lat ?? null;
  let geoLng = lng ?? null;
  if (!geoLat && !geoLng && address) {
    try {
      const geo = await geocodeAddress(address);
      if (geo) {
        geoLat = geo.lat;
        geoLng = geo.lng;
      }
    } catch {
      // Non-fatal — continue without coordinates
    }
  }

  // Upsert client
  let client = db
    .prepare("SELECT * FROM clients WHERE name = ? LIMIT 1")
    .get(clientName) as { id: number } | undefined;

  if (!client) {
    const result = db
      .prepare(
        `INSERT INTO clients (name, drive_folder_name, address, phone, email, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        clientName,
        driveFolderName ?? clientName,
        address ?? null,
        phone ?? null,
        email ?? null,
        geoLat,
        geoLng
      );
    client = { id: result.lastInsertRowid as number };
  } else {
    // Update coordinates if we got them and client doesn't have them
    if (geoLat && geoLng) {
      db.prepare("UPDATE clients SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(geoLat, geoLng, client.id);
    }
  }

  // Create job
  const job = db
    .prepare(
      `INSERT INTO jobs (client_id, status, notes)
       VALUES (?, 'created', ?)`
    )
    .run(client.id, notes ?? null);

  const jobId = job.lastInsertRowid as number;

  // ── Auto-run satellite estimate if we have coordinates ──────────
  let satellite = null;
  if (geoLat && geoLng) {
    try {
      const result = await estimateFromSatellite(geoLat, geoLng, 26.57);
      if (result) {
        satellite = saveSatelliteEstimate(db, jobId, result, geoLat, geoLng);
      }
    } catch {
      // Non-fatal — user can still run satellite manually from the job page
    }
  }

  return NextResponse.json({
    id: jobId,
    clientId: client.id,
    lat: geoLat,
    lng: geoLng,
    satellite, // null if no address/geocode/OSM data, or the estimate data
  }, { status: 201 });
}
