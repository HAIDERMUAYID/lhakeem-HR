import { apiGet } from '@/lib/api';

type Countable = {
  fromDate: string;
  toDate: string;
  date?: string;
  counts?: {
    employees: number;
    rows?: number;
    present: number;
    late: number;
    overtime: number;
    absent: number;
    leave: number;
    rest: number;
    holiday: number;
    unmatchedPins: number;
  };
  unmatchedPins?: string[];
  unmatchedDetails?: { fingerprintId: string; lastSeenAt: string; punchCount: number }[];
  roster: unknown[];
  punches?: unknown[];
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function chunks(from: string, to: string, size = 30) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [{ from, to }];
  const parts: { from: string; to: string }[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + size - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    parts.push({ from: isoDate(cursor), to: isoDate(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return parts;
}

export async function fetchLiveDayRange<T extends Countable>(deviceId: string, from: string, to: string) {
  const parts = chunks(from, to);
  const days: T[] = [];
  for (const part of parts) {
    days.push(
      await apiGet<T>(
        `/api/devices/${deviceId}/live-day?fromDate=${encodeURIComponent(part.from)}&toDate=${encodeURIComponent(part.to)}`,
      ),
    );
  }
  const first = days[0];
  if (!first) throw new Error('تعذر تحميل الكشف');
  if (days.length === 1) {
    first.fromDate = from;
    first.toDate = to;
    return first;
  }
  const details = new Map<string, { fingerprintId: string; lastSeenAt: string; punchCount: number }>();
  for (const day of days) {
    for (const item of day.unmatchedDetails ?? []) {
      const prev = details.get(item.fingerprintId);
      if (!prev) details.set(item.fingerprintId, { ...item });
      else {
        prev.punchCount += item.punchCount;
        if (item.lastSeenAt > prev.lastSeenAt) prev.lastSeenAt = item.lastSeenAt;
      }
    }
  }
  const unmatchedDetails = [...details.values()];
  const counts = first.counts
    ? {
        ...first.counts,
        present: days.reduce((sum, day) => sum + (day.counts?.present ?? 0), 0),
        late: days.reduce((sum, day) => sum + (day.counts?.late ?? 0), 0),
        overtime: days.reduce((sum, day) => sum + (day.counts?.overtime ?? 0), 0),
        absent: days.reduce((sum, day) => sum + (day.counts?.absent ?? 0), 0),
        leave: days.reduce((sum, day) => sum + (day.counts?.leave ?? 0), 0),
        rest: days.reduce((sum, day) => sum + (day.counts?.rest ?? 0), 0),
        holiday: days.reduce((sum, day) => sum + (day.counts?.holiday ?? 0), 0),
        rows: days.reduce((sum, day) => sum + (day.counts?.rows ?? day.roster.length), 0),
        unmatchedPins: unmatchedDetails.length,
      }
    : undefined;
  return {
    ...first,
    fromDate: from,
    toDate: to,
    date: to,
    counts,
    roster: days.flatMap((day) => day.roster),
    punches: days.flatMap((day) => day.punches ?? []),
    unmatchedPins: unmatchedDetails.map((item) => item.fingerprintId),
    unmatchedDetails,
  } as T;
}
