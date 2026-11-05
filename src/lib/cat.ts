// All wall-clock display times use Central Africa Time (Africa/Lusaka, UTC+2)

export const CAT_TZ = "Africa/Lusaka";

export function catTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: CAT_TZ,
  }).format(d);
}

export function catClock(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: CAT_TZ,
  }).format(date).toUpperCase() + " CAT";
}

export function catDateLong(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CAT_TZ,
  }).format(date);
}

export function startOfTodayCat(): Date {
  const now = new Date();
  // Build midnight CAT expressed in UTC
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // yyyy-mm-dd
  return new Date(`${parts}T00:00:00+02:00`);
}
