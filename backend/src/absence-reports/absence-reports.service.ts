import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AttendanceValidationService } from '../attendance-validation/attendance-validation.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AbsenceReportsService {
  /**
   * عميل Prisma للوصول إلى النماذج المُولَّدة (absenceReport, dailyConsolidation، reportId).
   * يُصرَّح عنه any لتجنب أخطاء الـ IDE عندما لا تُحمَّل أنواع prisma generate.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return this.prismaService;
  }

  constructor(
    private readonly prismaService: PrismaService,
    private usersService: UsersService,
    private validation: AttendanceValidationService,
  ) {}

  private async ensureFingerprintOfficer(userId: string): Promise<string[]> {
    const ids = await this.usersService.getAssignedDepartmentIds(userId);
    if (ids.length === 0) {
      throw new ForbiddenException(
        'موظف البصمة يجب أن يكون مرتبطاً بأقسام. يرجى التواصل مع المدير.',
      );
    }
    return ids;
  }

  private async ensureCanAccessReport(reportId: string, userId: string, isManager: boolean) {
    const report = await this.db.absenceReport.findUnique({
      where: { id: reportId },
      include: { createdBy: { select: { id: true } } },
    });
    if (!report) throw new NotFoundException('كشف الغياب غير موجود');
    if (!isManager && report.createdByUserId !== userId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا الكشف');
    }
    return report;
  }

  /** حذف أي غياب لموظف لديه إجازة معتمدة في نفس اليوم (قاعدة رجعية + تنقية عند العرض) */
  private async removeAbsencesConflictingWithLeaves(reportDate: Date): Promise<void> {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const conflicting = await this.db.absence.findMany({
      where: {
        date: { gte: d, lte: dayEnd },
        status: 'RECORDED',
        employee: {
          leaveRequests: {
            some: {
              status: 'APPROVED',
              startDate: { lte: dayEnd },
              endDate: { gte: d },
            },
          },
        },
      },
      select: { id: true },
    });
    if (conflicting.length > 0) {
      await this.db.absence.deleteMany({
        where: { id: { in: conflicting.map((a: { id: string }) => a.id) } },
      });
    }
  }

  async getOrCreateReport(userId: string, reportDate: Date) {
    await this.ensureFingerprintOfficer(userId);
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);

    let report = await this.db.absenceReport.findUnique({
      where: {
        createdByUserId_reportDate: { createdByUserId: userId, reportDate: d },
      },
      include: {
        absences: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                jobTitle: true,
                workType: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!report) {
      const consolidation = await this.db.dailyConsolidation.findUnique({
        where: { reportDate: d },
      });
      if (consolidation) {
        throw new BadRequestException('تمت مصادقة هذا اليوم ولا يمكن إنشاء كشف جديد');
      }
      report = await this.db.absenceReport.create({
        data: {
          reportDate: d,
          createdByUserId: userId,
          status: 'DRAFT',
        },
        include: {
          absences: {
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  jobTitle: true,
                  workType: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    } else {
      await this.removeAbsencesConflictingWithLeaves(d);
      report = await this.db.absenceReport.findUnique({
        where: { id: report.id },
        include: {
          absences: {
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  jobTitle: true,
                  workType: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }) as typeof report;
    }

    return report;
  }

  async validateEmployeeForDate(employeeId: string, date: Date) {
    return this.validation.validateCanAddAbsence(employeeId, date);
  }

  async addAbsenceToReport(
    reportId: string,
    userId: string,
    body: { employeeId: string },
  ) {
    const isManager = false;
    const report = await this.ensureCanAccessReport(reportId, userId, isManager);

    const [consolidation, deptIds, employee, existing] = await Promise.all([
      this.db.dailyConsolidation.findUnique({
        where: { reportDate: report.reportDate },
      }),
      this.ensureFingerprintOfficer(userId),
      this.db.employee.findUnique({
        where: { id: body.employeeId },
        select: { departmentId: true, isActive: true },
      }),
      this.db.absence.findFirst({
        where: { reportId, employeeId: body.employeeId },
      }),
    ]);

    if (consolidation) {
      throw new BadRequestException('لا يمكن التعديل — تمت مصادقة هذا اليوم');
    }
    if (!employee || !deptIds.includes(employee.departmentId)) {
      throw new ForbiddenException('الموظف غير تابع لأقسامك');
    }
    if (!employee.isActive) {
      throw new BadRequestException('لا يمكن تسجيل غياب لموظف غير نشط (متوقف). يظهر في الأرشيف فقط.');
    }
    if (existing) {
      throw new BadRequestException('الموظف مضاف مسبقاً في هذا الكشف');
    }

    const dayStart = new Date(report.reportDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(report.reportDate);
    dayEnd.setHours(23, 59, 59, 999);
    const alreadySameDay = await this.db.absence.findFirst({
      where: {
        employeeId: body.employeeId,
        date: { gte: dayStart, lte: dayEnd },
        status: 'RECORDED',
      },
      include: {
        report: { include: { createdBy: { select: { name: true } } } },
      },
    });
    if (alreadySameDay) {
      const otherName = alreadySameDay.report?.createdBy?.name ?? 'آخر';
      throw new BadRequestException(
        `الموظف مسجل غياب له في هذا اليوم في كشف آخر (كشف ${otherName}). لا يمكن تسجيل غياب الموظف نفسه في يوم واحد مرتين.`,
      );
    }

    const validation = await this.validation.validateCanAddAbsence(
      body.employeeId,
      report.reportDate,
    );
    if (!validation.canAdd) {
      throw new BadRequestException(validation.message ?? 'لا يمكن إضافة هذا الموظف');
    }

    const absence = await this.db.absence.create({
      data: {
        employeeId: body.employeeId,
        date: report.reportDate,
        recordedBy: userId,
        reportId,
        status: 'RECORDED',
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            workType: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (report.status === 'SUBMITTED') {
      await this.db.absenceReport.update({
        where: { id: reportId },
        data: { status: 'DRAFT', submittedAt: null },
      });
    }
    return absence;
  }

  async removeAbsenceFromReport(reportId: string, absenceId: string, userId: string) {
    const report = await this.ensureCanAccessReport(reportId, userId, false);

    const consolidation = await this.db.dailyConsolidation.findUnique({
      where: { reportDate: report.reportDate },
    });
    if (consolidation) {
      throw new BadRequestException('لا يمكن الحذف — تمت مصادقة هذا اليوم');
    }

    const absence = await this.db.absence.findFirst({
      where: { id: absenceId, reportId },
    });
    if (!absence) throw new NotFoundException('السجل غير موجود في هذا الكشف');

    await this.db.absence.delete({ where: { id: absenceId } });

    if (report.status === 'SUBMITTED') {
      await this.db.absenceReport.update({
        where: { id: reportId },
        data: { status: 'DRAFT', submittedAt: null },
      });
    }
    return { ok: true };
  }

  async submitReport(reportId: string, userId: string) {
    const report = await this.ensureCanAccessReport(reportId, userId, false);
    if (report.status !== 'DRAFT') {
      throw new BadRequestException('الكشف مرسل مسبقاً');
    }

    await this.db.absenceReport.update({
      where: { id: reportId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    return { ok: true };
  }

  async listReportsForDate(
    reportDate: Date,
    userId: string,
    isManager: boolean,
  ) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);

    if (isManager) {
      const reports = await this.db.absenceReport.findMany({
        where: { reportDate: d, status: 'SUBMITTED' },
        include: {
          createdBy: { select: { id: true, name: true } },
          absences: {
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  jobTitle: true,
                  workType: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdBy: { name: 'asc' } },
      });
      return reports;
    }

    const report = await this.db.absenceReport.findUnique({
      where: {
        createdByUserId_reportDate: { createdByUserId: userId, reportDate: d },
      },
      include: {
        absences: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                jobTitle: true,
                workType: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    return report ? [report] : [];
  }

  async getConsolidatedForDate(reportDate: Date) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);

    await this.removeAbsencesConflictingWithLeaves(d);

    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const [consolidation, absences] = await Promise.all([
      this.db.dailyConsolidation.findUnique({
        where: { reportDate: d },
        include: { approvedBy: { select: { id: true, name: true } } },
      }),
      this.db.absence.findMany({
        where: {
          date: { gte: d, lte: dayEnd },
          status: 'RECORDED',
          reportId: { not: null },
        },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              jobTitle: true,
              workType: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ employee: { fullName: 'asc' } }],
      }),
    ]);

    return { consolidation, absences };
  }

  async approveConsolidation(reportDate: Date, userId: string) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);

    const existing = await this.db.dailyConsolidation.findUnique({
      where: { reportDate: d },
    });
    if (existing) {
      throw new BadRequestException('تمت مصادقة هذا اليوم مسبقاً');
    }

    const reports = await this.db.absenceReport.findMany({
      where: { reportDate: d, status: 'SUBMITTED' },
      include: { absences: { select: { employeeId: true } } },
    });

    const allEmployeeIds = reports.flatMap(
      (r: { absences: { employeeId: string }[] }) =>
        r.absences.map((a: { employeeId: string }) => a.employeeId),
    );
    const uniqueIds = new Set(allEmployeeIds);
    if (allEmployeeIds.length !== uniqueIds.size) {
      throw new BadRequestException(
        'يوجد تكرار لموظفين في الكشوف المرسلة لنفس اليوم. يرجى مراجعة الكشوف وإزالة التكرار قبل المصادقة.',
      );
    }

    await this.db.dailyConsolidation.create({
      data: {
        reportDate: d,
        approvedByUserId: userId,
      },
    });

    return { ok: true };
  }

  /** قائمة الموظفين المكررين في الكشوف المرسلة لنفس اليوم (موظف ظاهر في أكثر من كشف) */
  async getDuplicatesForDate(reportDate: Date) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const reports = await this.db.absenceReport.findMany({
      where: { reportDate: d, status: 'SUBMITTED' },
      include: {
        createdBy: { select: { id: true, name: true } },
        absences: {
          include: {
            employee: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    const byEmployee = new Map<
      string,
      { fullName: string; reports: { reportId: string; reportCreatorName: string }[] }
    >();
    for (const r of reports) {
      const creatorName = r.createdBy?.name ?? '—';
      for (const a of r.absences) {
        const empId = a.employeeId;
        const fullName = (a as { employee?: { fullName: string } }).employee?.fullName ?? '—';
        if (!byEmployee.has(empId)) {
          byEmployee.set(empId, { fullName, reports: [] });
        }
        const entry = byEmployee.get(empId)!;
        if (!entry.reports.some((x) => x.reportId === r.id)) {
          entry.reports.push({ reportId: r.id, reportCreatorName: creatorName });
        }
      }
    }

    const duplicates = Array.from(byEmployee.entries())
      .filter(([, v]) => v.reports.length > 1)
      .map(([employeeId, v]) => ({ employeeId, fullName: v.fullName, reports: v.reports }));

    return { duplicates };
  }

  /** إزالة التكرار: الإبقاء على سجل غياب واحد للموظف في ذلك اليوم وحذف الباقي */
  async resolveDuplicate(reportDate: Date, employeeId: string, userId: string) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const absences = await this.db.absence.findMany({
      where: {
        employeeId,
        date: { gte: d, lte: dayEnd },
        status: 'RECORDED',
        reportId: { not: null },
      },
      include: { report: true },
      orderBy: { createdAt: 'asc' },
    });

    if (absences.length <= 1) {
      return { removed: 0, message: 'لا يوجد تكرار لهذا الموظف في هذا اليوم' };
    }

    const [keep, ...toRemove] = absences;
    for (const a of toRemove) {
      await this.db.absence.delete({ where: { id: a.id } });
      await this.db.absenceReport.update({
        where: { id: a.reportId },
        data: { status: 'DRAFT', submittedAt: null },
      });
    }

    return { removed: toRemove.length };
  }

  async unapproveConsolidation(reportDate: Date) {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);

    const existing = await this.db.dailyConsolidation.findUnique({
      where: { reportDate: d },
    });
    if (!existing) {
      throw new BadRequestException('لا توجد مصادقة لهذا اليوم');
    }

    await this.db.dailyConsolidation.delete({
      where: { reportDate: d },
    });

    await this.db.absenceReport.updateMany({
      where: { reportDate: d, status: 'SUBMITTED' },
      data: { status: 'DRAFT', submittedAt: null },
    });

    return { ok: true };
  }

  async isDateLocked(reportDate: Date): Promise<boolean> {
    const d = new Date(reportDate);
    d.setHours(0, 0, 0, 0);
    const c = await this.db.dailyConsolidation.findUnique({
      where: { reportDate: d },
    });
    return !!c;
  }

  async getEmployeesForOfficer(
    userId: string,
    search?: string,
    limit = 50,
  ) {
    const departmentIds = await this.ensureFingerprintOfficer(userId);

    const where: Prisma.EmployeeWhereInput = {
      isActive: true,
      departmentId: { in: departmentIds },
    };
    if (search?.trim()) {
      where.OR = [
        { fullName: { contains: search.trim(), mode: 'insensitive' } },
        { jobTitle: { contains: search.trim(), mode: 'insensitive' } },
        { department: { name: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const employees = await this.db.employee.findMany({
      where,
      take: limit,
      select: {
        id: true,
        fullName: true,
        jobTitle: true,
        workType: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return { data: employees };
  }

  async getArchiveDates(fromDate?: Date, toDate?: Date) {
    const where: { reportDate?: { gte?: Date; lte?: Date } } = {};
    if (fromDate || toDate) {
      where.reportDate = {};
      if (fromDate) where.reportDate.gte = new Date(fromDate);
      if (toDate) where.reportDate.lte = new Date(toDate);
    }
    const list = await this.db.dailyConsolidation.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      include: { approvedBy: { select: { name: true } } },
    });
    return list;
  }

  /**
   * كشف الغيابات الرسمي للفترة: قائمة الغيابات + إحصائيات للعرض والطباعة.
   */
  async getOfficialReport(fromDate: Date, toDate: Date) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const absences = await this.db.absence.findMany({
      where: {
        date: { gte: from, lte: to },
        status: 'RECORDED',
        reportId: { not: null },
      },
      include: {
        employee: {
          select: {
            fullName: true,
            jobTitle: true,
            workType: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { employee: { fullName: 'asc' } }],
    });

    type AbsenceWithEmp = (typeof absences)[number];
    const total = absences.length;
    const morning = absences.filter((a: AbsenceWithEmp) => a.employee?.workType === 'MORNING').length;
    const shifts = absences.filter((a: AbsenceWithEmp) => a.employee?.workType === 'SHIFTS').length;
    const departmentIds = new Set(
      absences.map((a: AbsenceWithEmp) => a.employee?.department?.id).filter(Boolean),
    );
    const departmentsCount = departmentIds.size;

    const byDeptName = new Map<string, number>();
    absences.forEach((a: AbsenceWithEmp) => {
      const name = a.employee?.department?.name ?? '—';
      byDeptName.set(name, (byDeptName.get(name) ?? 0) + 1);
    });
    let topDepartment = '—';
    let topCount = 0;
    byDeptName.forEach((count, name) => {
      if (count > topCount) {
        topCount = count;
        topDepartment = name;
      }
    });

    const rows = absences.map((a: AbsenceWithEmp) => ({
      id: a.id,
      fullName: a.employee?.fullName ?? '—',
      jobTitle: a.employee?.jobTitle ?? '—',
      departmentName: a.employee?.department?.name ?? '—',
      workType: a.employee?.workType ?? 'MORNING',
      date: a.date,
      reason: a.reason ?? null,
    }));

    return {
      fromDate: from,
      toDate: to,
      absences: rows,
      kpis: {
        total,
        morning,
        shifts,
        departmentsCount,
        topDepartment: topDepartment || '—',
        topDepartmentCount: topCount,
      },
    };
  }
}
