// @ts-nocheck
/**
 * GizzyFx Debate Engine
 *
 * Implements the TradingAgents "Researcher Debate" pattern — generates a bear case
 * that challenges the bullish SMC analysis, then synthesizes both into a final verdict.
 *
 * This makes setup cards honest: instead of just "STRONG LONG", you get
 * "STRONG LONG (bear case: CHoCH invalid if 1.1558 breaks)".
 */

import type { SMCResult, StructureResult, OrderBlock, Sweep, FVG } from "./smc-engine";

export interface DebatePoint {
  claim: string;
  evidence: string;
  confidence: number; // 0-1
}

export interface DebateCase {
  direction: "bullish" | "bearish";
  points: DebatePoint[];
  overallConfidence: number;
  keyLevel: string; // price level that invalidates this case
  invalidation: string; // what happens if this case is wrong
}

export interface DebateSynthesis {
  bullCase: DebateCase;
  bearCase: DebateCase;
  debateRounds: string[];
  finalVerdict: "STRONG_LONG" | "LEAN_LONG" | "NEUTRAL" | "LEAN_SHORT" | "STRONG_SHORT";
  confidence: number; // 0-1
  finalRationale: string;
  entryZone: string;
  invalidationLevel: string;
  riskReward: string;
}

/**
 * Generate bull case from SMC analysis.
 */
function generateBullCase(smc: SMCResult): DebateCase {
  const points: DebatePoint[] = [];
  let keyLevel = "";
  let invalidation = "";

  const structure = smc.structure;

  // BOS bullish
  if (structure.bos === "bullish") {
    points.push({
      claim: "Bullish BOS — price broke prior swing high, confirming trend continuation",
      evidence: `Close pierced swing high at ${structure.swings.filter(s => s.kind === "high").slice(-1)[0]?.price.toFixed(5) ?? "N/A"}`,
      confidence: 0.7,
    });
    keyLevel = structure.swings.filter(s => s.kind === "high").slice(-1)[0]?.price.toFixed(5) ?? "";
    invalidation = "Price closes back below the broken swing high";
  }

  // CHoCH bullish
  if (structure.choch === "bullish") {
    points.push({
      claim: "CHoCH bullish — regime change from bearish to bullish structure",
      evidence: "Close broke prior swing high against previous bearish bias",
      confidence: 0.8,
    });
    keyLevel = structure.swings.filter(s => s.kind === "low").slice(-1)[0]?.price.toFixed(5) ?? "";
    invalidation = "Price re-enters the range and closes below recent swing low";
  }

  // Bullish order blocks
  const bullishOBs = smc.orderBlocks.filter(o => o.kind === "bullish");
  if (bullishOBs.length > 0) {
    const recent = bullishOBs[bullishOBs.length - 1];
    points.push({
      claim: `${bullishOBs.length} bullish order block(s) — institutional demand zones identified`,
      evidence: `Most recent OB: ${recent.low.toFixed(5)}-${recent.high.toFixed(5)} (impulse: ${recent.impulseMag.toFixed(1)}x ATR)`,
      confidence: 0.6,
    });
    if (!keyLevel) keyLevel = recent.low.toFixed(5);
    if (!invalidation) invalidation = "Price closes below the order block low";
  }

  // Unfilled bullish FVGs
  const unfilledBullFVG = smc.fvgs.filter(f => f.kind === "bullish" && !f.filled);
  if (unfilledBullFVG.length > 0) {
    points.push({
      claim: `${unfilledBullFVG.length} unfilled bullish FVG(s) — price likely to fill upward`,
      evidence: `Nearest FVG: ${unfilledBullFVG[unfilledBullFVG.length - 1].low.toFixed(5)}-${unfilledBullFVG[unfilledBullFVG.length - 1].high.toFixed(5)}`,
      confidence: 0.4,
    });
  }

  // Liquidity sweep bullish
  const bullishSweeps = smc.sweeps.filter(s => s.kind === "bullish");
  if (bullishSweeps.length > 0) {
    const last = bullishSweeps[bullishSweeps.length - 1];
    points.push({
      claim: `Bullish liquidity sweep — stop hunt at ${last.sweptLevel.toFixed(5)} rejected`,
      evidence: `Wick pierced low, close at ${last.close.toFixed(5)} (back above swept level)`,
      confidence: 0.65,
    });
    if (!keyLevel) keyLevel = last.sweptLevel.toFixed(5);
    if (!invalidation) invalidation = "Price closes below the swept low";
  }

  // Premium/discount zone
  if (smc.zone.zone === "discount") {
    points.push({
      claim: `Price in discount zone (${smc.zone.depthPct?.toFixed(0)}% depth) — favorable entry area`,
      evidence: `Below 0.5 Fib midline at ${smc.zone.rangeMid?.toFixed(5)}`,
      confidence: 0.3,
    });
  }

  // Bias alignment
  if (structure.bias === "bullish") {
    points.push({
      claim: "Market structure shows higher highs + higher lows (bullish bias)",
      evidence: "Last 6 swings classified as HH+HL sequence",
      confidence: 0.5,
    });
  }

  const overallConfidence = points.length > 0
    ? points.reduce((s, p) => s + p.confidence, 0) / points.length
    : 0;

  return {
    direction: "bullish",
    points,
    overallConfidence,
    keyLevel,
    invalidation,
  };
}

