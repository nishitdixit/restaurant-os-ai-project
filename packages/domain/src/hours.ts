// Opening hours. Stored per outlet as { mon: [["11:00","23:00"]], ... } in the outlet timezone.
// A range whose close is not after its open runs past midnight (e.g. ["18:00","02:00"]).

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, readonly (readonly [string, string])[]>>;

export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function isValidHours(hours: unknown): hours is OpeningHours {
  if (typeof hours !== "object" || hours === null) return false;
  for (const [day, ranges] of Object.entries(hours)) {
    if (!(WEEKDAYS as readonly string[]).includes(day) || !Array.isArray(ranges)) return false;
    for (const range of ranges) {
      if (!Array.isArray(range) || range.length !== 2 || !TIME.test(range[0]) || !TIME.test(range[1]) || range[0] === range[1]) return false;
    }
  }
  return true;
}

function localParts(date: Date, timeZone: string): { day: Weekday; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as Weekday;
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

function previousDay(day: Weekday): Weekday {
  return WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7]!;
}

/** True when the outlet is open at `date`. Outlets with no hours configured are treated as always open. */
export function isOpenAt(hours: OpeningHours | null | undefined, date: Date, timeZone: string): boolean {
  if (!hours || !Object.keys(hours).length) return true;
  const { day, minute } = localParts(date, timeZone);
  for (const [open, close] of hours[day] ?? []) {
    const o = minutes(open), c = minutes(close);
    if (c > o ? minute >= o && minute < c : minute >= o) return true;
  }
  for (const [open, close] of hours[previousDay(day)] ?? []) {
    const o = minutes(open), c = minutes(close);
    if (c <= o && minute < c) return true;
  }
  return false;
}

/** Human summary of the next opening time within a week, e.g. "today at 11:00" / "Tuesday at 11:00". */
export function nextOpening(hours: OpeningHours | null | undefined, date: Date, timeZone: string): string | null {
  if (!hours || !Object.keys(hours).length) return null;
  const { day, minute } = localParts(date, timeZone);
  const start = WEEKDAYS.indexOf(day);
  for (let offset = 0; offset < 7; offset++) {
    const d = WEEKDAYS[(start + offset) % 7]!;
    const opens = (hours[d] ?? []).map(([open]) => open).filter((open) => offset > 0 || minutes(open) > minute).sort();
    if (opens.length) return `${offset === 0 ? "today" : offset === 1 ? "tomorrow" : WEEKDAY_LABELS[d]} at ${opens[0]}`;
  }
  return null;
}
