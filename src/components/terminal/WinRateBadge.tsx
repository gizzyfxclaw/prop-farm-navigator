import { useEffect, useState } from "react";
import { Badge } from "./ui";

interface OutcomeStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number | null;
  highGradeTotal: number;
  highGradeWinRate: number | null;
}

/**
 * Durable win-rate, computed by scripts/self_learn.py comparing each
 * fulfilled setup's entry/SL/TP against real price movement (see
 * /api/hermes/outcomes) — not a rolling text summary that gets discarded.
 * Shared between the SMC Analysis page and the Trading Agent page.
 */
export function WinRateBadge({ pair }: { pair?: string | undefined }) {
  const [stats, setStats] = useState<OutcomeStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = pair ? `/api/hermes/outcomes?limit=100&pair=${pair}` : "/api/hermes/outcomes?limit=100";
    fetch(url)
      .then((r) => r.json() as Promise<{ stats: OutcomeStats | null }>)
      .then((d) => { if (!cancelled) setStats(d.stats ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pair]);

  if (!stats || stats.total === 0) return null;

  const wr = stats.winRate;
  const tone = wr == null ? "neutral" : wr >= 60 ? "green" : wr >= 40 ? "amber" : "red";

  return (
    <div className="flex items-center gap-2 flex-wrap text-[12px]">
      <Badge tone={tone}>{wr != null ? `${wr.toFixed(0)}% WIN RATE` : "NO DECIDED TRADES YET"}</Badge>
      <span className="text-muted-foreground">
        {stats.wins}W / {stats.losses}L / {stats.pending} pending (last {stats.total})
        {stats.highGradeWinRate != null && ` · HIGH grade: ${stats.highGradeWinRate.toFixed(0)}% (${stats.highGradeTotal})`}
      </span>
    </div>
  );
}