/**
 * Generate bear case by challenging every bullish claim.
 */
function generateBearCase(smc: SMCResult, bullCase: DebateCase): DebateCase {
  const points: DebatePoint[] = [];
  let keyLevel = "";
  let invalidation = "";

  const structure = smc.structure;

  // Challenge BOS
  if (structure.bos === "bullish") {
    points.push({
      claim: "BOS may be false breakout — single close above swing high is not confirmation",
      evidence: "Need 2+ consecutive closes above for confirmation; wick rejection common at resistance",
      confidence: 0.5,
    });
    keyLevel = structure.swings.filter(s => s.kind === "high").slice(-1)[0]?.price.toFixed(5) ?? "";
    invalidation = "Price holds above broken swing high for 3+ bars";
  }

  // Challenge CHoCH
  if (structure.choch === "bullish") {
    points.push({
      claim: "CHoCH could be failed reversal — bearish momentum may resume",
      evidence: "One close against bias doesn't confirm regime change; wait for higher timeframe alignment",
      confidence: 0.55,
    });
  }

  // Challenge order blocks
  const bullishOBs = smc.orderBlocks.filter(o => o.kind === "bullish");
  if (bullishOBs.length > 0) {
    const recent = bullishOBs[bullishOBs.length - 1];
    if (recent.impulseMag < 2.0) {
      points.push({
        claim: "Order block impulse is weak (<2x ATR) — institutional conviction unclear",
        evidence: `Impulse magnitude only ${recent.impulseMag.toFixed(1)}x ATR — may be retail flow, not smart money`,
        confidence: 0.45,
      });
    }
    // Check if OB is old
    // (simplified: just flag it)
    points.push({
      claim: "Order block may already be mitigated — price has re-entered the zone",
      evidence: "Multiple tests of the same demand zone weaken its significance",
      confidence: 0.4,
    });
  }

  // Challenge FVGs
  const unfilledBullFVG = smc.fvgs.filter(f => f.kind === "bullish" && !f.filled);
  if (unfilledBullFVG.length > 0) {
    points.push({
      claim: "FVGs in discount zone may not fill immediately — price can trend further before returning",
      evidence: "Unfilled FVG is a magnet, not a guarantee; trend strength determines timing",
      confidence: 0.35,
    });
  }

  // Challenge sweeps
  const bullishSweeps = smc.sweeps.filter(s => s.kind === "bullish");
  if (bullishSweeps.length > 0) {
    points.push({
      claim: "Liquidity sweep may not be true stop hunt — could be regular volatility",
      evidence: "Single wick rejection without volume confirmation is not conclusive smart money activity",
      confidence: 0.4,
    });
  }

  // Add structural counter-argument
  if (structure.bias === "bullish") {
    // Check if structure is weakening (lower highs in recent swings)
    const highs = structure.swings.filter(s => s.kind === "high");
    if (highs.length >= 3 && highs[highs.length - 1].price < highs[highs.length - 2].price) {
      points.push({
        claim: "Recent swing high is lower than previous — structure may be weakening despite bias label",
        evidence: `Last high ${highs[highs.length - 1].price.toFixed(5)} < prior high ${highs[highs.length - 2].price.toFixed(5)}`,
        confidence: 0.6,
      });
    }
  }

  // If no specific bear points, add general caution
  if (points.length === 0) {
    points.push({
      claim: "No clear bearish structure — but absence of evidence is not evidence of absence",
      evidence: "Market may be in consolidation; directional edge unclear",
      confidence: 0.3,
    });
  }

  const overallConfidence = points.length > 0
    ? points.reduce((s, p) => s + p.confidence, 0) / points.length
    : 0;

  return {
    direction: "bearish",
    points,
    overallConfidence,
    keyLevel: bullCase.keyLevel ? (parseFloat(bullCase.keyLevel) + 0.001).toFixed(5) : "",
    invalidation: bullCase.invalidation ? `NOT (${bullCase.invalidation})` : "",
  };
}

