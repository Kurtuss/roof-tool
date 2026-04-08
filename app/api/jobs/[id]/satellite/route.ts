/**
 * POST /api/jobs/[id]/satellite
 * Runs the satellite estimate pipeline for a job:
 *  1. Look up client lat/lng (geocode if missing)
 *  2. Query OSM for building footprint
 *  3. Calculate roof area
 *  4. Save to satellite_estimates table
 *  5. If no other measurement exists, create a measurement from satellite
 *
 * POST /api/jobs/[id]/satellite { traced: true, polygon_pixels, meters_per_px, pitch_degrees }
 * Saves a user-traced polygon as the satellite estimate.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocode";
import { estimateFromSatellite, pixelPolygonAreaSqft } from "@/lib/satellite";
import { saveSatelliteEstimate, saveSatelliteMeasurement } from "@/lib/satellite-save";

type Params = { params: Promise<{ id: string }> };

function degreesToBracket(deg: number) {
  if (deg <= 10) return "flat";
  if (deg <= 20) return "low";
  if (deg <= 30) return "medium";
  if (deg <= 40) return "steep";
  return "very_steep";
}

export async function POST(req: NextRequest, { params }: Params) {
  const db    = getDb();
  const jobId = parseInt((await params).id);
  const body  = await req.json();

  // Load job + client
  const row = db
    .prepare(
      `SELECT j.*, c.id as cid, c.name as client_name, c.address, c.lat, c.lng
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.id = ?`
    )
    .get(jobId) as {
      cid: number; client_name: string; address?: string;
      lat?: number; lng?: number;
    } | undefined;

  if (!row) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // ── Traced polygon path ─────────────────────────────────────────
  if (body.traced) {
    const { polygon_pixels, meters_per_px, pitch_degrees = 26.57, lat, lng } = body;

    if (!polygon_pixels || !meters_per_px) {
      return NextResponse.json({ error: "polygon_pixels and meters_per_px required" }, { status: 400 });
    }

    const { areaSqft: footprint, perimeterFt } = pixelPolygonAreaSqft(polygon_pixels, meters_per_px);
    const pitchRad = (pitch_degrees * Math.PI) / 180;
    const roofSqft = +(footprint / Math.cos(pitchRad)).toFixed(1);

    // Save traced estimate
    db.prepare("DELETE FROM satellite_estimates WHERE job_id = ?").run(jobId);
    db.prepare(
      `INSERT INTO satellite_estimates
         (job_id, footprint_sqft, roof_sqft, pitch_degrees, pitch_bracket,
          eave_length_ft, source, polygon_json, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, 'traced', ?, ?, ?)`
    ).run(
      jobId, footprint, roofSqft, pitch_degrees, degreesToBracket(pitch_degrees),
      perimeterFt, JSON.stringify(polygon_pixels),
      lat ?? row.lat ?? null, lng ?? row.lng ?? null
    );

    // Save as measurement
    saveSatelliteMeasurement(db, jobId, roofSqft, pitch_degrees, perimeterFt, "traced");

    return NextResponse.json({
      ok: true,
      source: "traced",
      footprint_sqft: footprint,
      roof_sqft: roofSqft,
      eave_length_ft: perimeterFt,
      pitch_degrees,
    });
  }

  // ── OSM footprint path ──────────────────────────────────────────
  // Accept lat/lng override from "Wrong House" pin correction
  let lat = body.lat ?? row.lat;
  let lng = body.lng ?? row.lng;

  // If user provided corrected coordinates, update client record
  if (body.lat != null && body.lng != null) {
    db.prepare("UPDATE clients SET lat = ?, lng = ? WHERE id = ?").run(body.lat, body.lng, row.cid);
  }

  // Geocode if needed
  if (!lat || !lng) {
    if (!row.address) {
      return NextResponse.json(
        { error: "No address on file — enter an address first" },
        { status: 422 }
      );
    }
    const geo = await geocodeAddress(row.address);
    if (!geo) {
      return NextResponse.json(
        { error: `Could not geocode "${row.address}"` },
        { status: 422 }
      );
    }
    lat = geo.lat;
    lng = geo.lng;

    // Save coordinates on client record
    db.prepare("UPDATE clients SET lat = ?, lng = ? WHERE id = ?").run(lat, lng, row.cid);
  }

  const result = await estimateFromSatellite(lat!, lng!, body.pitch_degrees ?? 26.57);

  if (!result) {
    return NextResponse.json({
      ok: false,
      error: "No building footprint found in OpenStreetMap for this location. Use the Trace Roof tool to draw the outline manually.",
      lat,
      lng,
      needs_tracing: true,
    });
  }

  // Use shared helper to save
  const saved = saveSatelliteEstimate(db, jobId, result, lat!, lng!);

  return NextResponse.json({
    ok: true,
    ...saved,
    lat,
    lng,
  });
}
