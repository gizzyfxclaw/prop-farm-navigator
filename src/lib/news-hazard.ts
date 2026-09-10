/**
 * Unified news hazard classification.
 * 
 * Used by Calendar, Coach (GlobalRiskSentinel), RulesAlertPanel, and Engine pages.
 * All pages must use the SAME logic so they never disagree.
 * 
 * Rules (symmetric — blocks both BEFORE and AFTER event):
 * - HIGH impact ≤ 30 min (before or after) → "critical"  (DO NOT TRADE)
 * - HIGH impact ≤ 2 hr (before) or ≤ 30 min (after) → "warning"   (DO NOT TRADE)
 * - HIGH impact ≤ 3 hr (before)  → "caution"   (trade with caution)
 * - MEDIUM impact ≤ 30 min (before or after) → "warning"  (DO NOT TRADE)
 * - MEDIUM impact ≤ 2 hr (before)  → "caution"   (trade with caution)
 * - Otherwise             → "safe"
 */

export type HazardLevel = "critical" | "warning" | "caution" | "safe";

export function classifyHazard(seconds: number, impact: "high" | "medium" | "low"): HazardLevel {
  const abs = Math.abs(seconds);
  const min = abs / 60;
  
  // HIGH impact: block 30 min before AND 30 min after
  if (impact === "high" && min <= 30) return "critical";
  // HIGH impact: block 2 hr before AND 30 min after
  if (impact === "high" && (seconds > 0 && min <= 120 || seconds < 0 && min <= 30)) return "warning";
  // HIGH impact: caution 3 hr before
  if (impact === "high" && seconds > 0 && min <= 180) return "caution";
  // MEDIUM impact: block 30 min before AND 30 min after
  if (impact === "medium" && min <= 30) return "warning";
  // MEDIUM impact: caution 2 hr before
  if (impact === "medium" && seconds > 0 && min <= 120) return "caution";
  return "safe";
}

export interface NewsEvent {
  id: string;
  impact: "high" | "medium" | "low";
  event: string;
  datetime: number;
  pairs: string[];
}

export interface ClassifiedEvent extends NewsEvent {
  secondsUntil: number;
  hazardLevel: HazardLevel;
}

/**
 * Classify all events and add secondsUntil + hazardLevel.
 */
export function classifyEvents(events: NewsEvent[], nowSec: number): ClassifiedEvent[] {
  return events.map((e) => {
    const secondsUntil = Math.floor(e.datetime - nowSec);
    return {
      ...e,
      secondsUntil,
      hazardLevel: classifyHazard(secondsUntil, e.impact),
    };
  });
}

/**
 * Get the overall trading status from classified events.
 * Returns the most severe hazard level across all events.
 */
export function getOverallHazard(events: ClassifiedEvent[]): {
  level: HazardLevel;
  critical: ClassifiedEvent[];
  warning: ClassifiedEvent[];
  caution: ClassifiedEvent[];
} {
  const critical = events.filter((e) => e.hazardLevel === "critical");
  const warning = events.filter((e) => e.hazardLevel === "warning");
  const caution = events.filter((e) => e.hazardLevel === "caution");

  let level: HazardLevel = "safe";
  if (critical.length > 0) level = "critical";
  else if (warning.length > 0) level = "warning";
  else if (caution.length > 0) level = "caution";

  return { level, critical, warning, caution };
}
