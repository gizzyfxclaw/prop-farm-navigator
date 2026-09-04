import { useEffect, useState } from "react";
import { LiveDot } from "./anim";
import { getEasternTime } from "@/lib/timezone";

type MarketSession = {
  name: string;
  short: string;
  openHour: number;
  closeHour: number;
  timezone: string;
};

const SESSIONS: MarketSession[] = [
  { name: "Sydney", short: "SYD", openHour: 22, closeHour: 7, timezone: "UTC" },
  { name: "Tokyo", short: "TYO", openHour: 0, closeHour: 9, timezone: "UTC" },
  { name: "London", short: "LDN", openHour: 8, closeHour: 17, timezone: "UTC" },
  { name: "New York", short: "NYC", openHour: 13, closeHour: 22, timezone: "UTC" },
];

function isSessionOpen(session: MarketSession): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  if (session.openHour < session.closeHour) {
    return hour >= session.openHour && hour < session.closeHour;
  }
  return hour >= session.openHour || hour < session.closeHour;
}

function getNextOpen(): { session: string; minutes: number } | null {
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  let closest: { session: string; minutes: number } | null = null;

  for (const session of SESSIONS) {
    if (!isSessionOpen(session)) {
      let openMinutes = session.openHour * 60;
      if (session.openHour < session.closeHour) {
        if (currentMinutes >= session.closeHour * 60) {
          openMinutes += 24 * 60;
        }
      } else if (currentMinutes < session.openHour * 60) {
        // already correct
      } else {
        openMinutes += 24 * 60;
      }
      const diff = openMinutes - currentMinutes;
      if (diff > 0 && (!closest || diff < closest.minutes)) {
        closest = { session: session.short, minutes: diff };
      }
    }
  }
  return closest;
}

/** "3h12m" / "42m" — compact enough for the command bar. */
function compactDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/* The London/NY overlap (13:00–16:00 ET) is the user's preferred trading
   window, so it gets its own state in the session clock. */
const OVERLAP_START = 13 * 3600;
const OVERLAP_END = 16 * 3600;

export function MarketStatus() {
  const [, setTick] = useState(0);
  const nextOpen = getNextOpen();

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const openCount = SESSIONS.filter(isSessionOpen).length;

  const etSec = getEasternTime().totalSeconds;
  const inOverlap = etSec >= OVERLAP_START && etSec < OVERLAP_END;
  const overlapMinsLeft = (OVERLAP_END - etSec) / 60;
  const minsToOverlap =
    (etSec < OVERLAP_START ? OVERLAP_START - etSec : 86400 - etSec + OVERLAP_START) / 60;

  return (
    <div className="flex items-center gap-2.5" title="Market sessions (UTC)">
      {SESSIONS.map((session) => {
        const open = isSessionOpen(session);
        return (
          <div
            key={session.short}
            className="flex items-center gap-1.5"
            title={`${session.name} — ${open ? "OPEN" : "CLOSED"}`}
          >
            <LiveDot state={open ? "live" : "dead"} />
            <span
              className="mono-cap"
              style={{
                color: open ? "oklch(var(--gz-pos))" : "oklch(var(--gz-mut) / 0.7)",
              }}
            >
              {session.short}
            </span>
          </div>
        );
      })}

      {inOverlap ? (
        <span
          className="badge badge-success"
          title="London/NY overlap — peak liquidity, the preferred trading window (13:00–16:00 ET)"
        >
          <LiveDot state="live" />
          LDN/NY {compactDuration(overlapMinsLeft)}
        </span>
      ) : (
        <span
          className="badge badge-neutral"
          title="Time until the London/NY overlap opens (13:00–16:00 ET)"
        >
          LDN/NY T-{compactDuration(minsToOverlap)}
        </span>
      )}

      {openCount === 0 && nextOpen && (
        <span className="mono-cap c-mut" style={{ fontSize: 9 }}>
          NEXT {nextOpen.session} {compactDuration(nextOpen.minutes)}
        </span>
      )}
    </div>
  );
}
