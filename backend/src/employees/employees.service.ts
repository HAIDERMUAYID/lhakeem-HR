import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkType } from '@prisma/client';
import { Prisma } from '@prisma/client';

/** عدد الأيام بين تاريخين (شامل) */
function daysBetween(start: Date, end: Date): number {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000)) + 1;
}

const DEFAULT_ANNUAL_ALLOWANCE = 36;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async getStats(departmentId?: string) {
    const baseWhere: Prisma.EmployeeWhereInput = departmentId ? { departmentId } : {};
    const [total, active, inactive, morning, shifts] = await Promise.all([
      this.prisma.employee.count({ where: baseWhere }),
      this.prisma.employee.count({ where: { ...baseWhere, isActive: true } }),
      this.prisma.employee.count({ where: { ...baseWhere, isActive: false } }),
      this.prisma.employee.count({ where: { ...baseWhere, isActive: true, workType: 'MORNING' } }),
      this.prisma.employee.count({ where: { ...baseWhere, isActive: true, workType: 'SHIFTS' } }),
    ]);
    return { total, active, inactive, morning, shifts };
  }

  /** إحصائيات إكمال البيانات: عدد النشطين وعدد من لم يُحدّد لهم رصيد لغاية تاريخ */
  async getDataCompletionStats(departmentId?: string, baseline?: string) {
    const baseWhere: Prisma.EmployeeWhereInput = { isActive: true };
    if (departmentId) baseWhere.departmentId = departmentId;
    const baselineDate = baseline ? new Date(baseline) : null;
    const hasBaseline = baselineDate != null && !Number.isNaN(baselineDate.getTime());
    const [totalActive, withoutBalanceDate, updatedIncompleteSinceBaseline] = await Promise.all([
      this.prisma.employee.count({ where: baseWhere }),
      this.prisma.employee.count({
        where: { ...baseWhere, balanceStartDate: null },
      }),
      hasBaseline
        ? this.prisma.employee.count({
            where: { ...baseWhere, balanceStartDate: null, updatedAt: { gte: baselineDate! } },
          })
        : Promise.resolve(0),
    ]);
    return {
      totalActive,
      withoutBalanceDate,
      baseline: hasBaseline ? baselineDate!.toISOString() : null,
      updatedIncompleteSinceBaseline,
    };
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    departmentId?: string;
    workType?: WorkType;
    search?: string;
    includeInactive?: boolean;
    /** عرض الموظفين النشطين الذين لم يُحدّد لهم تاريخ رصيد (لغاية تاريخ) فقط */
    incompleteOnly?: boolean;
    /** فلترة حسب آخر تحديث (ISO string) */
    updatedAfter?: string;
    updatedBefore?: string;
    sortBy?: 'fullName' | 'jobTitle' | 'leaveBalance' | 'createdAt' | 'updatedAt' | 'department';
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.EmployeeWhereInput = {};
    if (!params?.includeInactive) where.isActive = true;
    if (params?.incompleteOnly) {
      where.isActive = true;
      where.balanceStartDate = null;
    }
    if (params?.departmentId) where.departmentId = params.departmentId;
    if (params?.workType) where.workType = params.workType;
    const updatedAtFilter: Prisma.DateTimeFilter = {};
    if (params?.updatedAfter) {
      const d = new Date(params.updatedAfter);
      if (!Number.isNaN(d.getTime())) updatedAtFilter.gte = d;
    }
    if (params?.updatedBefore) {
      const d = new Date(params.updatedBefore);
      if (!Number.isNaN(d.getTime())) updatedAtFilter.lt = d;
    }
    if (Object.keys(updatedAtFilter).length > 0) {
      where.updatedAt = updatedAtFilter;
    }
    const searchTrim = params?.search?.trim();
    if (searchTrim && searchTrim.length >= 2) {
      where.OR = [
        { fullName: { contains: searchTrim, mode: 'insensitive' } },
        { jobTitle: { contains: searchTrim, mode: 'insensitive' } },
        { department: { name: { contains: searchTrim, mode: 'insensitive' } } },
      ];
    }

    const orderField = params?.sortBy ?? 'fullName';
    const orderDir = params?.sortOrder ?? 'asc';
    const orderBy =
      orderField === 'department'
        ? { department: { name: orderDir } }
        : orderField === 'updatedAt' || orderField === 'createdAt'
          ? { [orderField]: orderDir }
          : { [orderField]: orderDir };

    const take = Math.min(Math.max(1, params?.take ?? 20), 5000);
    const skip = params?.skip ?? 0;

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take,
        include: {
          department: { select: { id: true, name: true, code: true } },
          manager: { select: { fullName: true } },
          managerUser: { select: { id: true, name: true } },
          fingerprints: {
            select: {
              id: true,
              fingerprintId: true,
              device: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data: employees, total };
  }

  async findOne(id: string) {
    const now = new Date();
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        manager: { select: { id: true, fullName: true } },
        workSchedules: {
          where: { year: now.getFullYear(), month: now.getMonth() + 1 },
          take: 1,
        },
        fingerprints: {
          select: {
            id: true,
            fingerprintId: true,
            device: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!emp) return null;
    const { workSchedules, ...rest } = emp;
    return { ...rest, workSchedule: workSchedules[0] ?? null };
  }

  async create(dto: {
    fullName: string;
    jobTitle: string;
    departmentId: string;
    managerId?: string;
    managerUserId?: string | null;
    workType?: 'MORNING' | 'SHIFTS';
    leaveBalance?: number;
    balanceStartDate?: string | Date | null;
    isActive?: boolean;
  }) {
    let leaveBalance = dto.leaveBalance ?? 0;
    let balanceStartDate: Date | null = null;

    const asOfRaw = dto.balanceStartDate;
    const asOf =
      asOfRaw !== undefined && asOfRaw !== null && asOfRaw !== ''
        ? (typeof asOfRaw === 'string' ? new Date(asOfRaw) : asOfRaw)
        : null;
    if (leaveBalance !== undefined && asOf != null && !Number.isNaN(asOf.getTime())) {
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const periodStart = new Date(asOf);
      periodStart.setHours(0, 0, 0, 0);
      const lt = await this.prisma.leaveType.findFirst({
        where: { isActive: true, deductFromBalance: true },
        select: { annualAllowance: true },
      });
      const annualAllowance = lt?.annualAllowance ?? DEFAULT_ANNUAL_ALLOWANCE;
      const accrualPerDay = Number(annualAllowance) / 365;
      const daysInPeriod = daysBetween(periodStart, now);
      leaveBalance = Math.round(Math.max(0, leaveBalance + daysInPeriod * accrualPerDay) * 100) / 100;
    }

    return this.prisma.employee.create({
      data: {
        fullName: dto.fullName,
        jobTitle: dto.jobTitle,
        departmentId: dto.departmentId,
        managerId: dto.managerId,
        managerUserId: dto.managerUserId ?? undefined,
        workType: (dto.workType as WorkType) || 'MORNING',
        leaveBalance,
        balanceStartDate,
        isActive: dto.isActive ?? true,
      },
      include: { department: true, managerUser: { select: { id: true, name: true } } },
    });
  }

  async importFromCsv(
    rows: { fullName: string; jobTitle?: string; departmentCode: string; workType?: string; leaveBalance?: number }[],
    fileName?: string,
  ) {
    const departments = await this.prisma.department.findMany({
      where: { code: { in: [...new Set(rows.map((r) => r.departmentCode))] } },
    });
    const deptByCode = Object.fromEntries(departments.map((d) => [d.code!, d.id]));

    const created: { fullName: string; ok: boolean; error?: string }[] = [];
    const batch = await this.prisma.importBatch.create({
      data: { fileName: fileName ?? null, importedCount: 0, failedCount: 0 },
    });

    for (const row of rows) {
      try {
        const deptId = deptByCode[row.departmentCode];
        if (!deptId) {
          created.push({ fullName: row.fullName, ok: false, error: `القسم ${row.departmentCode} غير موجود` });
          continue;
        }
        await this.prisma.employee.create({
          data: {
            fullName: row.fullName.trim(),
            jobTitle: row.jobTitle?.trim() || 'موظف',
            departmentId: deptId,
            importBatchId: batch.id,
            workType: row.workType === 'SHIFTS' ? 'SHIFTS' : 'MORNING',
            leaveBalance: row.leaveBalance ?? 0,
          },
        });
        created.push({ fullName: row.fullName, ok: true });
      } catch (e) {
        created.push({
          fullName: row.fullName,
          ok: false,
          error: e instanceof Error ? e.message : 'خطأ',
        });
      }
    }

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedCount: created.filter((c) => c.ok).length,
        failedCount: created.filter((c) => !c.ok).length,
      },
    });

    return {
      batchId: batch.id,
      imported: created.filter((c) => c.ok).length,
      failed: created.filter((c) => !c.ok).length,
      details: created,
    };
  }

  async getImportBatches() {
    return this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async deleteImportBatch(id: string) {
    const employeeIds = await this.prisma.employee.findMany({
      where: { importBatchId: id },
      select: { id: true },
    });
    const ids = employeeIds.map((e) => e.id);

    await this.prisma.$transaction([
      this.prisma.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } }),
      this.prisma.absence.deleteMany({ where: { employeeId: { in: ids } } }),
      this.prisma.workSchedule.deleteMany({ where: { employeeId: { in: ids } } }),
      this.prisma.employee.deleteMany({ where: { importBatchId: id } }),
      this.prisma.importBatch.delete({ where: { id } }),
    ]);

    return { ok: true };
  }

  /**
   * عند إدخال رصيد + تاريخ «لغاية»: النظام يحسب الرصيد الفعلي (المدخل + استحقاق من التاريخ حتى اليوم − إجازات معتمدة في الفترة)
   * ويخزّنه مرة واحدة، ثم يُمسح تاريخ الرصيد. من بعدها الرصيد واحد يُخصم عند الاعتماد ويُزاد بالاستحقاق اليومي.
   */
  async update(id: string, dto: Partial<{
    fullName: string;
    jobTitle: string;
    departmentId: string;
    managerId: string | null;
    managerUserId: string | null;
    workType: 'MORNING' | 'SHIFTS';
    leaveBalance: number;
    balanceStartDate: Date | string | null;
    isActive: boolean;
  }>) {
    const data: Record<string, unknown> = { ...dto };

    const asOfDateRaw = dto.balanceStartDate;
    const asOfDate =
      asOfDateRaw !== undefined && asOfDateRaw !== null && asOfDateRaw !== ''
        ? (typeof asOfDateRaw === 'string' ? new Date(asOfDateRaw) : asOfDateRaw)
        : null;
    const enteredBalance = dto.leaveBalance;

    if (enteredBalance !== undefined && asOfDate != null && !Number.isNaN(asOfDate.getTime())) {
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const periodStart = new Date(asOfDate);
      periodStart.setHours(0, 0, 0, 0);

      const lt = await this.prisma.leaveType.findFirst({
        where: { isActive: true, deductFromBalance: true },
        select: { annualAllowance: true },
      });
      const annualAllowance = lt?.annualAllowance ?? DEFAULT_ANNUAL_ALLOWANCE;
      const accrualPerDay = Number(annualAllowance) / 365;
      const daysInPeriod = daysBetween(periodStart, now);
      const accrualInPeriod = daysInPeriod * accrualPerDay;

      const deductions = await this.prisma.leaveRequest.findMany({
        where: {
          employeeId: id,
          status: 'APPROVED',
          leaveType: { deductFromBalance: true },
          startDate: { lte: now },
          endDate: { gte: periodStart },
        },
        select: { daysCount: true },
      });
      const deducted = deductions.reduce((s, r) => s + r.daysCount, 0);
      const effective = Number(enteredBalance) + accrualInPeriod - deducted;
      data.leaveBalance = Math.round(Math.max(0, effective) * 100) / 100;
      data.balanceStartDate = null;
    } else {
      if (dto.balanceStartDate !== undefined) {
        data.balanceStartDate =
          dto.balanceStartDate === null || dto.balanceStartDate === ''
            ? null
            : (typeof dto.balanceStartDate === 'string' ? new Date(dto.balanceStartDate) : dto.balanceStartDate);
      } else if (dto.leaveBalance !== undefined) {
        data.balanceStartDate = new Date();
      }
    }

    return this.prisma.employee.update({
      where: { id },
      data: data as object,
      include: { department: true, managerUser: { select: { id: true, name: true } } },
    });
  }
}
