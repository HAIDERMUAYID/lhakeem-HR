import { WorkType } from '@prisma/client';

export type ScheduleRestInput = {
  workType: WorkType;
  shiftPattern: string | null;
  daysOfWeek: string;
  cycleStartDate: Date | null;
};

/**
 * يوم الاستراحة: السبت=0، الأحد=1، ... الجمعة=6 في daysOfWeek
 * JS: الأحد=0، الاثنين=1، ... السبت=6
 * تحويل: (jsDay + 1) % 7
 */
export function isRestDayFromSchedule(date: Date, schedule: ScheduleRestInput): boolean {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const jsDay = date.getDay();

  if (schedule.workType === 'MORNING' || (schedule.workType === 'SHIFTS' && schedule.shiftPattern === 'FIXED')) {
    const dayIndex = (jsDay + 1) % 7;
    const workDays = schedule.daysOfWeek
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    return !workDays.includes(dayIndex);
  }

  if (schedule.workType === 'SHIFTS' && schedule.shiftPattern && schedule.cycleStartDate) {
    const cycleStart = new Date(schedule.cycleStartDate);
    cycleStart.setHours(0, 0, 0, 0);
    const diffMs = dayStart.getTime() - cycleStart.getTime();
    const dayIndex = Math.floor(diffMs / 86400000);
    if (dayIndex < 0) return true;
    const pattern = schedule.shiftPattern;
    const isWork =
      pattern === '1x1'
        ? dayIndex % 2 === 0
        : pattern === '1x2'
          ? dayIndex % 3 === 0
          : pattern === '1x3'
            ? dayIndex % 4 === 0
            : true;
    return !isWork;
  }

  return false;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return x;
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateKeyFromDb(d: Date): string {
  const x = new Date(d);
  return localDateKey(x);
}

export function* eachLocalDay(from: Date, to: Date): Generator<Date> {
  let cur = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  while (cur.getTime() <= end.getTime()) {
    yield new Date(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0);
  }
}
