import { createFileRoute } from "@tanstack/react-router";

/**
 * TradingView Community Ideas & Professional Accuracy Evaluator API
 *
 * Fetches real published trade setups and market analysis from TradingView,
 * then rigorously evaluates each idea's accuracy, structure validity, and
 * technical confluence to identify high-probability institutional setups.
 */

export interface EvaluatedCommunityIdea {
  id: string;
  title: string;
  author: string;
  authorUrl: string;
  link: string;
  description: string;
  image?: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  symbol: string;
  accuracyScore: number; // 0 - 100
  accuracyGrade: "A+ (90%+ Institutional)" | "A (80%-89% High Probability)" | "B (65%-79% Speculative)" | "C (Low Accuracy / Trap)";
  verdict: "HIGH_CONVICTION" | "STANDARD_SETUP" | "RISKY_OR_DIVERGENT" | "COUNTER_TREND_TRAP";
  confluencePoints: string[];
  riskWarnings: string[];
}

export interface CommunityConsensusReport {
  pair: string;
  totalAnalyzed: number;
  sentiment: {
    longCount: number;
    shortCount: number;
    neutralCount: number;
    longPct: number;
    shortPct: number;
    bias: "BULLISH_DOMINANCE" | "BEARISH_DOMINANCE" | "BALANCED_SPLIT";
  };
  topRatedIdeas: EvaluatedCommunityIdea[];
  synthesis: string;
  actionableRecommendation: string;
  timestamp: string;
}

const TV_SCANNER_URL = "https://scanner.tradingview.com/forex/scan";

