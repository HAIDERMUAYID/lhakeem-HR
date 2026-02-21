import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { WorkType } from '@prisma/client';

export type AbsenceBlockReason = 'LEAVE' | 'REST_DAY' | 'OFFICIAL_HOLIDAY';

export interface ValidateAbsenceResult {
  canAdd: boolean;
  reason?: AbsenceBlockReason;
  message?: string;
  holidayName?: string;
}

@Injectable()
export class AttendanceValidationService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}

  /**
   * يوم الاستراحة: السبت=0، الأحد=1، ... الجمعة=6 في daysOfWeek
   * JS: الأحد=0، الاثنين=1، ... السبت=6
   * تحويل: (jsDay + 1) % 7 يعطي: أحد->1، اثنين->2، ... سبت->0، جمعة->6
   */
  private isRestDayFromSchedule(
    date: Date,
    schedule: {
      workType: WorkType;
      shiftPattern: string | null;
      daysOfWeek: string;
      cycleStartDate: Date | null;
    },
  ): boolean {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const dayStart = new Date(y, date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const jsDay = date.getDay();

    if (schedule.workType === 'MORNING' || (schedule.workType === 'SHIFTS' && schedule.shiftPattern === 'FIXED')) {
      const dayIndex = (jsDay + 1) % 7;
      const workDays = schedule.daysOfWeek.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
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

  async validateCanAddAbsence(employeeId: string, date: Date): Promise<ValidateAbsenceResult> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);

    const [employee, leaveOnDate, holidays, workSchedule] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { workType: true, fullName: true },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: d },
        },
      }),
      this.holidaysService.findInRange(d, nextDay),
      this.prisma.workSchedule.findUnique({
        where: {
          employeeId_year_month: {
            employeeId,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          },
        },
      }),
    ]);

    if (!employee) {
      return { canAdd: false, reason: undefined, message: 'الموظف غير موجود' };
    }

    if (leaveOnDate) {
      return {
        canAdd: false,
        reason: 'LEAVE',
        message: 'لا يمكن تسجيل غياب لهذا الموظف في هذا اليوم لأنه لديه إجازة معتمدة في هذا التاريخ.',
      };
    }

    if (workSchedule && this.isRestDayFromSchedule(d, workSchedule)) {
      return {
        canAdd: false,
        reason: 'REST_DAY',
        message: 'لا يمكن تسجيل غياب لهذا الموظف في هذا اليوم لأنه يوم استراحة حسب جدول دوامه.',
      };
    }

    if (holidays.length > 0) {
      const holiday = holidays[0];
      const appliesToMorning =
        holiday.appliesTo === 'MORNING_ONLY' || holiday.appliesTo === 'ALL';
      if (employee.workType === 'MORNING' && appliesToMorning) {
        return {
          canAdd: false,
          reason: 'OFFICIAL_HOLIDAY',
          message: `لا يمكن تسجيل غياب لهذا الموظف في هذا اليوم لأنه عطلة رسمية (${holiday.nameAr}) والموظف صباحي.`,
          holidayName: holiday.nameAr,
        };
      }
    }

    return { canAdd: true };
  }
}
