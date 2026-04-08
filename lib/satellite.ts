/**
 * Satellite-based roof estimation using OpenStreetMap building footprints.
 *
 * Pipeline:
 *  1. Query Overpass API for building polygons near the geocoded address
 *  2. Pick the closest building to the coordinate
 *  3. Calculate footprint area via Shoelace formula
 *  4. Apply pitch factor to convert footprint → roof area
 *  5. Calculate perimeter → eave/gutter length
 */

import type { PitchBracket } from "@/types";

// ── Types ────────────────────────────────────────────────────────

export interface BuildingFootprint {
  osm_id: string;
  /** Ring of [lat, lng] pairs forming the polygon outline */
  polygon: [number, number][];
  footprint_sqm: number;
  footprint_sqft: number;
  perimeter_m: number;
  perimeter_ft: number;
  centroid: { lat: number; lng: number };
}

export interface SatelliteResult {
  building: BuildingFootprint;
  roof_sqft: number;
  pitch_degrees: number;
  pitch_bracket: PitchBracket;
  eave_length_ft: number;
}

// ── Overpass API ─────────────────────────────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Find building footprints within `radius` meters of a coordinate.
 */
export async function findBuildingFootprints(
  lat: number,
  lng: number,
  radius = 50
): Promise<BuildingFootprint[]> {
  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${radius},${lat},${lng});
      relation["building"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const buildings: BuildingFootprint[] = [];

  for (const el of data.elements ?? []) {
    let ring: [number, number][] = [];

    if (el.type === "way" && el.geometry) {
      ring = el.geometry.map((g: { lat: number; lon: number }) => [g.lat, g.lon]);
    } else if (el.type === "relation" && el.members) {
      // For relations, take the outer ring
      const outer = el.members.find(
        (m: { role: string; geometry?: { lat: number; lon: number }[] }) =>
          m.role === "outer" && m.geometry
      );
      if (outer?.geometry) {
        ring = outer.geometry.map((g: { lat: number; lon: number }) => [g.lat, g.lon]);
      }
    }

    if (ring.length < 3) continue;

    const { area: sqm, perimeter: perimM } = polygonMetrics(ring);
    const centroid = polygonCentroid(ring);

    buildings.push({
      osm_id: String(el.id),
      polygon: ring,
      footprint_sqm: sqm,
      footprint_sqft: sqm * 10.7639,
      perimeter_m: perimM,
      perimeter_ft: perimM * 3.28084,
      centroid,
    });
  }

  // Sort by distance to target coordinate (closest first)
  buildings.sort((a, b) => {
    const dA = haversine(lat, lng, a.centroid.lat, a.centroid.lng);
    const dB = haversine(lat, lng, b.centroid.lat, b.centroid.lng);
    return dA - dB;
  });

  return buildings;
}

/**
 * Run the full satellite estimate for a coordinate.
 * Returns null if no building footprint is found.
 */
export async function estimateFromSatellite(
  lat: number,
  lng: number,
  pitchDegrees = 26.57
): Promise<SatelliteResult | null> {
  // Try progressively larger radii
  for (const radius of [30, 60, 100]) {
    const buildings = await findBuildingFootprints(lat, lng, radius);
    if (buildings.length > 0) {
      const building = buildings[0]; // closest
      const pitchRad = (pitchDegrees * Math.PI) / 180;
      const pitchFactor = 1 / Math.cos(pitchRad);
      const roof_sqft = +(building.footprint_sqft * pitchFactor).toFixed(1);

      return {
        building,
        roof_sqft,
        pitch_degrees: pitchDegrees,
        pitch_bracket: degreesToBracket(pitchDegrees),
        eave_length_ft: +building.perimeter_ft.toFixed(1),
      };
    }
  }
  return null;
}

// ── Geometry helpers ─────────────────────────────────────────────

/**
 * Shoelace formula for polygon area + perimeter in meters.
 * Input: ring of [lat, lng] pairs.
 * Uses local flat-earth projection from the centroid.
 */
function polygonMetrics(ring: [number, number][]): { area: number; perimeter: number } {
  if (ring.length < 3) return { area: 0, perimeter: 0 };

  // Project to local meters from centroid
  const cLat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cLng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const points = ring.map((p) => latLngToMeters(p[0], p[1], cLat, cLng));

  // Shoelace area
  let area = 0;
  let perimeter = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  area = Math.abs(area) / 2;

  return { area, perimeter };
}

function polygonCentroid(ring: [number, number][]): { lat: number; lng: number } {
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lat, lng };
}

/**
 * Convert lat/lng to local XY meters relative to a reference point.
 */
function latLngToMeters(
  lat: number, lng: number,
  refLat: number, refLng: number
): [number, number] {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat - refLat) * Math.PI) / 180;
  const dLng = ((lng - refLng) * Math.PI) / 180;
  const x = dLng * R * Math.cos((refLat * Math.PI) / 180);
  const y = dLat * R;
  return [x, y];
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Pitch helpers ────────────────────────────────────────────────

function degreesToBracket(deg: number): PitchBracket {
  if (deg <= 10) return "flat";
  if (deg <= 20) return "low";
  if (deg <= 30) return "medium";
  if (deg <= 40) return "steep";
  return "very_steep";
}

// ── Satellite tile URL ───────────────────────────────────────────

/**
 * Get the Esri World Imagery tile URL for a lat/lng at a zoom level.
 * Returns the tile URL and pixel offset within the tile.
 */
export function getSatelliteTileInfo(lat: number, lng: number, zoom = 19) {
  const n = 2 ** zoom;
  const xTile = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const yTile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

  // Meters per pixel at this zoom level and latitude
  const metersPerPx = (40075016.686 * Math.cos(latRad)) / (256 * n);

  return { xTile, yTile, zoom, metersPerPx };
}

/**
 * Build a URL for an Esri satellite tile.
 */
export function esriTileUrl(z: number, y: number, x: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

/**
 * Calculate polygon area from pixel coordinates + meters_per_pixel.
 * Input: array of [x, y] pixel coordinates.
 * Returns area in sq ft.
 */
export function pixelPolygonAreaSqft(
  points: [number, number][],
  metersPerPx: number
): { areaSqft: number; perimeterFt: number } {
  if (points.length < 3) return { areaSqft: 0, perimeterFt: 0 };

  let area = 0;
  let perimeter = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  area = Math.abs(area) / 2; // pixels²
  const areaSqm = area * metersPerPx * metersPerPx;
  const perimeterM = perimeter * metersPerPx;

  return {
    areaSqft: +(areaSqm * 10.7639).toFixed(1),
    perimeterFt: +(perimeterM * 3.28084).toFixed(1),
  };
}
