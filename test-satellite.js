/**
 * Quick test of satellite estimation logic.
 * Run: node test-satellite.js
 */

// Test the geocode + overpass pipeline with a known address
async function testGeocode() {
  const address = "1600 Pennsylvania Avenue NW, Washington, DC";
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "RoofTool/1.0 (test)" },
  });
  const data = await res.json();

  if (data.length === 0) {
    console.log("FAIL: geocode returned no results");
    return null;
  }

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  console.log(`✓ Geocoded "${address}" → ${lat}, ${lng}`);
  return { lat, lng };
}

async function testOverpass(lat, lng) {
  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:50,${lat},${lng});
    );
    out geom;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  const data = await res.json();
  const count = (data.elements ?? []).length;
  console.log(`✓ Overpass found ${count} building(s) near ${lat}, ${lng}`);

  if (count > 0) {
    const el = data.elements[0];
    const ring = el.geometry?.map(g => [g.lat, g.lon]) ?? [];
    console.log(`  First building: OSM ID ${el.id}, ${ring.length} vertices`);

    // Test area calculation (Shoelace)
    if (ring.length >= 3) {
      const area = shoelaceArea(ring);
      console.log(`  Footprint area: ${area.toFixed(1)} m² (${(area * 10.7639).toFixed(0)} sq ft)`);
    }
  }

  return count;
}

function shoelaceArea(ring) {
  const cLat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cLng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const R = 6371000;

  const points = ring.map(([lat, lng]) => {
    const dLat = ((lat - cLat) * Math.PI) / 180;
    const dLng = ((lng - cLng) * Math.PI) / 180;
    return [dLng * R * Math.cos((cLat * Math.PI) / 180), dLat * R];
  });

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

function testPixelArea() {
  // Simulate a 100x100 pixel square at zoom 19, mid-latitude
  const points = [[0,0], [100,0], [100,100], [0,100]];
  const metersPerPx = 0.3; // ~0.3m/px at zoom 19

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  area = Math.abs(area) / 2;
  const sqm = area * metersPerPx * metersPerPx;
  const sqft = sqm * 10.7639;

  console.log(`✓ Pixel area test: 100x100 px @ ${metersPerPx}m/px = ${sqm.toFixed(1)} m² = ${sqft.toFixed(0)} sq ft`);
  // Expected: 100*100*0.3*0.3 = 900 m² = ~9688 sq ft

  const expected = 100 * 100 * metersPerPx * metersPerPx;
  if (Math.abs(sqm - expected) < 0.1) {
    console.log("  ✓ Area calculation correct");
  } else {
    console.log(`  ✗ Expected ${expected}, got ${sqm}`);
  }
}

function testPitchFactor() {
  // At 22° pitch, roof area = footprint / cos(22°)
  const pitch = 22;
  const footprint = 1500; // sq ft
  const factor = 1 / Math.cos((pitch * Math.PI) / 180);
  const roofArea = footprint * factor;

  console.log(`✓ Pitch factor test: ${footprint} sqft footprint at ${pitch}° = ${roofArea.toFixed(0)} sqft roof area (factor: ${factor.toFixed(3)})`);
  // cos(22°) ≈ 0.927, so factor ≈ 1.079

  if (factor > 1.07 && factor < 1.09) {
    console.log("  ✓ Pitch factor correct");
  } else {
    console.log(`  ✗ Expected ~1.079, got ${factor}`);
  }
}

function testBlend() {
  const sat = { total_sqft: 2000, pitch_degrees: 22, eave_length_ft: 150, ridge_length_ft: 0, valley_length_ft: 0 };
  const drone = { total_sqft: 2200, pitch_degrees: 25, eave_length_ft: 140, ridge_length_ft: 30, valley_length_ft: 10 };

  // 70% drone + 30% satellite
  const blended = {
    total_sqft: drone.total_sqft * 0.7 + sat.total_sqft * 0.3,
    pitch_degrees: drone.pitch_degrees * 0.7 + sat.pitch_degrees * 0.3,
    eave_length_ft: drone.eave_length_ft * 0.7 + sat.eave_length_ft * 0.3,
  };

  console.log(`✓ Blend test: sat=${sat.total_sqft}, drone=${drone.total_sqft} → blended=${blended.total_sqft.toFixed(0)} sqft`);
  console.log(`  Pitch: sat=${sat.pitch_degrees}°, drone=${drone.pitch_degrees}° → blended=${blended.pitch_degrees.toFixed(1)}°`);

  // Expected: 2200*0.7 + 2000*0.3 = 1540 + 600 = 2140
  if (Math.abs(blended.total_sqft - 2140) < 1) {
    console.log("  ✓ Blend calculation correct");
  } else {
    console.log(`  ✗ Expected 2140, got ${blended.total_sqft}`);
  }
}

async function main() {
  console.log("=== Satellite Estimation Tests ===\n");

  testPixelArea();
  testPitchFactor();
  testBlend();

  console.log("\n--- Live API Tests ---\n");

  const geo = await testGeocode();
  if (geo) {
    await testOverpass(geo.lat, geo.lng);
  }

  console.log("\n=== All tests complete ===");
}

main().catch(console.error);
