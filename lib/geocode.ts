/**
 * Geocoding via OpenStreetMap Nominatim (free, no API key).
 * Rate limit: 1 req/sec — acceptable for job creation.
 */

export interface GeoResult {
  lat: number;
  lng: number;
  display_name: string;
  osm_id: string;
}

/**
 * Geocode a street address to lat/lng.
 * Returns null if the address cannot be resolved.
 */
export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "RoofTool/1.0 (roofing-quote-app)",
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
    osm_id: string;
  }[];

  if (data.length === 0) return null;

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    display_name: data[0].display_name,
    osm_id: data[0].osm_id,
  };
}