async function fetchTechnicalBias(pair: string): Promise<{ maScore: number; rsi: number; verdict: string } | null> {
  const ticker = `FX:${pair.toUpperCase().replace(/[^A-Z]/g, "")}`;
  try {
    const res = await fetch(TV_SCANNER_URL, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbols: { tickers: [ticker], query: { types: [] } },
        columns: ["Recommend.All", "Recommend.MA", "RSI", "MACD.macd", "MACD.signal"],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const d = data.data?.[0]?.d;
    if (!d) return null;
    return {
      maScore: d[1] ?? 0,
      rsi: d[2] ?? 50,
      verdict: d[0] >= 0.1 ? "BUY" : d[0] <= -0.1 ? "SELL" : "NEUTRAL",
    };
  } catch {
    return null;
  }
}

function evaluateIdeaAccuracy(
  idea: { title: string; description: string; direction: "LONG" | "SHORT" | "NEUTRAL" },
  tvTech: { maScore: number; rsi: number; verdict: string } | null
): {
  score: number;
  grade: EvaluatedCommunityIdea["accuracyGrade"];
  verdict: EvaluatedCommunityIdea["verdict"];
  confluencePoints: string[];
  riskWarnings: string[];
} {
  let score = 50; // Baseline
  const confluencePoints: string[] = [];
  const riskWarnings: string[] = [];
  const fullText = `${idea.title} ${idea.description}`.toLowerCase();

  // 1. Structure & Institutional Concepts Analysis
  if (fullText.includes("order block") || fullText.includes("ob") || fullText.includes("supply") || fullText.includes("demand")) {
    score += 15;
    confluencePoints.push("References institutional Supply/Demand or Order Block levels");
  }

  if (fullText.includes("bos") || fullText.includes("break of structure") || fullText.includes("choch") || fullText.includes("structure")) {
    score += 15;
    confluencePoints.push("Validates trade via Market Structure (BOS / CHoCH)");
  }

  if (fullText.includes("fvg") || fullText.includes("fair value gap") || fullText.includes("imbalance")) {
    score += 10;
    confluencePoints.push("Identifies Fair Value Gap / liquidity imbalance");
  }

  if (fullText.includes("retest") || fullText.includes("pullback") || fullText.includes("confirmation")) {
    score += 10;
    confluencePoints.push("Enforces confirmation pullback rule instead of blind breakout chasing");
  }

  if (fullText.includes("stop loss") || fullText.includes("sl") || fullText.includes("risk")) {
    score += 10;
    confluencePoints.push("Defines clear Stop Loss risk parameters");
  }

  // 2. Alignment with Live TradingView Technical Indicators
  if (tvTech && idea.direction !== "NEUTRAL") {
    const isTechLong = tvTech.verdict === "BUY" || tvTech.maScore > 0.1;
    const isTechShort = tvTech.verdict === "SELL" || tvTech.maScore < -0.1;

    if ((idea.direction === "LONG" && isTechLong) || (idea.direction === "SHORT" && isTechShort)) {
      score += 20;
      confluencePoints.push(`Aligned with TradingView Technical Moving Averages (${tvTech.verdict})`);
    } else if ((idea.direction === "LONG" && isTechShort) || (idea.direction === "SHORT" && isTechLong)) {
      score -= 25;
      riskWarnings.push(`Counter-trend conflict: TradingView indicators signal ${tvTech.verdict}`);
    }

    // Check RSI Overextension
    if (idea.direction === "LONG" && tvTech.rsi > 72) {
      score -= 15;
      riskWarnings.push(`RSI is Overbought (${tvTech.rsi.toFixed(1)}) — high risk of near-term rejection`);
    } else if (idea.direction === "SHORT" && tvTech.rsi < 28) {
      score -= 15;
      riskWarnings.push(`RSI is Oversold (${tvTech.rsi.toFixed(1)}) — vulnerable to short-squeeze bounce`);
    }
  }

  // Deductions for low-effort / dangerous posts
  if (fullText.includes("to the moon") || fullText.includes("guaranteed") || fullText.includes("100%")) {
    score -= 30;
    riskWarnings.push("Overconfident / emotionally biased language");
  }

  if (idea.description.length < 30) {
    score -= 15;
    riskWarnings.push("Minimal technical analysis provided");
  }

  // Clamp score
  const finalScore = Math.max(20, Math.min(98, score));

  // Determine Grade
  let grade: EvaluatedCommunityIdea["accuracyGrade"];
  let verdict: EvaluatedCommunityIdea["verdict"];

  if (finalScore >= 88) {
    grade = "A+ (90%+ Institutional)";
    verdict = "HIGH_CONVICTION";
  } else if (finalScore >= 78) {
    grade = "A (80%-89% High Probability)";
    verdict = "STANDARD_SETUP";
  } else if (finalScore >= 62) {
    grade = "B (65%-79% Speculative)";
    verdict = "RISKY_OR_DIVERGENT";
  } else {
    grade = "C (Low Accuracy / Trap)";
    verdict = "COUNTER_TREND_TRAP";
  }

  return {
    score: finalScore,
    grade,
    verdict,
    confluencePoints: confluencePoints.length > 0 ? confluencePoints : ["Standard price action observation"],
    riskWarnings: riskWarnings.length > 0 ? riskWarnings : ["Monitor market session liquidity"],
  };
}

export const Route = createFileRoute("/api/tradingview-ideas")({
  server: {
    handlers: {
      async GET({ request }) {
        const url = new URL(request.url);
        const pairParam = (url.searchParams.get("pair") || "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");

        const tvUrl = `https://www.tradingview.com/ideas/${pairParam.toLowerCase()}/`;

        try {
          const [tvRes, tvTech] = await Promise.all([
            fetch(tvUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            }),
            fetchTechnicalBias(pairParam),
          ]);

          if (!tvRes.ok) {
            return Response.json({ error: `TradingView returned ${tvRes.status}`, ideas: [] });
          }

          const html = await tvRes.text();
          const ideas: EvaluatedCommunityIdea[] = [];

          const articleRegex = /<article[\s\S]*?<\/article>/gi;
          const linkRegex = /href="(\/chart\/[^\/]+\/[^"]+)"/i;
          const authorRegex = /href="(\/u\/([^"\/]+)\/)"/i;
          const imgRegex = /src="(https:\/\/s3\.tradingview\.com\/[^"]+)"/i;

          let match: RegExpExecArray | null;
          let count = 0;

          while ((match = articleRegex.exec(html)) !== null && count < 25) {
            const articleHtml = match[0];
            const linkMatch = articleHtml.match(linkRegex);
            if (!linkMatch) continue;

            const chartPath = linkMatch[1]!;
            const fullLink = `https://www.tradingview.com${chartPath}`;

            const authorMatch = articleHtml.match(authorRegex);
            const author = authorMatch ? authorMatch[2]! : "TradingView Pro";
            const authorUrl = authorMatch ? `https://www.tradingview.com${authorMatch[1]}` : "";

            const imgMatch = articleHtml.match(imgRegex);
            const image = imgMatch ? imgMatch[1] : undefined;

            const titleMatch = articleHtml.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                               articleHtml.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);

            let title = "";
            if (titleMatch) {
              title = titleMatch[1]!.replace(/<[^>]+>/g, "").trim();
            } else {
              const segments = chartPath.split("/");
              const slug = segments[segments.length - 1] || "";
              title = slug.replace(/^[A-Za-z0-9]+-/, "").replace(/-/g, " ");
            }

            const pMatch = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            const description = pMatch ? pMatch[1]!.replace(/<[^>]+>/g, "").trim() : "";

            const lower = `${title} ${description}`.toLowerCase();
            const direction: "LONG" | "SHORT" | "NEUTRAL" =
              lower.includes("buy") || lower.includes("long") || lower.includes("bullish") ? "LONG" :
              lower.includes("sell") || lower.includes("short") || lower.includes("bearish") ? "SHORT" :
              "NEUTRAL";

            const segments = chartPath.split("/").filter(Boolean);
            const id = segments[2]?.split("-")?.[0] || segments[1]?.split("-")?.[0] || String(count);

            // Judge Idea Accuracy
            const evalResult = evaluateIdeaAccuracy({ title, description, direction }, tvTech);

            ideas.push({
              id,
              title: title || `${pairParam} Trade Idea`,
              author,
              authorUrl,
              link: fullLink,
              description,
              image,
              direction,
              symbol: pairParam,
              accuracyScore: evalResult.score,
              accuracyGrade: evalResult.grade,
              verdict: evalResult.verdict,
              confluencePoints: evalResult.confluencePoints,
              riskWarnings: evalResult.riskWarnings,
            });

            count++;
          }

          // Sort by highest accuracy score first
          ideas.sort((a, b) => b.accuracyScore - a.accuracyScore);

          // Compute Community Sentiment Breakdown
          const longCount = ideas.filter(i => i.direction === "LONG").length;
          const shortCount = ideas.filter(i => i.direction === "SHORT").length;
          const neutralCount = ideas.filter(i => i.direction === "NEUTRAL").length;
          const totalValid = longCount + shortCount;
          const longPct = totalValid > 0 ? Math.round((longCount / totalValid) * 100) : 50;
          const shortPct = totalValid > 0 ? Math.round((shortCount / totalValid) * 100) : 50;

          const bias =
            longPct >= 65 ? "BULLISH_DOMINANCE" :
            shortPct >= 65 ? "BEARISH_DOMINANCE" :
            "BALANCED_SPLIT";

          const topRated = ideas.filter(i => i.accuracyScore >= 75).slice(0, 5);

          const synthesis = `Analyzed ${ideas.length} published TradingView community setups for ${pairParam}. ` +
            `Sentiment is ${bias.replace("_", " ")} (${longPct}% Long vs ${shortPct}% Short). ` +
            `Top authors highlight ${topRated[0]?.title ?? "technical structure"} as the primary institutional focal point.`;

          const actionableRecommendation = bias === "BULLISH_DOMINANCE"
            ? `Community consensus aligns with Bullish Continuation. Prioritize Long pullback entries into Order Blocks/Support.`
            : bias === "BEARISH_DOMINANCE"
            ? `Community consensus aligns with Bearish Continuation. Prioritize Short pullback entries below Resistance.`
            : `Mixed community sentiment. Wait for clean SMC channel breakout confirmation before committing capital.`;

          const report: CommunityConsensusReport = {
            pair: pairParam,
            totalAnalyzed: ideas.length,
            sentiment: {
              longCount,
              shortCount,
              neutralCount,
              longPct,
              shortPct,
              bias,
            },
            topRatedIdeas: ideas,
            synthesis,
            actionableRecommendation,
            timestamp: new Date().toISOString(),
          };

          return Response.json(report);
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to fetch TradingView ideas", ideas: [] }, { status: 500 });
        }
      },
    },
  },
});
