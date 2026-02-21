import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AbsencesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async validateAbsence(employeeId: string, date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);

    const [employee, leaveOnDate, holidays, workSchedule] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { workType: true },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: d },
          endDate: { gte: d },
        },
      }),
      this.prisma.holiday.findMany({
        where: {
          date: { gte: d, lt: nextDay },
        },
      }),
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

    if (leaveOnDate) {
      throw new ConflictException(
        `الموظف لديه إجازة معتمدة في هذا التاريخ - يرجى إلغاء الغياب أو مراجعة الإجازة`
      );
    }
    if (holidays.length > 0 && employee?.workType === 'MORNING') {
      const scope = holidays[0].appliesTo;
      if (scope === 'MORNING_ONLY' || scope === 'ALL') {
        throw new ConflictException(
          `التاريخ عطلة رسمية (${holidays[0].nameAr}) - لا يُسجّل غياب للموظفين الصباحيين في العطل`
        );
      }
    }

    if (employee?.workType === 'SHIFTS' && workSchedule?.breakStart && workSchedule?.breakEnd) {
      throw new ConflictException(
        `الموظف يعمل بجدول خفارات ولديه استراحة (${workSchedule.breakStart}-${workSchedule.breakEnd}) - تأكد من أن الغياب خارج وقت الاستراحة`
      );
    }
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    employeeId?: string;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const where: Prisma.AbsenceWhereInput = {};
    if (params?.employeeId) where.employeeId = params.employeeId;
    if (params?.fromDate || params?.toDate) {
      where.date = {};
      if (params.fromDate) where.date.gte = params.fromDate;
      if (params.toDate) where.date.lte = params.toDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.absence.findMany({
        where,
        skip: params?.skip ?? 0,
        take: params?.take ?? 20,
        include: {
          employee: { select: { id: true, fullName: true, department: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.absence.count({ where }),
    ]);

    return { data, total };
  }

  async create(dto: { employeeId: string; date: Date; reason?: string }, recordedBy: string) {
    await this.validateAbsence(dto.employeeId, dto.date);

    const absence = await this.prisma.absence.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        recordedBy,
        status: 'RECORDED',
      },
      include: {
        employee: { select: { fullName: true } },
      },
    });

    await this.audit.log(
      recordedBy,
      'ABSENCE_CREATE',
      'Absence',
      absence.id,
      { employeeId: dto.employeeId, date: dto.date },
    );

    return absence;
  }

  async cancel(id: string, cancelledBy: string) {
    const abs = await this.prisma.absence.findUnique({ where: { id } });
    if (!abs) throw new BadRequestException('الغياب غير موجود');
    if (abs.status === 'CANCELLED') throw new BadRequestException('الغياب ملغى مسبقاً');

    const updated = await this.prisma.absence.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy,
      },
      include: { employee: { select: { fullName: true } } },
    });

    await this.audit.log(cancelledBy, 'ABSENCE_CANCEL', 'Absence', id, {
      employeeId: abs.employeeId,
      date: abs.date,
    });

    return updated;
  }
}
