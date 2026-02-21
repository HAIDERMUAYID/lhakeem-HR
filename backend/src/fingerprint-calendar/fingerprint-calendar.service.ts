import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** هل التاريخ يوم عمل حسب الجدول؟ */
function isWorkDay(
  date: Date,
  workType: string,
  shiftPattern: string | null,
  daysOfWeek: string,
  cycleStartDate: Date | null,
): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month - 1 + 1, 0);
  const inMonth = (d: Date) => d >= firstDay && d <= lastDay;

  if (workType === 'MORNING' || (workType === 'SHIFTS' && shiftPattern === 'FIXED')) {
    const weekdays = daysOfWeek
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
    const dayOfWeek = (date.getDay() + 1) % 7;
    return weekdays.includes(dayOfWeek);
  }

  if (workType === 'SHIFTS' && shiftPattern && shiftPattern !== 'FIXED' && cycleStartDate) {
    const step =
      shiftPattern === '1x1' ? 2 : shiftPattern === '1x2' ? 3 : shiftPattern === '1x3' ? 4 : 2;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    let cur = new Date(cycleStartDate);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(lastDay);
    end.setDate(end.getDate() + 1);
    while (cur < end) {
      if (cur.getTime() === d.getTime()) return true;
      if (cur > d) break;
      cur.setDate(cur.getDate() + step);
    }
    return false;
  }

  return false;
}