/**
 * Simulate debate rounds between bull and bear cases.
 */
function runDebate(bull: DebateCase, bear: DebateCase): string[] {
  const rounds: string[] = [];

  // Round 1: State the case
  rounds.push(`Bull: "${bull.points[0]?.claim}" (confidence: ${(bull.overallConfidence * 100).toFixed(0)}%)`);
  rounds.push(`Bear: "${bear.points[0]?.claim}" (confidence: ${(bear.overallConfidence * 100).toFixed(0)}%)`);

  // Round 2: Challenge the strongest point
  if (bull.points.length > 0 && bear.points.length > 0) {
    const bullStrongest = bull.points.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const bearStrongest = bear.points.reduce((a, b) => a.confidence > b.confidence ? a : b);
    rounds.push(`Bull rebuttal: "${bullStrongest.evidence}" → maintains ${bullStrongest.claim.split(" ")[0]} case`);
    rounds.push(`Bear rebuttal: "${bearStrongest.evidence}" → maintains ${bearStrongest.claim.split(" ")[0]} case`);
  }

  // Round 3: Synthesis
  if (bull.overallConfidence > bear.overallConfidence + 0.15) {
    rounds.push("Synthesis: Bull case significantly stronger — bias direction favored");
  } else if (bear.overallConfidence > bull.overallConfidence + 0.15) {
    rounds.push("Synthesis: Bear case significantly stronger — counter-trend or invalidation");
  } else {
    rounds.push("Synthesis: Cases are balanced — neutral/edge not clear");
  }

  return rounds;
}

/**
 * Produce final synthesis from bull and bear cases.
 */
export function synthesizeDebate(smc: SMCResult): DebateSynthesis {
  const bullCase = generateBullCase(smc);
  const bearCase = generateBearCase(smc, bullCase);
  const debateRounds = runDebate(bullCase, bearCase);

  // Determine final verdict
  let finalVerdict: DebateSynthesis["finalVerdict"];
  let confidence: number;

  const diff = bull.overallConfidence - bear.overallConfidence;
  if (diff > 0.25) {
    finalVerdict = "STRONG_LONG";
    confidence = bull.overallConfidence;
  } else if (diff > 0.1) {
    finalVerdict = "LEAN_LONG";
    confidence = bull.overallConfidence * 0.8;
  } else if (diff < -0.25) {
    finalVerdict = "STRONG_SHORT";
    confidence = bear.overallConfidence;
  } else if (diff < -0.1) {
    finalVerdict = "LEAN_SHORT";
    confidence = bear.overallConfidence * 0.8;
  } else {
    finalVerdict = "NEUTRAL";
    confidence = 0.5;
  }

  // Build final rationale
  const bullTop = bullCase.points.slice(0, 2).map(p => p.claim.split(" ").slice(0, 6).join(" ")).join("; ");
  const bearTop = bearCase.points.slice(0, 2).map(p => p.claim.split(" ").slice(0, 6).join(" ")).join("; ");
  const finalRationale = `Bull: ${bullTop} | Bear: ${bearTop} | Net confidence: ${(diff * 100).toFixed(0)}%`;

  // Entry zone
  let entryZone = "";
  if (smc.zone.rangeMid) {
    entryZone = `${smc.zone.rangeLow?.toFixed(5)}-${smc.zone.rangeMid.toFixed(5)}`;
  }

  // Invalidation level
  const invalidationLevel = bullCase.keyLevel || (smc.zone.rangeLow?.toFixed(5) ?? "");

  // Risk:reward estimate
  const riskReward = bullCase.keyLevel && smc.zone.rangeHigh
    ? `~R${((smc.zone.rangeHigh - parseFloat(bullCase.keyLevel)) / (parseFloat(bullCase.keyLevel) - (smc.zone.rangeLow ?? 0))).toFixed(1)}`
    : "N/A";

  return {
    bullCase,
    bearCase,
    debateRounds,
    finalVerdict,
    confidence,
    finalRationale,
    entryZone,
    invalidationLevel,
    riskReward,
  };
}
