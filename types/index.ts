// ── Job lifecycle ────────────────────────────────────────────────
export type JobStatus =
  | "created"
  | "fetching_images"
  | "processing"
  | "measuring"
  | "quote_ready"
  | "quote_sent"
  | "failed";

// ── Service types ────────────────────────────────────────────────
export type ServiceType = "reroof" | "spray" | "tuneup" | "gutter_clean";

export const SERVICE_LABELS: Record<ServiceType, string> = {
  reroof: "Full Reroof",
  spray: "Roof Spray / Coating",
  tuneup: "Roof Tune-Up",
  gutter_clean: "Gutter Clean",
};

// ── Pitch brackets ───────────────────────────────────────────────
export type PitchBracket = "flat" | "low" | "medium" | "steep" | "very_steep";

export const PITCH_LABELS: Record<PitchBracket, string> = {
  flat: "Flat (0–10°)",
  low: "Low (10–20°)",
  medium: "Medium (20–30°)",
  steep: "Steep (30–40°)",
  very_steep: "Very Steep (40°+)",
};

// ── Core models ──────────────────────────────────────────────────
export interface Client {
  id: number;
  name: string;
  drive_folder_name: string;
  address?: string;
  phone?: string;
  email?: string;
  lat?: number;
  lng?: number;
  created_at: string;
}

export type MeasurementSource = "manual" | "satellite" | "drone" | "blended" | "traced";

export interface SatelliteEstimate {
  id: number;
  job_id: number;
  footprint_sqft: number;
  roof_sqft: number;
  pitch_degrees: number;
  pitch_bracket: PitchBracket;
  eave_length_ft: number;
  osm_building_id?: string;
  source: "osm" | "traced";
  polygon_json?: string;
  lat?: number;
  lng?: number;
  created_at: string;
}

export interface Job {
  id: number;
  client_id: number;
  client_name?: string; // joined
  status: JobStatus;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface JobImage {
  id: number;
  job_id: number;
  drive_file_id: string;
  angle: "aerial" | "north" | "south" | "east" | "west" | "other";
  filename: string;
  thumbnail_url?: string;
  exif_lat?: number;
  exif_lng?: number;
  exif_altitude?: number;
  exif_gimbal_angle?: number;
}

export interface Measurement {
  id: number;
  job_id: number;
  source: MeasurementSource;
  total_sqft: number;         // converted from m²
  pitch_degrees: number;
  pitch_bracket: PitchBracket;
  ridge_length_ft: number;    // converted from m
  eave_length_ft: number;     // gutter length — used for gutter_clean
  valley_length_ft: number;
  complexity_score: number;   // 1.0 – 1.5 scale
  odm_task_id?: string;
  created_at: string;
}

export interface QuoteLineItem {
  label: string;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Quote {
  id: number;
  job_id: number;
  service_types: ServiceType[];  // one or more services on the same quote
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax: number;
  total: number;
  status: "draft" | "sent";
  created_at: string;
}

// ── Pricing config (stored in settings table) ────────────────────
export interface PricingConfig {
  // Base rates
  reroof_per_sqft: number;        // default 10.00
  spray_per_sqft: number;         // default 1.00
  tuneup_per_sqft: number;        // default 0.15
  gutter_clean_per_linft: number; // default 0.40

  // Pitch multipliers
  pitch_flat: number;             // default 1.00
  pitch_low: number;              // default 1.10
  pitch_medium: number;           // default 1.25
  pitch_steep: number;            // default 1.45
  pitch_very_steep: number;       // default 1.70

  // Tax
  tax_rate: number;               // default 0.00 (e.g. 0.05 = 5%)
}

export const DEFAULT_PRICING: PricingConfig = {
  reroof_per_sqft: 10.00,
  spray_per_sqft: 1.00,
  tuneup_per_sqft: 0.15,
  gutter_clean_per_linft: 0.40,
  pitch_flat: 1.00,
  pitch_low: 1.10,
  pitch_medium: 1.25,
  pitch_steep: 1.45,
  pitch_very_steep: 1.70,
  tax_rate: 0.00,
};
