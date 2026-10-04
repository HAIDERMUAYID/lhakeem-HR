/** ساعة الجهاز والمستشفى بتوقيت بغداد (UTC+3) بلا توقيت صيفي. */

const OFFSET_MS = 3 * 60 * 60 * 1000;

export function parseHospitalWallTime(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  const d = new Date(utc - OFFSET_MS);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hospitalParts(d: Date) {
  const shifted = new Date(d.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

export function hospitalDayKey(d: Date): string {
  const p = hospitalParts(d);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function hospitalDayNoon(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

export function hospitalAtClock(calendar: Date, hhmm: string, addDays = 0): Date | null {
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return new Date(
    Date.UTC(calendar.getFullYear(), calendar.getMonth(), calendar.getDate() + addDays, Number(match[1]), Number(match[2]), 0) -
      OFFSET_MS,
  );
}
