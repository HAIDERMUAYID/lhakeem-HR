/** مقارنة الحضور الفعلي بجدول الدوام لنفس اليوم التقويمي. */

export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesBetweenClock(start: string, end: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return null;
  let endM = e;
  if (endM <= s) endM += 24 * 60;
  return endM - s;
}

export function netExpectedMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
  breakStart?: string | null,
  breakEnd?: string | null,
): number | null {
  if (!start || !end) return null;
  const total = minutesBetweenClock(start, end);
  if (total == null) return null;
  if (!breakStart || !breakEnd) return total;
  const br = minutesBetweenClock(breakStart, breakEnd);
  if (br == null || br <= 0 || br >= total) return total;
  return total - br;
}

function atClock(day: Date, hhmm: string, addDays = 0): Date | null {
  const mins = timeToMinutes(hhmm);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + addDays, h, m, 0, 0);
}

function diffMinutes(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 60000);
}

export type ScheduleMetrics = {
  scheduledStart: string | null;
  scheduledEnd: string | null;
  expectedMinutes: number | null;
  workedMinutes: number | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
};

export function evaluateAgainstSchedule(params: {
  dutyDay: boolean;
  workDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  displayMode: 'pair' | 'single' | null;
}): ScheduleMetrics {
  const empty: ScheduleMetrics = {
    scheduledStart: null,
    scheduledEnd: null,
    expectedMinutes: null,
    workedMinutes: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
  };
  if (!params.dutyDay) return empty;

  const scheduledStart = params.startTime?.trim() || null;
  const scheduledEnd = params.endTime?.trim() || null;
  const expectedMinutes = netExpectedMinutes(
    scheduledStart,
    scheduledEnd,
    params.breakStart,
    params.breakEnd,
  );

  let workedMinutes: number | null = null;
  if (params.displayMode === 'pair' && params.checkInAt && params.checkOutAt) {
    workedMinutes = Math.max(0, diffMinutes(params.checkOutAt, params.checkInAt));
  }

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;

  if (scheduledStart && params.checkInAt) {
    const due = atClock(params.workDate, scheduledStart);
    if (due && params.checkInAt.getTime() > due.getTime()) {
      lateMinutes = diffMinutes(params.checkInAt, due);
    }
  }

  if (scheduledEnd && params.checkOutAt && params.displayMode === 'pair') {
    const startMins = timeToMinutes(scheduledStart || '00:00') ?? 0;
    const endMins = timeToMinutes(scheduledEnd) ?? 0;
    const overnight = endMins <= startMins;
    const dueEnd = atClock(params.workDate, scheduledEnd, overnight ? 1 : 0);
    if (dueEnd) {
      if (params.checkOutAt.getTime() < dueEnd.getTime()) {
        earlyLeaveMinutes = diffMinutes(dueEnd, params.checkOutAt);
      } else {
        overtimeMinutes = diffMinutes(params.checkOutAt, dueEnd);
      }
    }
  }

  return {
    scheduledStart,
    scheduledEnd,
    expectedMinutes,
    workedMinutes,
    lateMinutes: Math.max(0, lateMinutes),
    earlyLeaveMinutes: Math.max(0, earlyLeaveMinutes),
    overtimeMinutes: Math.max(0, overtimeMinutes),
  };
}
