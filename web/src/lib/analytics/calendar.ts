const KST_OFFSET = 9 * 60 * 60 * 1000;

// Date.parse normalizes invalid dates and accepts timezone-free input. Neither is
// suitable for assigning an observation to a Korean calendar date.
export function parseInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, y, m, d, h, min, sec, , oh, om] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59 || !Number.isFinite(time)) return null;
  return time;
}

export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function kstParts(value: unknown): { date: string; time: string } | null {
  const instant = parseInstant(value);
  if (instant === null) return null;
  const local = new Date(instant + KST_OFFSET).toISOString();
  return /^\d{4}-/.test(local) ? { date: local.slice(0, 10), time: local.slice(11, 23) } : null;
}

export function kstDate(value: unknown): string | null {
  return kstParts(value)?.date ?? null;
}
