import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { isRestDayFromSchedule } from '../common/schedule-day.util';

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

    if (workSchedule && isRestDayFromSchedule(d, workSchedule)) {
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
