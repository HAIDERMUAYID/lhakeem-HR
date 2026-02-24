import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HolidaysService } from '../holidays/holidays.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { LeaveStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

const DEFAULT_ANNUAL_ALLOWANCE = 36;
const DEFAULT_MONTHLY_ACCRUAL = 3;

/** عدد الأيام من بداية الفترة حتى اليوم (شامل) */
function daysBetween(start: Date, end: Date): number {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000)) + 1;
}

const HOURS_PER_DAY = 7;

function parseTimeToMinutes(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getHoursFromSchedule(schedule: { startTime: string; endTime: string; breakStart?: string | null; breakEnd?: string | null } | null): number {
  if (!schedule) return HOURS_PER_DAY;
  const start = parseTimeToMinutes(schedule.startTime);
  const end = parseTimeToMinutes(schedule.endTime);
  let breakMins = 0;
  if (schedule.breakStart && schedule.breakEnd) {
    breakMins = parseTimeToMinutes(schedule.breakEnd) - parseTimeToMinutes(schedule.breakStart);
  }
  const totalMins = Math.max(0, end - start - breakMins);
  return totalMins / 60 || HOURS_PER_DAY;
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private holidaysService: HolidaysService,
    private workSchedulesService: WorkSchedulesService,
  ) {}

  /**
   * رصيد الموظف: رصيد واحد مخزَن (leaveBalance). يُخصم عند اعتماد إجازة ويُزاد بالاستحقاق اليومي.
   * عند الإدخال يُحسب من (قيمة + تاريخ «لغاية») ويُخزَن مرة واحدة في الموظف.
   */
  async getBalanceInfo(employeeId: string, leaveTypeId?: string | null, _asOfDate?: Date | string | null) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { leaveBalance: true, balanceStartDate: true, createdAt: true, isActive: true },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');

    let annualAllowance = DEFAULT_ANNUAL_ALLOWANCE;
    let monthlyAccrual = DEFAULT_MONTHLY_ACCRUAL;
    if (leaveTypeId) {
      const lt = await this.prisma.leaveType.findUnique({
        where: { id: leaveTypeId },
        select: { annualAllowance: true, monthlyAccrual: true },
      });
      if (lt?.annualAllowance != null) annualAllowance = lt.annualAllowance;
      if (lt?.monthlyAccrual != null) monthlyAccrual = Number(lt.monthlyAccrual);
    } else {
      const first = await this.prisma.leaveType.findFirst({
        where: { isActive: true, deductFromBalance: true },
        select: { annualAllowance: true, monthlyAccrual: true },
      });
      if (first?.annualAllowance != null) annualAllowance = first.annualAllowance;
      if (first?.monthlyAccrual != null) monthlyAccrual = Number(first.monthlyAccrual);
    }

    const accrualPerDay = annualAllowance / 365;
    const baseBalance = Number(employee.leaveBalance);
    const totalBalanceCumulative = baseBalance;
    const startDate = employee.balanceStartDate ?? employee.createdAt;
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const leavesInMonth = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        leaveType: { deductFromBalance: true },
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
      select: { startDate: true, endDate: true, daysCount: true },
    });
    let leaveDaysInCurrentMonth = 0;
    for (const lv of leavesInMonth) {
      const start = new Date(lv.startDate);
      const end = new Date(lv.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const overlapStart = start < startOfMonth ? startOfMonth : start;
      const overlapEnd = end > endOfMonth ? endOfMonth : end;
      if (overlapStart <= overlapEnd) {
        leaveDaysInCurrentMonth += daysBetween(overlapStart, overlapEnd);
      }
    }

    return {
      totalBalanceCumulative: Math.round(totalBalanceCumulative * 100) / 100,
      accrualPerMonth: monthlyAccrual,
      accrualPerDay,
      daysPerOneDayAccrual: 365 / annualAllowance,
      balanceStartDate: startDate,
      baseBalance,
      leaveDaysInCurrentMonth,
    };
  }

  /** الرصيد الفعلي للموظف (المخزن + الاستحقاق) لاستخدامه عند الاعتماد وللعرض في القوائم */
  async getEffectiveBalance(employeeId: string): Promise<number> {
    const info = await this.getBalanceInfo(employeeId, undefined);
    return info.totalBalanceCumulative;
  }

  /** الرصيد الفعلي لعدة موظفين (للعرض في قائمة الموظفين — الرصيد المعتمد للإجازات الاعتيادية) */
  async getEffectiveBalances(employeeIds: string[]): Promise<Record<string, number>> {
    const unique = [...new Set(employeeIds)].slice(0, 100);
    const entries = await Promise.all(
      unique.map(async (id) => {
        try {
          const balance = await this.getEffectiveBalance(id);
          return [id, balance] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  /** التحقق من تداخل إجازة معتمدة أخرى لنفس الموظف */
  private async hasOverlappingApprovedLeave(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveId?: string,
  ): Promise<boolean> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const where: Prisma.LeaveRequestWhereInput = {
      employeeId,
      status: 'APPROVED',
      id: excludeLeaveId ? { not: excludeLeaveId } : undefined,
      AND: [
        { startDate: { lte: end } },
        { endDate: { gte: start } },
      ],
    };
    const existing = await this.prisma.leaveRequest.findFirst({ where });
    return !!existing;
  }

  async getStats() {
    const [total, pending, approved, rejected] = await Promise.all([
      this.prisma.leaveRequest.count(),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.leaveRequest.count({ where: { status: 'APPROVED' } }),
      this.prisma.leaveRequest.count({ where: { status: 'REJECTED' } }),
    ]);
    return { total, pending, approved, rejected };
  }

  async getChartData() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [byStatus, byLeaveType, byMonth] = await Promise.all([
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        _count: { id: true },
        where: { startDate: { gte: sixMonthsAgo } },
      }),
      this.prisma.$queryRaw<{ month: number; year: number; count: bigint }[]>`
        SELECT EXTRACT(MONTH FROM start_date)::int as month, EXTRACT(YEAR FROM start_date)::int as year, COUNT(*)::bigint as count
        FROM leave_requests
        WHERE start_date >= ${sixMonthsAgo}
        GROUP BY EXTRACT(YEAR FROM start_date), EXTRACT(MONTH FROM start_date)
        ORDER BY year, month
      `,
    ]);

    const leaveTypeIds = [...new Set(byLeaveType.map((b) => b.leaveTypeId))];
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { id: { in: leaveTypeIds } },
      select: { id: true, nameAr: true },
    });
    const ltMap = Object.fromEntries(leaveTypes.map((lt) => [lt.id, lt.nameAr]));

    return {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count.id])),
      byLeaveType: byLeaveType.map((b) => ({ leaveTypeId: b.leaveTypeId, nameAr: ltMap[b.leaveTypeId] ?? '—', count: b._count.id })),
      byMonth: byMonth.map((m) => ({ month: m.month, year: m.year, count: Number(m.count) })),
    };
  }

  async findOne(id: string) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true, leaveBalance: true } },
        leaveType: { select: { id: true, nameAr: true, deductFromBalance: true } },
      },
    });
    if (!req) throw new NotFoundException('طلب الإجازة غير موجود');
    return req;
  }

  async findForCalendar(year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return this.prisma.leaveRequest.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: {
        employee: {
          select: {
            fullName: true,
            jobTitle: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        leaveType: { select: { id: true, nameAr: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    search?: string;
    employeeId?: string;
    status?: LeaveStatus;
    departmentId?: string;
    leaveTypeId?: string;
    fromDate?: string;
    toDate?: string;
    /** افتراضي true: عرض طلبات الموظفين النشطين فقط. false = تشمل غير النشطين (للأرشفة). */
    activeOnly?: boolean;
  }) {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (params?.employeeId) where.employeeId = params.employeeId;
    if (params?.status) where.status = params.status;
    if (params?.leaveTypeId) where.leaveTypeId = params.leaveTypeId;
    if (params?.departmentId) where.employee = { departmentId: params.departmentId };
    if (params?.activeOnly !== false) where.employee = { ...(where.employee as object), isActive: true };
    if (params?.fromDate) where.endDate = { gte: new Date(params.fromDate) };
    if (params?.toDate) where.startDate = { lte: new Date(params.toDate + 'T23:59:59') };
    if (params?.search?.trim()) {
      const s = params.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { employee: { fullName: { contains: s, mode: 'insensitive' } } },
            { employee: { department: { name: { contains: s, mode: 'insensitive' } } } },
            { leaveType: { nameAr: { contains: s, mode: 'insensitive' } } },
            { leaveType: { name: { contains: s, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip: params?.skip ?? 0,
        take: params?.take ?? 20,
        include: {
          employee: { select: { id: true, fullName: true, department: true, leaveBalance: true } },
          leaveType: { select: { id: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, total };
  }

  async create(dto: {
    employeeId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate?: Date;
    /** للإجازة الزمنية: وقت البداية (HH:mm أو HH:mm:ss). المباشرة نفس اليوم. */
    startTime?: string;
    daysCount?: number;
    hoursCount?: number;
    reason?: string;
    createdByUserId?: string;
  }) {
    if (!dto.employeeId?.trim()) {
      throw new BadRequestException('يجب اختيار الموظف');
    }
    if (!dto.leaveTypeId?.trim()) {
      throw new BadRequestException('يجب اختيار نوع الإجازة');
    }
    if (!dto.startDate) {
      throw new BadRequestException('يجب اختيار تاريخ بداية الإجازة');
    }
    const emp = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { isActive: true },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    if (!emp.isActive) {
      throw new BadRequestException('لا يمكن إنشاء طلب إجازة لموظف غير نشط (متوقف). يظهر في الأرشيف فقط.');
    }

    let { startDate, endDate, daysCount, hoursCount, startTime } = dto;
    let startD = new Date(startDate);

    const [employee, schedule, leaveType] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: dto.employeeId } }),
      this.workSchedulesService.getScheduleForEmployeeMonth(
        dto.employeeId,
        startD.getFullYear(),
        startD.getMonth() + 1,
      ),
      this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } }),
    ]);
    if (!employee) {
      throw new BadRequestException('الموظف غير موجود');
    }
    if (!leaveType) {
      throw new BadRequestException('نوع الإجازة غير موجود');
    }
    const hoursPerDay = getHoursFromSchedule(schedule);
    const skipHolidays = employee.workType === 'MORNING';

    if (hoursCount != null && hoursCount > 0 && startTime?.trim()) {
      const match = startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (match) {
        const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
        const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
        startD = new Date(startDate);
        startD.setHours(h, m, 0, 0);
        const endD = new Date(startD);
        endD.setTime(endD.getTime() + hoursCount * 60 * 60 * 1000);
        startDate = startD;
        endDate = endD;
        daysCount = Math.ceil(hoursCount / hoursPerDay) || 1;
      }
    }

    const needHolidays =
      skipHolidays &&
      ((hoursCount != null && hoursCount > 0 && !endDate) || (daysCount != null && daysCount > 0 && !endDate));
    const rangeEnd = needHolidays ? new Date(startDate) : null;
    if (rangeEnd) rangeEnd.setDate(rangeEnd.getDate() + 60);
    const holidayDates = needHolidays
      ? new Set(
          (await this.holidaysService.findInRange(startDate, rangeEnd!)).map((h) => new Date(h.date).toDateString()),
        )
      : new Set<string>();

    if (hoursCount != null && hoursCount > 0) {
      if (!endDate) {
        let remaining = hoursCount;
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const maxIter = 365;
        let iter = 0;
        while (remaining > 0 && iter < maxIter) {
          const dStr = current.toDateString();
          if (!holidayDates.has(dStr)) {
            remaining -= hoursPerDay;
          }
          if (remaining <= 0) break;
          current.setDate(current.getDate() + 1);
          iter++;
        }
        endDate = new Date(current);
        endDate.setHours(23, 59, 59, 999);
      }
      daysCount = Math.ceil(hoursCount / hoursPerDay) || 1;
    } else if (daysCount != null && daysCount > 0 && !endDate) {
      let workingDays = 0;
      let current = new Date(startDate);
      current.setHours(0, 0, 0, 0);
      const maxIter = 365;
      let iter = 0;
      while (workingDays < daysCount && iter < maxIter) {
        const dStr = current.toDateString();
        if (!holidayDates.has(dStr)) workingDays++;
        if (workingDays >= daysCount) break;
        current.setDate(current.getDate() + 1);
        iter++;
      }
      endDate = new Date(current);
      endDate.setHours(23, 59, 59, 999);
      hoursCount = daysCount * hoursPerDay;
    }
    if (!daysCount) daysCount = 1;
    if (!endDate) endDate = new Date(startDate);

    const overlapping = await this.hasOverlappingApprovedLeave(dto.employeeId, startDate, endDate);
    if (overlapping) {
      throw new BadRequestException(
        'لدى الموظف إجازة معتمدة تتداخل مع التواريخ المحددة. لا يمكن إنشاء إجازة جديدة تتضمن أي يوم مغطى بإجازة معتمدة.',
      );
    }

    const autoApprove =
      leaveType.requiresApproval === false &&
      dto.createdByUserId != null &&
      dto.createdByUserId.trim() !== '';

    if (autoApprove) {
      if (leaveType.deductFromBalance) {
        const effectiveBalance = await this.getEffectiveBalance(dto.employeeId);
        if (effectiveBalance < (daysCount ?? 0)) {
          throw new BadRequestException(
            `رصيد الإجازات غير كافٍ (المتاح: ${effectiveBalance.toFixed(2)}، المطلوب: ${daysCount ?? 0})`,
          );
        }
      }
      const now = new Date();
      const created = await this.prisma.leaveRequest.create({
        data: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate,
          endDate: endDate!,
          daysCount: daysCount ?? 1,
          hoursCount: hoursCount ?? (daysCount ?? 1) * HOURS_PER_DAY,
          reason: dto.reason ?? undefined,
          status: 'APPROVED',
          approvedBy: dto.createdByUserId!,
          approvedAt: now,
          createdById: dto.createdByUserId!,
        },
        include: {
          employee: { select: { fullName: true } },
          leaveType: { select: { nameAr: true } },
        },
      });
      if (leaveType.deductFromBalance) {
        await this.prisma.employee.update({
          where: { id: dto.employeeId },
          data: { leaveBalance: { decrement: daysCount ?? 1 } },
        });
      }
      const rangeStart = new Date(startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(endDate!);
      rangeEnd.setHours(23, 59, 59, 999);
      await this.prisma.absence.deleteMany({
        where: {
          employeeId: dto.employeeId,
          status: 'RECORDED',
          date: { gte: rangeStart, lte: rangeEnd },
        },
      });
      await this.audit.log(
        dto.createdByUserId!,
        'LEAVE_APPROVE',
        'LeaveRequest',
        created.id,
        { employeeId: dto.employeeId, daysCount: daysCount ?? 1 },
      );
      return created;
    }

    const { createdByUserId, ...createData } = dto;
    return this.prisma.leaveRequest.create({
      data: {
        ...createData,
        startDate,
        endDate,
        daysCount,
        hoursCount: hoursCount ?? daysCount * HOURS_PER_DAY,
        ...(createdByUserId?.trim() ? { createdById: createdByUserId } : {}),
      },
      include: {
        employee: { select: { fullName: true } },
        leaveType: { select: { nameAr: true } },
      },
    });
  }

  async updateStatus(id: string, status: LeaveStatus, approvedBy: string) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });
    if (!req) throw new BadRequestException('طلب الإجازة غير موجود');

    if (status === 'APPROVED') {
      const overlapping = await this.hasOverlappingApprovedLeave(
        req.employeeId,
        req.startDate,
        req.endDate,
        id,
      );
      if (overlapping) {
        throw new BadRequestException(
          'لدى الموظف إجازة معتمدة أخرى تتداخل مع تواريخ هذا الطلب. لا يمكن اعتماد إجازتين تتضمنان نفس الأيام.',
        );
      }
    }

    if (status === 'APPROVED' && req.leaveType.deductFromBalance) {
      const effectiveBalance = await this.getEffectiveBalance(req.employeeId);
      if (effectiveBalance < req.daysCount) {
        throw new BadRequestException(
          `رصيد الإجازات غير كافٍ (المتاح: ${effectiveBalance.toFixed(2)}، المطلوب: ${req.daysCount})`
        );
      }
      await this.prisma.employee.update({
        where: { id: req.employeeId },
        data: { leaveBalance: { decrement: req.daysCount } },
      });
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        approvedBy,
        approvedAt: new Date(),
      },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (status === 'APPROVED') {
      const rangeStart = new Date(req.startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(req.endDate);
      rangeEnd.setHours(23, 59, 59, 999);
      await this.prisma.absence.deleteMany({
        where: {
          employeeId: req.employeeId,
          status: 'RECORDED',
          date: { gte: rangeStart, lte: rangeEnd },
        },
      });
    }

    await this.audit.log(
      approvedBy,
      status === 'APPROVED' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      'LeaveRequest',
      id,
      { employeeId: req.employeeId, daysCount: req.daysCount },
    );

    return updated;
  }

  async delete(id: string) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });
    if (!req) throw new NotFoundException('طلب الإجازة غير موجود');

    if (req.status === 'APPROVED' && req.leaveType.deductFromBalance) {
      await this.prisma.employee.update({
        where: { id: req.employeeId },
        data: { leaveBalance: { increment: req.daysCount } },
      });
    }

    await this.prisma.leaveRequest.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * تقرير الإجازات الرسمي للفترة المحددة مع KPIs وجدول التفاصيل.
   * يدعم الفلترة حسب الموظف، القسم، نوع الدوام، نوع الإجازة، الحالة.
   */
  async getOfficialReport(params: {
    fromDate: string;
    toDate: string;
    search?: string;
    departmentId?: string;
    leaveTypeId?: string;
    status?: LeaveStatus;
    workType?: 'MORNING' | 'SHIFTS';
  }) {
    const from = new Date(params.fromDate);
    const to = new Date(params.toDate + 'T23:59:59');
    const where: Prisma.LeaveRequestWhereInput = {
      startDate: { lte: to },
      endDate: { gte: from },
    };
    const employeeWhere: Prisma.EmployeeWhereInput = {};
    if (params.departmentId) employeeWhere.departmentId = params.departmentId;
    if (params.workType) employeeWhere.workType = params.workType;
    if (Object.keys(employeeWhere).length) where.employee = employeeWhere;
    if (params.leaveTypeId) where.leaveTypeId = params.leaveTypeId;
    if (params.status) where.status = params.status;
    if (params.search?.trim()) {
      const s = params.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { employee: { fullName: { contains: s, mode: 'insensitive' } } },
            { employee: { department: { name: { contains: s, mode: 'insensitive' } } } },
            { leaveType: { nameAr: { contains: s, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const rows = await this.prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            fullName: true,
            jobTitle: true,
            workType: true,
            department: { select: { id: true, name: true } },
          },
        },
        leaveType: { select: { id: true, nameAr: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ employee: { fullName: 'asc' } }, { startDate: 'asc' }],
    });

    const uniqueEmployeeIds = new Set(rows.map((r) => r.employeeId));
    const totalDays = rows.reduce((s, r) => s + r.daysCount, 0);
    const isHourlyLeaveType = (nameAr: string) => /زمني/i.test(nameAr || '');
    const hourlyLeaves = rows.filter((r) => isHourlyLeaveType(r.leaveType.nameAr) && r.hoursCount != null && Number(r.hoursCount) > 0);
    const hourlyCount = hourlyLeaves.length;
    const byWorkType = { morning: 0, shifts: 0 };
    const byDeptMap = new Map<string, { departmentId: string; name: string; count: number }>();
    const byLeaveTypeMap = new Map<string, { leaveTypeId: string; nameAr: string; count: number }>();

    for (const r of rows) {
      if (r.employee.workType === 'MORNING') byWorkType.morning++;
      else byWorkType.shifts++;
      const deptId = r.employee.department.id;
      const deptName = r.employee.department.name;
      if (!byDeptMap.has(deptId)) byDeptMap.set(deptId, { departmentId: deptId, name: deptName, count: 0 });
      byDeptMap.get(deptId)!.count++;
      const ltId = r.leaveTypeId;
      const ltName = r.leaveType.nameAr;
      if (!byLeaveTypeMap.has(ltId)) byLeaveTypeMap.set(ltId, { leaveTypeId: ltId, nameAr: ltName, count: 0 });
      byLeaveTypeMap.get(ltId)!.count++;
    }

    const kpis = {
      totalLeaves: rows.length,
      employeesOnLeave: uniqueEmployeeIds.size,
      totalDays,
      hourlyLeavesCount: hourlyCount,
      byWorkType: {
        morning: byWorkType.morning,
        shifts: byWorkType.shifts,
      },
      byDepartment: Array.from(byDeptMap.values()).sort((a, b) => b.count - a.count),
      byLeaveType: Array.from(byLeaveTypeMap.values()).sort((a, b) => b.count - a.count),
    };

    const tableRows = rows.map((r) => {
      const hourlyType = isHourlyLeaveType(r.leaveType.nameAr);
      return {
        id: r.id,
        fullName: r.employee.fullName,
        jobTitle: r.employee.jobTitle,
        departmentName: r.employee.department.name,
        workType: r.employee.workType,
        leaveTypeName: r.leaveType.nameAr,
        startDate: r.startDate,
        endDate: r.endDate,
        daysCount: r.daysCount,
        hoursCount: r.hoursCount != null ? Number(r.hoursCount) : null,
        isHourlyLeave: hourlyType,
        status: r.status,
        organizerName: r.createdBy?.name ?? '—',
        reason: r.reason ?? null,
      };
    });

    return {
      fromDate: params.fromDate,
      toDate: params.toDate,
      kpis,
      rows: tableRows,
    };
  }
}
