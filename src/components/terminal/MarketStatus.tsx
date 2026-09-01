import { useEffect, useState } from "react";

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

export function MarketStatus() {
  const [, setTick] = useState(0);
  const nextOpen = getNextOpen();

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const openCount = SESSIONS.filter(isSessionOpen).length;

  return (
    <div className="flex items-center gap-3" title="Market sessions (UTC)">
      {SESSIONS.map((session) => {
        const open = isSessionOpen(session);
        return (
          <div
            key={session.short}
            className="flex items-center gap-1.5"
            title={`${session.name} ${open ? "open" : "closed"}`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: open
                  ? "oklch(0.720 0.190 148)"
                  : "oklch(0.500 0.100 250)",
                boxShadow: open ? "0 0 6px oklch(0.720 0.190 148)" : "none",
              }}
            />
            <span
              className="font-mono text-[10px] font-medium tracking-wider"
              style={{
                color: open
                  ? "oklch(0.720 0.190 148)"
                  : "oklch(var(--gz-mut))",
              }}
            >
              {session.short}
            </span>
          </div>
        );
      })}
      {openCount === 0 && nextOpen && (
        <span
          className="font-mono text-[9px]"
          style={{ color: "oklch(var(--gz-mut))" }}
        >
          Next: {nextOpen.session} in {Math.floor(nextOpen.minutes / 60)}h{" "}
          {nextOpen.minutes % 60}m
        </span>
      )}
    </div>
  );
}