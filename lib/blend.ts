/**
 * Blends satellite and drone measurements using a weighted average.
 *
 * Default: 70% drone / 30% satellite.
 * If only one source exists, uses it at 100%.
 */

import type { PitchBracket } from "@/types";

export interface MeasurementValues {
  total_sqft: number;
  pitch_degrees: number;
  eave_length_ft: number;
  ridge_length_ft: number;
  valley_length_ft: number;
}

export interface BlendedResult extends MeasurementValues {
  pitch_bracket: PitchBracket;
  complexity_score: number;
  source: "blended" | "satellite" | "drone";
}

const DRONE_WEIGHT = 0.70;
const SAT_WEIGHT   = 0.30;

/**
 * Blend two measurement sources.
 * Pass null for either source to use the other at 100%.
 */
export function blendMeasurements(
  satellite: MeasurementValues | null,
  drone: MeasurementValues | null
): BlendedResult | null {
  if (!satellite && !drone) return null;

  if (!drone && satellite) {
    return {
      ...satellite,
      pitch_bracket: degreesToBracket(satellite.pitch_degrees),
      complexity_score: 1.0,
      source: "satellite",
    };
  }

  if (!satellite && drone) {
    return {
      ...drone,
      pitch_bracket: degreesToBracket(drone.pitch_degrees),
      complexity_score: computeComplexity(drone),
      source: "drone",
    };
  }

  // Both exist — blend
  const sat = satellite!;
  const drn = drone!;

  const blended: MeasurementValues = {
    total_sqft:       round(drn.total_sqft      * DRONE_WEIGHT + sat.total_sqft      * SAT_WEIGHT),
    pitch_degrees:    round(drn.pitch_degrees    * DRONE_WEIGHT + sat.pitch_degrees    * SAT_WEIGHT),
    eave_length_ft:   round(drn.eave_length_ft   * DRONE_WEIGHT + sat.eave_length_ft   * SAT_WEIGHT),
    ridge_length_ft:  round(drn.ridge_length_ft  * DRONE_WEIGHT + sat.ridge_length_ft  * SAT_WEIGHT),
    valley_length_ft: round(drn.valley_length_ft * DRONE_WEIGHT + sat.valley_length_ft * SAT_WEIGHT),
  };

  return {
    ...blended,
    pitch_bracket: degreesToBracket(blended.pitch_degrees),
    complexity_score: computeComplexity(blended),
    source: "blended",
  };
}

function round(v: number): number {
  return +v.toFixed(1);
}

function degreesToBracket(deg: number): PitchBracket {
  if (deg <= 10) return "flat";
  if (deg <= 20) return "low";
  if (deg <= 30) return "medium";
  if (deg <= 40) return "steep";
  return "very_steep";
}

function computeComplexity(m: MeasurementValues): number {
  // Simple heuristic: more valley/ridge relative to eave → more complex
  if (m.eave_length_ft <= 0) return 1.0;
  const ratio = (m.ridge_length_ft + m.valley_length_ft) / m.eave_length_ft;
  return +Math.max(1.0, Math.min(1.0 + ratio * 0.3, 1.5)).toFixed(2);
}
