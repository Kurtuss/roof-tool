/**
 * Quote Engine
 * ─────────────────────────────────────────────────────────────────
 * Pricing (all configurable via Settings page):
 *   Reroof          $10.00 / sq ft  (area × pitch multiplier)
 *   Roof Spray       $1.00 / sq ft  (area only — sprays don't change by pitch)
 *   Roof Tune-Up     $0.15 / sq ft  (area only)
 *   Gutter Clean     $0.40 / lin ft (eave length)
 *
 * Pitch multipliers (reroof only):
 *   Flat   0–10°   ×1.00
 *   Low   10–20°   ×1.10
 *   Medium 20–30°  ×1.25
 *   Steep  30–40°  ×1.45
 *   Very  40°+     ×1.70
 *
 * Supports multi-service quotes: pass an array of ServiceType to
 * buildMultiServiceQuote() and all line items are combined on one quote.
 */

import {
  ServiceType,
  Measurement,
  PricingConfig,
  QuoteLineItem,
  Quote,
  PitchBracket,
  DEFAULT_PRICING,
} from "@/types";
import { getDb } from "@/lib/db";

// ── Helper: determine pitch bracket ─────────────────────────────
export function pitchBracket(degrees: number): PitchBracket {
  if (degrees < 10) return "flat";
  if (degrees < 20) return "low";
  if (degrees < 30) return "medium";
  if (degrees < 40) return "steep";
  return "very_steep";
}

// ── Helper: get pitch multiplier from config ─────────────────────
function pitchMultiplier(bracket: PitchBracket, cfg: PricingConfig): number {
  const map: Record<PitchBracket, number> = {
    flat:       cfg.pitch_flat,
    low:        cfg.pitch_low,
    medium:     cfg.pitch_medium,
    steep:      cfg.pitch_steep,
    very_steep: cfg.pitch_very_steep,
  };
  return map[bracket];
}

// ── Build line items for a single service ────────────────────────
function buildServiceLines(
  serviceType: ServiceType,
  measurement: Measurement,
  cfg: PricingConfig
): QuoteLineItem[] {
  const lines: QuoteLineItem[] = [];
  const { total_sqft, eave_length_ft, pitch_bracket } = measurement;
  const bracket = pitch_bracket as PitchBracket;

  switch (serviceType) {
    case "reroof": {
      const multiplier = pitchMultiplier(bracket, cfg);
      const baseRate = cfg.reroof_per_sqft;
      const effectiveRate = +(baseRate * multiplier).toFixed(4);

      lines.push({
        label: "Roof removal & replacement",
        unit: "sq ft",
        quantity: +total_sqft.toFixed(2),
        unit_price: effectiveRate,
        subtotal: +(total_sqft * effectiveRate).toFixed(2),
      });

      if (multiplier !== 1.0) {
        lines.push({
          label: `  Pitch adjustment (${bracket.replace("_", " ")} roof ×${multiplier})`,
          unit: "—",
          quantity: 0,
          unit_price: 0,
          subtotal: 0,
        });
      }
      break;
    }

    case "spray": {
      lines.push({
        label: "Roof spray / protective coating",
        unit: "sq ft",
        quantity: +total_sqft.toFixed(2),
        unit_price: cfg.spray_per_sqft,
        subtotal: +(total_sqft * cfg.spray_per_sqft).toFixed(2),
      });
      break;
    }

    case "tuneup": {
      lines.push({
        label: "Roof tune-up & inspection",
        unit: "sq ft",
        quantity: +total_sqft.toFixed(2),
        unit_price: cfg.tuneup_per_sqft,
        subtotal: +(total_sqft * cfg.tuneup_per_sqft).toFixed(2),
      });
      break;
    }

    case "gutter_clean": {
      lines.push({
        label: "Gutter clean",
        unit: "lin ft",
        quantity: +eave_length_ft.toFixed(2),
        unit_price: cfg.gutter_clean_per_linft,
        subtotal: +(eave_length_ft * cfg.gutter_clean_per_linft).toFixed(2),
      });
      break;
    }
  }

  return lines;
}

// ── Multi-service quote builder ──────────────────────────────────
// Pass one or more service types. All line items are combined into
// a single quote with one subtotal, one tax, one total.
export function buildMultiServiceQuote(
  jobId: number,
  serviceTypes: ServiceType[],
  measurement: Measurement,
  cfg: PricingConfig
): Omit<Quote, "id" | "created_at"> {
  const allLines: QuoteLineItem[] = [];

  for (const svc of serviceTypes) {
    const svcLines = buildServiceLines(svc, measurement, cfg);
    allLines.push(...svcLines);
  }

  const subtotal = +allLines.reduce((sum, l) => sum + l.subtotal, 0).toFixed(2);
  const tax = +(subtotal * cfg.tax_rate).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  return {
    job_id: jobId,
    service_types: serviceTypes,
    line_items: allLines,
    subtotal,
    tax_rate: cfg.tax_rate,
    tax,
    total,
    status: "draft",
  };
}

// ── Convenience: single-service quote (calls multi internally) ───
export function buildQuote(
  jobId: number,
  serviceType: ServiceType,
  measurement: Measurement,
  cfg: PricingConfig
): Omit<Quote, "id" | "created_at"> {
  return buildMultiServiceQuote(jobId, [serviceType], measurement, cfg);
}

// ── Load pricing config from the DB ─────────────────────────────
export function loadPricingConfig(): PricingConfig {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));

  const num = (key: string, fallback: number): number => {
    const val = map[key];
    if (val === undefined || val === null) return fallback;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  };

  return {
    reroof_per_sqft:        num("reroof_per_sqft",        DEFAULT_PRICING.reroof_per_sqft),
    spray_per_sqft:         num("spray_per_sqft",         DEFAULT_PRICING.spray_per_sqft),
    tuneup_per_sqft:        num("tuneup_per_sqft",        DEFAULT_PRICING.tuneup_per_sqft),
    gutter_clean_per_linft: num("gutter_clean_per_linft", DEFAULT_PRICING.gutter_clean_per_linft),
    pitch_flat:             num("pitch_flat",             DEFAULT_PRICING.pitch_flat),
    pitch_low:              num("pitch_low",              DEFAULT_PRICING.pitch_low),
    pitch_medium:           num("pitch_medium",           DEFAULT_PRICING.pitch_medium),
    pitch_steep:            num("pitch_steep",            DEFAULT_PRICING.pitch_steep),
    pitch_very_steep:       num("pitch_very_steep",       DEFAULT_PRICING.pitch_very_steep),
    tax_rate:               num("tax_rate",               DEFAULT_PRICING.tax_rate),
  };
}
