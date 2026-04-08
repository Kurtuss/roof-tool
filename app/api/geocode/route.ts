/**
 * GET /api/geocode?address=...
 * Geocodes an address to lat/lng using Nominatim.
 */
import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address param required" }, { status: 400 });
  }

  const result = await geocodeAddress(address);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    lat: result.lat,
    lng: result.lng,
    display_name: result.display_name,
  });
}
