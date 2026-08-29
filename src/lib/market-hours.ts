/**
 * Forex market hours.
 *
 * The spot FX week runs continuously from the Sydney open on Sunday evening
 * to the New York close on Friday evening, then stops entirely for the
 * weekend. Orders sent while it is shut are rejected by the broker with
 * TRADE_RETCODE_MARKET_CLOSED, so the UI checks this before letting an
 * execution through rather than discovering it from a failed round-trip.
 *
 * Boundaries are expressed in UTC and follow New York time, which is what
 * most brokers key their server day to:
 *
 *   Close   Friday  22:00 UTC   (17:00 New York, EDT)
 *   Open    Sunday  22:00 UTC   (17:00 New York, EDT)
 *
 * During US winter time both shift an hour later (23:00 UTC). We account for
 * that below. Individual brokers still vary by a few minutes either side and
 * close for public holidays, so treat "open" as "worth trying" rather than a
 * guarantee — the broker remains the authority, which is why the retcode
 * check in metaapi.functions.ts stays in place regardless of what this says.
 */

export type MarketState = "open" | "closed-weekend" | "closed-holiday-guess";

export interface MarketStatus {
  open: boolean;
  state: MarketState;
  /** Short label for a badge, e.g. "Market open". */
  label: string;
  /** One sentence explaining what happens if you try to trade now. */
  detail: string;
  /** When the market next changes state. */
  changesAt: Date;
  /** Human phrasing of the wait, e.g. "in 6h 20m". */
  changesIn: string;
}

/**
 * US daylight saving: second Sunday of March to first Sunday of November.
 * Returns the UTC hour at which the FX week starts and ends on that date.
 */
function nyCloseHourUtc(d: Date): number {
  const year = d.getUTCFullYear();

  const secondSundayMarch = nthSundayUtc(year, 2, 2); // March, 2nd Sunday
  const firstSundayNovember = nthSundayUtc(year, 10, 1); // November, 1st Sunday

  const inDst = d >= secondSundayMarch && d < firstSundayNovember;
  return inDst ? 22 : 23; // 17:00 New York either way
}

/** UTC date of the nth Sunday of a month (month is 0-indexed). */
function nthSundayUtc(year: number, month: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (7 - first.getUTCDay()) % 7; // days until the first Sunday
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7, 6));
}

function formatGap(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

/**
 * Is the FX market open at `now`, and when does that next change?
 */
export function marketStatus(now: Date = new Date()): MarketStatus {
  const boundaryHour = nyCloseHourUtc(now);
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const hour = now.getUTCHours();

  const closed =
    day === 6 || // all Saturday
    (day === 5 && hour >= boundaryHour) || // Friday after the NY close
    (day === 0 && hour < boundaryHour); // Sunday before the Sydney open

  if (closed) {
    // Next Sunday boundary at or after `now`.
    const open = new Date(now);
    open.setUTCHours(boundaryHour, 0, 0, 0);
    while (open <= now || open.getUTCDay() !== 0) {
      open.setUTCDate(open.getUTCDate() + 1);
      open.setUTCHours(boundaryHour, 0, 0, 0);
    }
    return {
      open: false,
      state: "closed-weekend",
      label: "Market closed",
      detail:
        "The forex market is shut for the weekend. Orders sent now are rejected by the broker, " +
        "so execution is disabled until it reopens.",
      changesAt: open,
      changesIn: formatGap(open.getTime() - now.getTime()),
    };
  }

  // Next Friday boundary at or after `now`.
  const close = new Date(now);
  close.setUTCHours(boundaryHour, 0, 0, 0);
  while (close <= now || close.getUTCDay() !== 5) {
    close.setUTCDate(close.getUTCDate() + 1);
    close.setUTCHours(boundaryHour, 0, 0, 0);
  }

  return {
    open: true,
    state: "open",
    label: "Market open",
    detail:
      "The forex market is trading. Orders should reach the broker — a rejection now would be " +
      "account-specific (margin, stops or lot size) rather than the session.",
    changesAt: close,
    changesIn: formatGap(close.getTime() - now.getTime()),
  };
}
