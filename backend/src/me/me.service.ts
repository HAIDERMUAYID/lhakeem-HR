import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { HolidaysService } from '../holidays/holidays.service';
import { computeDailyAttendance } from '../devices/attendance-from-punches';
import { evaluateAgainstSchedule } from '../devices/attendance-metrics';
import {
  eachLocalDay,
  endOfLocalDay,
  isRestDayFromSchedule,
  localDateKey,
  startOfLocalDay,
} from '../common/schedule-day.util';

@Injectable()
export class MeService {
  constructor(
    private prisma: PrismaService,
    private devices: DevicesService,
    private holidays: HolidaysService,
  ) {}

  async home(userId: string, monthKey?: string) {
    const employee = await this.employeeForUser(userId);
    const now = new Date();
    const [year, month] = this.parseMonth(monthKey, now);
    const from = startOfLocalDay(new Date(year, month - 1, 1));
    const to = endOfLocalDay(new Date(year, month, 0));

    const historyFrom = startOfLocalDay(new Date(from.getFullYear(), from.getMonth() - 2, 1));
    const horizonEnd = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 40));
    const contextTo = endOfLocalDay(to.getTime() > horizonEnd.getTime() ? to : horizonEnd);
    const [schedule, scheduleRows, leaveRows, absences, holidayRows] = await Promise.all([
      this.prisma.workSchedule.findFirst({
        where: { employeeId: employee.id, year, month },
        orderBy: { status: 'desc' },
      }),
      this.prisma.workSchedule.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
      }),
      this.prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        include: { leaveType: { select: { nameAr: true, name: true } } },
        orderBy: { startDate: 'desc' },
        take: 24,
      }),
      this.prisma.absence.findMany({
        where: { employeeId: employee.id, status: 'RECORDED', date: { gte: historyFrom, lte: contextTo } },
        orderBy: { date: 'desc' },
        take: 40,
      }),
      this.holidays.findInRange(historyFrom, contextTo),
    ]);

    const pins = employee.fingerprints.map((f) => f.fingerprintId);
    const serials = [...new Set(employee.fingerprints.map((f) => f.device.code).filter(Boolean))];
    const pinSet = new Set(pins);
    const loadPunches = async (from: Date, until: Date) => {
      if (!serials.length) return [];
      try {
        const lists = await Promise.all(serials.map((serial) => this.devices.punchesOnSerial(serial, from, until)));
        return lists.flat().filter((p) => pinSet.has(p.pin));
      } catch {
        return [];
      }
    };
    const mine = (await loadPunches(from, to)).sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());

    const toDaily = (
      punches: { pin: string; scannedAt: Date }[],
    ) =>
      new Map(
        computeDailyAttendance(
          punches.map((p) => ({ deviceEmployeeCode: p.pin, employeeId: employee.id, scannedAt: p.scannedAt })),
        ).map((row) => [localDateKey(row.workDate), row]),
      );

    const daily = toDaily(mine);
    const yesterday = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const todayEnd = endOfLocalDay(now);
    let horizonDaily = daily;
    if ((yesterday < historyFrom || todayEnd > to) && serials.length) {
      const extra = await loadPunches(yesterday, todayEnd);
      horizonDaily = new Map(daily);
      for (const [key, row] of toDaily(extra)) horizonDaily.set(key, row);
    }

    const compose = (day: Date, punchMap: typeof daily) => {
      const key = localDateKey(day);
      const daySchedule =
        scheduleRows.find((row) => row.year === day.getFullYear() && row.month === day.getMonth() + 1) ?? null;
      const leave = leaveRows.find(
        (l) => l.status === 'APPROVED' && l.startDate <= endOfLocalDay(day) && l.endDate >= startOfLocalDay(day),
      );
      const holiday = holidayRows.find((h) => localDateKey(new Date(h.date)) === key);
      const absence = absences.find((a) => localDateKey(new Date(a.date)) === key);
      const rest = daySchedule ? isRestDayFromSchedule(day, daySchedule) : false;
      const punch = punchMap.get(key);
      const duty = !leave && !holiday && !rest;
      const metrics = evaluateAgainstSchedule({
        dutyDay: duty,
        workDate: day,
        startTime: daySchedule?.startTime,
        endTime: daySchedule?.endTime,
        breakStart: daySchedule?.breakStart,
        breakEnd: daySchedule?.breakEnd,
        checkInAt: punch?.checkInAt ?? null,
        checkOutAt: punch?.checkOutAt ?? null,
        displayMode: punch?.displayMode ?? null,
      });
      const future = startOfLocalDay(day).getTime() > startOfLocalDay(now).getTime();
      let status = 'ABSENT';
      let statusLabel = 'غائب';
      if (leave) {
        status = 'LEAVE';
        statusLabel = leave.leaveType.nameAr || 'إجازة';
      } else if (holiday && employee.workType === 'MORNING') {
        status = 'HOLIDAY';
        statusLabel = `عطلة: ${holiday.nameAr}`;
      } else if (rest) {
        status = 'REST';
        statusLabel = 'استراحة';
      } else if (punch?.displayMode === 'pair') {
        status = metrics.lateMinutes > 0 ? 'LATE' : 'PRESENT';
        statusLabel = metrics.lateMinutes > 0 ? 'متأخر' : 'حاضر';
      } else if (punch) {
        status = 'SINGLE';
        statusLabel = metrics.lateMinutes > 0 ? 'متأخر — بصمة واحدة' : 'حاضر — بصمة واحدة';
      } else if (future) {
        status = 'UPCOMING';
        statusLabel = daySchedule ? 'دوام قادم' : 'قادم';
      } else if (absence) {
        status = 'ABSENT';
        statusLabel = 'غياب مسجّل';
      }
      return {
        date: key,
        status,
        statusLabel,
        scheduledStart: duty ? metrics.scheduledStart : null,
        scheduledEnd: duty ? metrics.scheduledEnd : null,
        checkInAt: duty ? punch?.checkInAt?.toISOString() ?? null : null,
        checkOutAt: duty ? punch?.checkOutAt?.toISOString() ?? null : null,
        punchCount: punch?.punchCount ?? 0,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        workedMinutes: metrics.workedMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        expectedMinutes: metrics.expectedMinutes,
      };
    };

    const days = [];
    for (const day of eachLocalDay(from, startOfLocalDay(to))) days.push(compose(day, daily));
    const horizon = [];
    for (const day of eachLocalDay(yesterday, horizonEnd)) horizon.push(compose(day, horizonDaily));

    const todayKey = localDateKey(now);
    const today = days.find((d) => d.date === todayKey) ?? days[days.length - 1] ?? null;
    const counts = {
      present: days.filter((d) => d.status === 'PRESENT' || d.status === 'LATE' || d.status === 'SINGLE').length,
      late: days.filter((d) => d.lateMinutes > 0).length,
      absent: days.filter((d) => d.status === 'ABSENT').length,
      leave: days.filter((d) => d.status === 'LEAVE').length,
      rest: days.filter((d) => d.status === 'REST' || d.status === 'HOLIDAY').length,
      overtime: days.filter((d) => d.overtimeMinutes > 0).length,
    };

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        workType: employee.workType,
        department: employee.department.name,
        unit: employee.unit?.name ?? null,
        leaveBalance: Number(employee.leaveBalance),
        fingerprintId: pins[0] ?? null,
        fingerprints: employee.fingerprints.map((f) => ({
          pin: f.fingerprintId,
          deviceName: f.device.name,
          serial: f.device.code,
        })),
      },
      month: `${year}-${String(month).padStart(2, '0')}`,
      schedule: schedule
        ? {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            breakStart: schedule.breakStart,
            breakEnd: schedule.breakEnd,
            shiftPattern: schedule.shiftPattern,
            daysOfWeek: schedule.daysOfWeek,
            status: schedule.status,
            workType: schedule.workType,
          }
        : null,
      schedules: scheduleRows.map((s) => ({
        year: s.year,
        month: s.month,
        startTime: s.startTime,
        endTime: s.endTime,
        breakStart: s.breakStart,
        breakEnd: s.breakEnd,
        shiftPattern: s.shiftPattern,
        daysOfWeek: s.daysOfWeek,
        workType: s.workType,
        status: s.status,
      })),
      today,
      days,
      horizon,
      counts,
      leaves: leaveRows.map((l) => ({
        id: l.id,
        type: l.leaveType.nameAr || l.leaveType.name,
        startDate: localDateKey(new Date(l.startDate)),
        endDate: localDateKey(new Date(l.endDate)),
        daysCount: l.daysCount,
        status: l.status,
        reason: l.reason,
      })),
      absences: absences.map((a) => ({
        date: localDateKey(new Date(a.date)),
        reason: a.reason,
      })),
      punches: mine.slice(0, 400).map((p) => ({
        at: p.scannedAt.toISOString(),
        pin: p.pin,
      })),
    };
  }

  private async employeeForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) throw new ForbiddenException('هذا الحساب غير مربوط بموظف');
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      include: {
        department: { select: { name: true } },
        unit: { select: { name: true } },
        fingerprints: { include: { device: { select: { name: true, code: true } } } },
      },
    });
    if (!employee || !employee.isActive) throw new ForbiddenException('سجل الموظف غير متاح');
    return employee;
  }

  private parseMonth(monthKey: string | undefined, now: Date): [number, number] {
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      const [y, m] = monthKey.split('-').map(Number);
      if (m >= 1 && m <= 12) return [y, m];
    }
    return [now.getFullYear(), now.getMonth() + 1];
  }
}
