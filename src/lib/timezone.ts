/**
 * Timezone helpers for the GizzyFx terminal.
 *
 * The user is in Nigeria (WAT = UTC+1).
 * Market sessions are defined in ET (US Eastern, UTC-4 summer / UTC-5 winter).
 * We show BOTH local WAT time and ET market time throughout the site.
 */

export function getEasternTime(): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etStr);
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const s = etDate.getSeconds();
  return { hours: h, minutes: m, seconds: s, totalSeconds: h * 3600 + m * 60 + s };
}

export function getWATTime(): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  const watStr = now.toLocaleString("en-US", { timeZone: "Africa/Lagos" });
  const watDate = new Date(watStr);
  const h = watDate.getHours();
  const m = watDate.getMinutes();
  const s = watDate.getSeconds();
  return { hours: h, minutes: m, seconds: s, totalSeconds: h * 3600 + m * 60 + s };
}

export function formatTime(t: { hours: number; minutes: number; seconds: number }): string {
  return `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`;
}

/** Format both clocks: "19:42:15 WAT / 14:42:15 ET" */
export function dualClock(): string {
  return `${formatTime(getWATTime())} WAT · ${formatTime(getEasternTime())} ET`;
}

/** Convert an ET hour:minute to WAT string for display */
export function etToWAT(etHour: number, etMin: number = 0): string {
  // WAT = ET + offset. During EDT (summer): WAT = ET + 5. During EST (winter): WAT = ET + 6.
  // Use Intl to get the exact offset dynamically.
  const now = new Date();
  const etDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const watDate = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const diffHours = Math.round((watDate.getTime() - etDate.getTime()) / 3600000);

  let watHour = etHour + diffHours;
  if (watHour >= 24) watHour -= 24;
  if (watHour < 0) watHour += 24;
  return `${String(watHour).padStart(2, "0")}:${String(etMin).padStart(2, "0")}`;
}
