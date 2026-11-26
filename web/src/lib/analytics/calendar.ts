const MICROS_PER_MILLISECOND = BigInt(1000);
const KST_OFFSET = BigInt(9 * 60 * 60 * 1000) * MICROS_PER_MILLISECOND;

// Date.parse normalizes invalid dates and accepts timezone-free input. Neither is
// suitable for assigning an observation to a Korean calendar date.
export function parseInstant(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, y, m, d, h, min, sec, fraction = "", , oh, om] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59 || !Number.isFinite(time)) return null;
  const remainder = fraction.padEnd(6, "0").slice(3);
  return BigInt(time) * MICROS_PER_MILLISECOND + BigInt(remainder);
}

function formatInstant(instant: bigint): string {
  // Use the millisecond at or before the instant, including dates before 1970.
  const remainder = (instant % MICROS_PER_MILLISECOND + MICROS_PER_MILLISECOND) % MICROS_PER_MILLISECOND;
  const ms = (instant - remainder) / MICROS_PER_MILLISECOND;
  const iso = new Date(Number(ms)).toISOString();
  return remainder === BigInt(0) ? iso : iso.slice(0, -1) + String(remainder).padStart(3, "0") + "Z";
}

export function utcTimestamp(value: string): string {
  const instant = parseInstant(value);
  if (instant === null) throw new Error("Invalid evidence timestamp");
  return formatInstant(instant);
}

export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function kstParts(value: unknown): { date: string; time: string } | null {
  const instant = parseInstant(value);
  if (instant === null) return null;
  const local = formatInstant(instant + KST_OFFSET);
  return /^\d{4}-/.test(local) ? { date: local.slice(0, 10), time: local.slice(11, -1) } : null;
}

export function kstDate(value: unknown): string | null {
  return kstParts(value)?.date ?? null;
}
