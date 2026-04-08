/**
 * Shared helper to save a satellite estimate result to the database.
 * Used by both:
 *  - POST /api/jobs (auto-run on creation)
 *  - POST /api/jobs/[id]/satellite (manual re-run)
 */

import { getDb } from "@/lib/db";
import type { SatelliteResult } from "@/lib/satellite";

function degreesToBracket(deg: number) {
  if (deg <= 10) return "flat";
  if (deg <= 20) return "low";
  if (deg <= 30) return "medium";
  if (deg <= 40) return "steep";
  return "very_steep";
}

/**
 * Persist a SatelliteResult to satellite_estimates + measurements tables.
 * Returns the saved data for response use.
 */
export function saveSatelliteEstimate(
  db: ReturnType<typeof getDb>,
  jobId: number,
  result: SatelliteResult,
  lat: number,
  lng: number
) {
  // Save satellite estimate row
  db.prepare("DELETE FROM satellite_estimates WHERE job_id = ?").run(jobId);
  db.prepare(
    `INSERT INTO satellite_estimates
       (job_id, footprint_sqft, roof_sqft, pitch_degrees, pitch_bracket,
        eave_length_ft, osm_building_id, source, polygon_json, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'osm', ?, ?, ?)`
  ).run(
    jobId,
    result.building.footprint_sqft,
    result.roof_sqft,
    result.pitch_degrees,
    result.pitch_bracket,
    result.eave_length_ft,
    result.building.osm_id,
    JSON.stringify(result.building.polygon),
    lat,
    lng
  );

  // Save as measurement (only if no drone/manual/blended exists)
  saveSatelliteMeasurement(db, jobId, result.roof_sqft, result.pitch_degrees, result.eave_length_ft, "satellite");

  return {
    source: "osm" as const,
    footprint_sqft: +result.building.footprint_sqft.toFixed(1),
    roof_sqft: result.roof_sqft,
    eave_length_ft: result.eave_length_ft,
    pitch_degrees: result.pitch_degrees,
    osm_building_id: result.building.osm_id,
  };
}

/**
 * Save a satellite-derived measurement (or update if one exists).
 * Only sets the "active" measurement if no drone/manual/blended measurement exists.
 */
export function saveSatelliteMeasurement(
  db: ReturnType<typeof getDb>,
  jobId: number,
  roofSqft: number,
  pitchDeg: number,
  eaveFt: number,
  source: string
) {
  const existing = db
    .prepare("SELECT source FROM measurements WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(jobId) as { source: string } | undefined;

  if (!existing || existing.source === "satellite" || existing.source === "traced") {
    db.prepare("DELETE FROM measurements WHERE job_id = ? AND source IN ('satellite', 'traced')").run(jobId);
    db.prepare(
      `INSERT INTO measurements
         (job_id, source, total_sqft, pitch_degrees, pitch_bracket,
          ridge_length_ft, eave_length_ft, valley_length_ft, complexity_score)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, 1.0)`
    ).run(jobId, source, roofSqft, pitchDeg, degreesToBracket(pitchDeg), eaveFt);

    db.prepare(
      "UPDATE jobs SET status = 'quote_ready' WHERE id = ? AND status = 'created'"
    ).run(jobId);
  }
}