/** تحويل "HH:mm" إلى دقائق من منتصف الليل */
function timeToMinutes(t: string): number {
  const [h = 0, m = 0] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** هل الوقت الحالي ضمن فترة الاستراحة؟ */
function isInBreak(breakStart: string | null, breakEnd: string | null, timeMinutes: number): boolean {
  if (!breakStart || !breakEnd) return false;
  const start = timeToMinutes(breakStart);
  let end = timeToMinutes(breakEnd);
  if (end <= start) end += 24 * 60;
  if (timeMinutes < start) timeMinutes += 24 * 60;
  return timeMinutes >= start && timeMinutes < end;
}

export type DayStatus = 'ON_DUTY' | 'ON_LEAVE' | 'NO_SCHEDULE' | 'ABSENT' | 'BREAK';

@Injectable()
export class FingerprintCalendarService {
  constructor(private prisma: PrismaService) {}

  /**
   * تقويم شهر: عدد الموظفين (المرتبطين بالجهاز) في كل حالة لكل يوم.
   */
  async getMonthCalendar(params: {
    deviceId: string;
    year: number;
    month: number;
    departmentId?: string;
    employeeId?: string;
    workType?: string;
    search?: string;
  }) {
    const { deviceId, year, month, departmentId, employeeId, workType, search } = params;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month - 1 + 1, 0);
    const daysInMonth = lastDay.getDate();

    const fingerprints = await this.prisma.employeeFingerprint.findMany({
      where: {
        deviceId,
        employee: {
          isActive: true,
          ...(departmentId && { departmentId }),
          ...(employeeId && { id: employeeId }),
          ...(workType && { workType: workType as 'MORNING' | 'SHIFTS' }),
          ...(search?.trim() && {
            fullName: { contains: search.trim(), mode: 'insensitive' as const },
          }),
        },
      },
      include: {
        employee: { select: { id: true } },
      },
    });
    const employeeIds = [...new Set(fingerprints.map((f) => f.employeeId))];
    if (employeeIds.length === 0) {
      return {
        year,
        month,
        deviceId,
        days: Array.from({ length: daysInMonth }, (_, i) => ({
          date: `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
          onDuty: 0,
          onLeave: 0,
          noSchedule: 0,
          absent: 0,
        })),
      };
    }

    const [schedules, leaveRanges, absences, holidays] = await Promise.all([
      this.prisma.workSchedule.findMany({
        where: { employeeId: { in: employeeIds }, year, month, status: 'APPROVED' },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          startDate: { lte: lastDay },
          endDate: { gte: firstDay },
        },
      }),
      this.prisma.absence.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: firstDay, lte: lastDay },
          status: 'RECORDED',
        },
      }),
      this.prisma.holiday.findMany({
        where: { date: { gte: firstDay, lte: lastDay } },
      }),
    ]);

    const scheduleByEmp = new Map(schedules.map((s) => [s.employeeId, s]));
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const holidaySet = new Set(holidays.map((h) => toDateStr(h.date)));

    const days: { date: string; onDuty: number; onLeave: number; noSchedule: number; absent: number }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      let onDuty = 0;
      let onLeave = 0;
      let noSchedule = 0;
      let absent = 0;

      for (const empId of employeeIds) {
        const onLeaveThisDay = leaveRanges.some(
          (l) =>
            l.employeeId === empId &&
            l.startDate <= endOfDay &&
            l.endDate >= startOfDay,
        );
        if (onLeaveThisDay) {
          onLeave++;
          continue;
        }

        const schedule = scheduleByEmp.get(empId);
        if (!schedule) {
          noSchedule++;
          continue;
        }

        const workDay = isWorkDay(
          startOfDay,
          schedule.workType,
          schedule.shiftPattern,
          schedule.daysOfWeek,
          schedule.cycleStartDate,
        );
        if (!workDay) {
          noSchedule++;
          continue;
        }

        const isHoliday = holidaySet.has(dateStr);
        if (isHoliday) {
          noSchedule++;
          continue;
        }

        const hasAbsence = absences.some(
          (a) => a.employeeId === empId && toDateStr(a.date) === dateStr,
        );
        if (hasAbsence) {
          absent++;
          continue;
        }

        onDuty++;
      }

      days.push({ date: dateStr, onDuty, onLeave, noSchedule, absent });
    }

    return { year, month, deviceId, days };
  }

  /**
   * تفاصيل يوم: قائمة الموظفين المرتبطين بالجهاز مع الحالة وأوقات الدوام والاستراحة.
   */
  async getDayDetail(params: {
    deviceId: string;
    date: string;
    departmentId?: string;
    employeeId?: string;
    time?: string;
    search?: string;
  }) {
    const { deviceId, date, departmentId, employeeId, time: timeParam, search } = params;
    const dateStr = date.slice(0, 10);
    const [y, mo, day] = dateStr.split('-').map(Number);
    const startOfDay = new Date(y, mo - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(y, mo - 1, day, 23, 59, 59, 999);
    const year = y;
    const month = mo;

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, code: true, location: true },
    });
    if (!device) return null;

    const fingerprints = await this.prisma.employeeFingerprint.findMany({
      where: {
        deviceId,
        employee: {
          isActive: true,
          ...(departmentId && { departmentId }),
          ...(employeeId && { id: employeeId }),
          ...(search?.trim() && {
            fullName: { contains: search.trim(), mode: 'insensitive' as const },
          }),
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const empIds = fingerprints.map((f) => f.employeeId);
    const [schedules, leaveRanges, absences, holidays] = await Promise.all([
      this.prisma.workSchedule.findMany({
        where: { employeeId: { in: empIds }, year, month, status: 'APPROVED' },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: empIds },
          status: 'APPROVED',
          startDate: { lte: endOfDay },
          endDate: { gte: startOfDay },
        },
      }),
      this.prisma.absence.findMany({
        where: {
          employeeId: { in: empIds },
          date: { gte: startOfDay, lte: endOfDay },
          status: 'RECORDED',
        },
      }),
      this.prisma.holiday.findMany({
        where: { date: { gte: startOfDay, lte: endOfDay } },
      }),
    ]);

    const scheduleByEmp = new Map(schedules.map((s) => [s.employeeId, s]));
    const onLeaveSet = new Set(leaveRanges.map((l) => l.employeeId));
    const absentSet = new Set(absences.map((a) => a.employeeId));
    const isHoliday = holidays.length > 0;

    let timeMinutes: number | null = null;
    if (timeParam?.trim()) {
      const [h, m] = timeParam.trim().split(':').map(Number);
      if (!Number.isNaN(h)) timeMinutes = (h || 0) * 60 + (m || 0);
    }

    const employees = fingerprints.map((fp) => {
      const empId = fp.employeeId;
      const schedule = scheduleByEmp.get(empId);
      let status: DayStatus = 'NO_SCHEDULE';
      if (onLeaveSet.has(empId)) status = 'ON_LEAVE';
      else if (schedule) {
        const workDay = isWorkDay(
          startOfDay,
          schedule.workType,
          schedule.shiftPattern,
          schedule.daysOfWeek,
          schedule.cycleStartDate,
        );
        if (!workDay || isHoliday) status = 'NO_SCHEDULE';
        else if (absentSet.has(empId)) status = 'ABSENT';
        else {
          status = 'ON_DUTY';
          if (timeMinutes !== null && isInBreak(schedule.breakStart, schedule.breakEnd, timeMinutes)) {
            status = 'BREAK';
          }
        }
      }

      return {
        employeeId: fp.employee.id,
        fullName: fp.employee.fullName,
        jobTitle: fp.employee.jobTitle,
        departmentName: fp.employee.department?.name ?? '—',
        deviceName: device.name,
        fingerprintId: fp.fingerprintId,
        startTime: schedule?.startTime ?? '—',
        endTime: schedule?.endTime ?? '—',
        breakStart: schedule?.breakStart ?? null,
        breakEnd: schedule?.breakEnd ?? null,
        status,
      };
    });

    return {
      date: dateStr,
      device,
      employees,
    };
  }
}
