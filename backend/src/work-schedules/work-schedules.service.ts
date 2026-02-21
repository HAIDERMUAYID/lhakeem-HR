import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkType } from '@prisma/client';

const SCHEDULES_APPROVE = 'SCHEDULES_APPROVE';
const ADMIN = 'ADMIN';

function canApprove(permissions?: string[]) {
  return permissions?.includes(ADMIN) || permissions?.includes(SCHEDULES_APPROVE);
}

const AR_WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** تحويل وقت "HH:mm" إلى دقائق من منتصف الليل */
function timeToMinutes(t: string): number {
  const [h = 0, m = 0] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** ساعات العمل اليومية (مراعاة عبور منتصف الليل) */
function hoursBetween(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

/** تنسيق الوقت بصيغة 12 ساعة مع صباحاً/مساءً (أرقام إنجليزي) */
function formatTime12h(t: string): string {
  const [h = 0, m = 0] = (t || '0:0').split(':').map(Number);
  const hour = h || 0;
  const min = m || 0;
  const mm = String(min).padStart(2, '0');
  const suffix = hour < 12 ? 'صباحاً' : 'مساءً';
  if (hour === 0 && min === 0) return `12:${mm} ${suffix}`;
  if (hour < 12) return `${String(hour).padStart(2, '0')}:${mm} ${suffix}`;
  if (hour === 12) return `12:${mm} مساءً`;
  return `${String(hour - 12).padStart(2, '0')}:${mm} مساءً`;
}

@Injectable()
export class WorkSchedulesService {
  constructor(private prisma: PrismaService) {}

  /**
   * حساب أيام الدوام الفعلية داخل الشهر:
   * - دوام ثابت: أيام أسبوعية (0=السبت..6=الجمعة) عدد مراتها في الشهر
   * - تناوبي 1x1/1x2/1x3: من تاريخ بداية الدورة، النمط يعطي تواريخ العمل
   */
  private getWorkDaysInMonth(
    year: number,
    month: number,
    workType: string,
    shiftPattern: string | null,
    daysOfWeek: string,
    cycleStartDate: Date | null,
  ): { dates: Date[]; display: string; count: number } {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month - 1 + 1, 0);

    const inMonth = (d: Date) => d >= firstDay && d <= lastDay;

    if (workType === 'MORNING' || (workType === 'SHIFTS' && shiftPattern === 'FIXED')) {
      const weekdays = daysOfWeek.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
      const dates: Date[] = [];
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = (d.getDay() + 1) % 7;
        if (weekdays.includes(dayOfWeek)) dates.push(new Date(d));
      }
      const display = weekdays.length ? weekdays.map((w) => AR_WEEKDAYS[w]).join('، ') : '—';
      return { dates, display, count: dates.length };
    }

    if (workType === 'SHIFTS' && shiftPattern && shiftPattern !== 'FIXED' && cycleStartDate) {
      const step = shiftPattern === '1x1' ? 2 : shiftPattern === '1x2' ? 3 : shiftPattern === '1x3' ? 4 : 2;
      const dates: Date[] = [];
      let cur = new Date(cycleStartDate);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(lastDay);
      end.setDate(end.getDate() + 1);
      while (cur < end) {
        if (inMonth(cur)) dates.push(new Date(cur));
        cur.setDate(cur.getDate() + step);
      }
      const display = dates.length
        ? dates.map((d) => String(d.getDate())).join('، ')
        : '—';
      const daysInMonth = lastDay.getDate();
      const divisor = shiftPattern === '1x1' ? 2 : shiftPattern === '1x2' ? 3 : shiftPattern === '1x3' ? 4 : 2;
      const count = Math.floor(daysInMonth / divisor);
      return { dates, display, count };
    }

    return { dates: [], display: '—', count: 0 };
  }

  async findAll(
    year?: number,
    month?: number,
    employeeId?: string,
    departmentFilter?: string | string[] | null,
  ) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    const where: {
      year: number;
      month: number;
      employeeId?: string;
      employee?: { departmentId?: string | { in: string[] } };
    } = { year: y, month: m };
    if (employeeId) where.employeeId = employeeId;
    if (departmentFilter != null) {
      if (Array.isArray(departmentFilter)) {
        if (departmentFilter.length) where.employee = { departmentId: { in: departmentFilter } };
      } else {
        where.employee = { departmentId: departmentFilter };
      }
    }

    return this.prisma.workSchedule.findMany({
      where,
      include: {
        employee: { select: { id: true, fullName: true, department: true, workType: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ employee: { fullName: 'asc' } }],
    });
  }

  async getAvailableMonths(departmentFilter?: string | string[] | null) {
    const where: { employee?: { departmentId?: string | { in: string[] } } } = {};
    if (departmentFilter != null) {
      if (Array.isArray(departmentFilter)) {
        if (departmentFilter.length) where.employee = { departmentId: { in: departmentFilter } };
      } else {
        where.employee = { departmentId: departmentFilter };
      }
    }

    const rows = await this.prisma.workSchedule.findMany({
      where,
      select: { year: true, month: true },
      distinct: ['year', 'month'],
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return rows;
  }

  async getScheduleForEmployeeMonth(
    employeeId: string,
    year: number,
    month: number,
  ) {
    return this.prisma.workSchedule.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
    });
  }

  async ensureEmployeeInDepartment(employeeId: string, departmentFilter: string | string[] | null) {
    if (departmentFilter == null) return;
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });
    if (!emp) throw new ForbiddenException('الموظف غير موجود');
    const allowed = Array.isArray(departmentFilter) ? departmentFilter : [departmentFilter];
    if (allowed.length && !allowed.includes(emp.departmentId)) {
      throw new ForbiddenException('الموظف غير تابع لأقسامك');
    }
  }

  async upsert(
    employeeId: string,
    year: number,
    month: number,
    dto: {
      workType: WorkType;
      shiftPattern?: string | null;
      daysOfWeek: string;
      cycleStartDate?: Date;
      startTime: string;
      endTime: string;
      breakStart?: string;
      breakEnd?: string;
    },
    departmentFilter?: string | string[] | null,
    userPermissions?: string[],
  ) {
    await this.ensureEmployeeInDepartment(employeeId, departmentFilter ?? null);
    const existing = await this.prisma.workSchedule.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'APPROVED' && !canApprove(userPermissions)) {
      throw new ForbiddenException('لا يمكن تعديل جدول معتمد إلا من قبل المسؤول عن المصادقة');
    }
    const data = {
      year,
      month,
      workType: dto.workType,
      shiftPattern: dto.shiftPattern ?? null,
      daysOfWeek: dto.daysOfWeek,
      cycleStartDate: dto.cycleStartDate ?? null,
      startTime: dto.startTime,
      endTime: dto.endTime,
      breakStart: dto.breakStart ?? null,
      breakEnd: dto.breakEnd ?? null,
    };
    const schedule = await this.prisma.workSchedule.upsert({
      where: { employeeId_year_month: { employeeId, year, month } },
      create: { employeeId, ...data, status: 'PENDING' },
      update: data,
      include: { employee: true, approvedBy: { select: { id: true, name: true } } },
    });
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { workType: dto.workType },
    });
    return schedule;
  }

  async bulkApply(
    year: number,
    month: number,
    body: {
      employeeIds: string[];
      workType: string;
      shiftPattern?: string;
      daysOfWeek: string;
      cycleStartDate?: string;
      startTime: string;
      endTime: string;
      breakStart?: string;
      breakEnd?: string;
    },
    departmentFilter?: string | string[] | null,
    userPermissions?: string[],
  ) {
    const results: { employeeId: string; ok: boolean; error?: string }[] = [];
    for (const employeeId of body.employeeIds) {
      try {
        await this.upsert(employeeId, year, month, {
          workType: body.workType as WorkType,
          shiftPattern: body.shiftPattern ?? null,
          daysOfWeek: body.daysOfWeek,
          cycleStartDate: body.cycleStartDate ? new Date(body.cycleStartDate) : undefined,
          startTime: body.startTime,
          endTime: body.endTime,
          breakStart: body.breakStart,
          breakEnd: body.breakEnd,
        }, departmentFilter, userPermissions);
        results.push({ employeeId, ok: true });
      } catch (e) {
        results.push({
          employeeId,
          ok: false,
          error: e instanceof Error ? e.message : 'خطأ',
        });
      }
    }
    return { applied: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, details: results };
  }

  /** مصادقة جدول القسم بالكامل (سنة + شهر + قسم) — يعتمد كل الجداول المعلقة للقسم */
  async approveDepartmentMonth(
    year: number,
    month: number,
    departmentId: string,
    userId: string,
    departmentFilter?: string | string[] | null,
    userPermissions?: string[],
  ) {
    if (!canApprove(userPermissions)) {
      throw new ForbiddenException('غير مصرح لك بمصادقة جداول الدوام');
    }
    if (departmentFilter != null) {
      const allowed = Array.isArray(departmentFilter) ? departmentFilter : [departmentFilter];
      if (allowed.length && !allowed.includes(departmentId)) {
        throw new ForbiddenException('غير مصرح بمصادقة جداول هذا القسم');
      }
    }
    const pending = await this.prisma.workSchedule.findMany({
      where: {
        year,
        month,
        status: 'PENDING',
        employee: { departmentId },
      },
      select: { id: true },
    });
    if (pending.length === 0) {
      throw new ForbiddenException('لا توجد جداول معلقة لهذا القسم في الشهر المحدد');
    }
    const at = new Date();
    await this.prisma.workSchedule.updateMany({
      where: {
        year,
        month,
        status: 'PENDING',
        employee: { departmentId },
      },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: at },
    });
    return this.prisma.workSchedule.findMany({
      where: { year, month, employee: { departmentId } },
      include: {
        employee: { select: { id: true, fullName: true, department: true, workType: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ employee: { fullName: 'asc' } }],
    });
  }

  async delete(
    scheduleId: string,
    departmentFilter?: string | string[] | null,
    userPermissions?: string[],
  ) {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: scheduleId },
      include: { employee: { select: { departmentId: true } } },
    });
    if (!schedule) throw new NotFoundException('الجدول غير موجود');
    if (schedule.status === 'APPROVED' && !canApprove(userPermissions)) {
      throw new ForbiddenException('لا يمكن حذف جدول معتمد إلا من قبل المسؤول عن المصادقة');
    }
    if (departmentFilter != null) {
      const allowed = Array.isArray(departmentFilter) ? departmentFilter : [departmentFilter];
      if (allowed.length && !allowed.includes(schedule.employee.departmentId)) {
        throw new ForbiddenException('غير مصرح بحذف جداول هذا القسم');
      }
    }
    await this.prisma.workSchedule.delete({ where: { id: scheduleId } });
    return { deleted: true };
  }

  async copyFromMonth(
    sourceYear: number,
    sourceMonth: number,
    targetYear: number,
    targetMonth: number,
    departmentFilter?: string | string[] | null,
  ) {
    const where: {
      year: number;
      month: number;
      employee?: { departmentId?: string | { in: string[] } };
    } = { year: sourceYear, month: sourceMonth };
    if (departmentFilter != null) {
      if (Array.isArray(departmentFilter)) {
        if (departmentFilter.length) where.employee = { departmentId: { in: departmentFilter } };
      } else {
        where.employee = { departmentId: departmentFilter };
      }
    }

    const sourceSchedules = await this.prisma.workSchedule.findMany({
      where,
      include: { employee: { select: { departmentId: true } } },
    });

    const allowedSet = departmentFilter == null ? null : new Set(Array.isArray(departmentFilter) ? departmentFilter : [departmentFilter]);
    let created = 0;
    for (const s of sourceSchedules) {
      if (allowedSet && !allowedSet.has(s.employee.departmentId)) continue;
      try {
        await this.prisma.workSchedule.upsert({
          where: { employeeId_year_month: { employeeId: s.employeeId, year: targetYear, month: targetMonth } },
          create: {
            employeeId: s.employeeId,
            year: targetYear,
            month: targetMonth,
            workType: s.workType,
            shiftPattern: s.shiftPattern,
            daysOfWeek: s.daysOfWeek,
            cycleStartDate: s.cycleStartDate,
            startTime: s.startTime,
            endTime: s.endTime,
            breakStart: s.breakStart,
            breakEnd: s.breakEnd,
            status: 'PENDING',
          },
          update: {},
        });
        created++;
      } catch {
        // skip on conflict
      }
    }
    return { copied: created };
  }

  /**
   * تقرير جدول الدوام الرسمي للطباعة:
   * - مجمع حسب الأقسام (صفحة لكل قسم)
   * - كل صف: إجمالي ساعات الدوام للشهر، أيام العمل المحسوبة، وقت بصيغة 12 ساعة
   */
  async getOfficialReport(
    year: number,
    month: number,
    departmentFilter?: string | string[] | null,
    departmentIdOverride?: string,
  ) {
    const filter = departmentIdOverride ?? departmentFilter;
    const where: {
      year: number;
      month: number;
      employee?: { departmentId?: string | { in: string[] } };
    } = { year, month };
    if (filter != null) {
      if (Array.isArray(filter)) {
        if (filter.length) where.employee = { departmentId: { in: filter } };
      } else {
        where.employee = { departmentId: filter };
      }
    }

    const rows = await this.prisma.workSchedule.findMany({
      where,
      include: {
        employee: {
          select: {
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
            workType: true,
          },
        },
      },
      orderBy: [
        { employee: { department: { name: 'asc' } } },
        { employee: { fullName: 'asc' } },
      ],
    });

    const scheduleRows = rows.map((s) => {
      const workDays = this.getWorkDaysInMonth(
        year,
        month,
        s.workType,
        s.shiftPattern,
        s.daysOfWeek,
        s.cycleStartDate,
      );
      const hoursPerDay = hoursBetween(s.startTime, s.endTime);
      const totalHoursInMonth = Math.round(workDays.count * hoursPerDay * 10) / 10;

      return {
        id: s.id,
        fullName: s.employee.fullName,
        jobTitle: s.employee.jobTitle,
        workType: s.workType,
        shiftPattern: s.shiftPattern,
        cycleStartDate: s.cycleStartDate,
        startTime: s.startTime,
        endTime: s.endTime,
        startTime12h: formatTime12h(s.startTime),
        endTime12h: formatTime12h(s.endTime),
        workDaysDisplay: workDays.display,
        workDaysCount: workDays.count,
        totalHoursInMonth,
        status: s.status ?? 'PENDING',
      };
    });

    const byDept = new Map<string, { departmentId: string; departmentName: string; schedules: typeof scheduleRows; status: 'APPROVED' | 'PENDING' }>();
    for (const row of rows) {
      const deptId = row.employee.department.id;
      const deptName = row.employee.department.name;
      if (!byDept.has(deptId)) {
        byDept.set(deptId, {
          departmentId: deptId,
          departmentName: deptName,
          schedules: [],
          status: 'PENDING',
        });
      }
      const scheduleRow = scheduleRows.find((r) => r.id === row.id);
      if (scheduleRow) byDept.get(deptId)!.schedules.push(scheduleRow);
    }
    for (const block of byDept.values()) {
      const allApproved = block.schedules.length > 0 && block.schedules.every((s) => (s as { status?: string }).status === 'APPROVED');
      block.status = allApproved ? 'APPROVED' : 'PENDING';
    }

    const departments = Array.from(byDept.values());

    return {
      year,
      month,
      departmentId: departmentIdOverride ?? null,
      departmentName: departmentIdOverride && departments.length === 1 ? departments[0].departmentName : null,
      departments,
      schedules: scheduleRows,
    };
  }
}
