/**
 * Timezone helpers for the GizzyFx terminal.
 *
 * The user is in Nigeria (WAT = UTC+1).
 * Market sessions are defined in ET (US Eastern, UTC-4 summer / UTC-5 winter).
 * Formatted in user-friendly 12-hour AM/PM format (e.g. 1:30 PM, 6:00 PM).
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

/** Format clock in 12-hour AM/PM: "1:42:15 PM" */
export function formatTime(t: { hours: number; minutes: number; seconds: number }, includeSeconds = true): string {
  const h12 = t.hours % 12 || 12;
  const ampm = t.hours >= 12 ? "PM" : "AM";
  if (includeSeconds) {
    return `${h12}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")} ${ampm}`;
  }
  return `${h12}:${String(t.minutes).padStart(2, "0")} ${ampm}`;
}

/** Format both clocks: "1:42:15 PM WAT · 8:42:15 AM ET" */
export function dualClock(): string {
  return `${formatTime(getWATTime())} WAT · ${formatTime(getEasternTime())} ET`;
}

/** Convert an ET hour:minute to 12-hour WAT AM/PM string (e.g. "6:00 PM") */
export function etToWAT(etHour: number, etMin: number = 0): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const watDate = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const diffHours = Math.round((watDate.getTime() - etDate.getTime()) / 3600000);

  let watHour = etHour + diffHours;
  if (watHour >= 24) watHour -= 24;
  if (watHour < 0) watHour += 24;

  const h12 = watHour % 12 || 12;
  const ampm = watHour >= 12 ? "PM" : "AM";
  return `${h12}:${String(etMin).padStart(2, "0")} ${ampm}`;
}

/** Format 24h string "13:00" -> "1:00 PM" */
export function formatEtTo12h(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  if (h == null) return timeStr;
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

/** Format date/time to 12-hour WAT time: "1:30 PM" */
export function formatEventTimeWAT(dateInput: string | number | Date): string {
  try {
    const d = new Date(dateInput);
    return d.toLocaleTimeString("en-US", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(dateInput);
  }
}
