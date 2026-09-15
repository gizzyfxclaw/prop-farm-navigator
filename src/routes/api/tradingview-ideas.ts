import { createFileRoute } from "@tanstack/react-router";

/**
 * TradingView Community Ideas & Explore Feed API
 *
 * Fetches real published trade setups, market analysis, and community ideas
 * from TradingView for any forex pair or crypto/commodity symbol.
 */

interface CommunityIdea {
  id: string;
  title: string;
  author: string;
  authorUrl: string;
  link: string;
  description: string;
  image?: string;
  direction?: "LONG" | "SHORT" | "NEUTRAL";
  symbol: string;
}

export const Route = createFileRoute("/api/tradingview-ideas")({
  server: {
    handlers: {
      async GET({ request }) {
        const url = new URL(request.url);
        const pairParam = (url.searchParams.get("pair") || "EURUSD").toLowerCase().replace(/[^a-z0-9]/g, "");

        const tvUrl = `https://www.tradingview.com/ideas/${pairParam}/`;

        try {
          const res = await fetch(tvUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });

          if (!res.ok) {
            return Response.json({ error: `TradingView returned ${res.status}`, ideas: [] });
          }

          const html = await res.text();
          const ideas: CommunityIdea[] = [];

          // Regex-based extraction of article cards from TradingView Ideas page
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
            const author = authorMatch ? authorMatch[2]! : "TradingView Author";
            const authorUrl = authorMatch ? `https://www.tradingview.com${authorMatch[1]}` : "";

            const imgMatch = articleHtml.match(imgRegex);
            const image = imgMatch ? imgMatch[1] : undefined;

            // Extract plain text title from link text
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

            // Extract description
            const pMatch = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            const description = pMatch ? pMatch[1]!.replace(/<[^>]+>/g, "").trim() : "";

            // Direction classification
            const lower = `${title} ${description}`.toLowerCase();
            const direction: "LONG" | "SHORT" | "NEUTRAL" =
              lower.includes("buy") || lower.includes("long") || lower.includes("bullish") ? "LONG" :
              lower.includes("sell") || lower.includes("short") || lower.includes("bearish") ? "SHORT" :
              "NEUTRAL";

            const id = chartPath.split("/")[3]?.split("-")[0] || String(count);

            ideas.push({
              id,
              title: title || `${pairParam.toUpperCase()} Trade Idea`,
              author,
              authorUrl,
              link: fullLink,
              description,
              image,
              direction,
              symbol: pairParam.toUpperCase(),
            });

            count++;
          }

          return Response.json({
            pair: pairParam.toUpperCase(),
            count: ideas.length,
            ideas,
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to fetch TradingView ideas", ideas: [] }, { status: 500 });
        }
      },
    },
  },
});
