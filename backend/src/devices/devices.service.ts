import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import type { Holiday, WorkSchedule, WorkType } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  eachLocalDay,
  endOfLocalDay,
  isRestDayFromSchedule,
  localDateKey,
  localDateKeyFromDb,
  startOfLocalDay,
} from '../common/schedule-day.util';

export type AttendanceSheetDayKind = 'LEAVE' | 'OFFICIAL_HOLIDAY' | 'REST_DAY' | 'WORK_EXPECTED';

export type AttendanceSheetRow = {
  employeeId: string;
  fullName: string;
  jobTitle: string;
  departmentName: string | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  punchIsValid: boolean | null;
  punchNote: string | null;
  dayKind: AttendanceSheetDayKind;
  dayKindLabel: string;
  leaveTypeName: string | null;
  officialHolidayName: string | null;
  breakTimeLabel: string | null;
};

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}
  private static readonly MIN_WORK_MINUTES = 180; // 3 hours

  async getStats() {
    const [total, active, withFingerprints] = await Promise.all([
      this.prisma.device.count(),
      this.prisma.device.count({ where: { isActive: true } }),
      this.prisma.employeeFingerprint.groupBy({ by: ['deviceId'], _count: true }),
    ]);
    const uniqueDevicesWithFingerprints = withFingerprints.length;
    return { total, active, inactive: total - active, withFingerprints: uniqueDevicesWithFingerprints };
  }

  async findAll(params?: { search?: string; activeOnly?: boolean }) {
    const where: Record<string, unknown> = {};
    if (params?.activeOnly !== false) (where as { isActive: boolean }).isActive = true;
    if (params?.search) {
      (where as { OR: unknown[] }).OR = [
        { name: { contains: params.search, mode: 'insensitive' as const } },
        { code: { contains: params.search, mode: 'insensitive' as const } },
        { location: { contains: params.search, mode: 'insensitive' as const } },
      ];
    }
    return this.prisma.device.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { fingerprints: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.device.findUnique({
      where: { id },
      include: {
        fingerprints: {
          include: { employee: { select: { id: true, fullName: true, jobTitle: true } } },
        },
      },
    });
  }

  async create(dto: { name: string; code?: string; location?: string; isActive?: boolean }) {
    return this.prisma.device.create({
      data: {
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        location: dto.location?.trim() || null,
        isActive: dto.isActive !== false,
      },
      include: { _count: { select: { fingerprints: true } } },
    });
  }

  async update(
    id: string,
    dto: Partial<{ name: string; code: string; location: string; isActive: boolean }>,
  ) {
    if (dto.name !== undefined && !dto.name?.trim()) {
      throw new BadRequestException('اسم الجهاز مطلوب');
    }
    return this.prisma.device.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code?.trim() || null }),
        ...(dto.location !== undefined && { location: dto.location?.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { _count: { select: { fingerprints: true } } },
    });
  }

  async delete(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: { _count: { select: { fingerprints: true } } },
    });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    if (device._count.fingerprints > 0) {
      throw new ConflictException(
        'لا يمكن حذف الجهاز لأنه مرتبط ببصمات موظفين. أزل البصمات أولاً.',
      );
    }
    await this.prisma.device.delete({ where: { id } });
    return { ok: true };
  }

  async getFingerprintsByEmployee(employeeId: string) {
    return this.prisma.employeeFingerprint.findMany({
      where: { employeeId },
      include: { device: { select: { id: true, name: true, code: true } } },
      orderBy: { device: { name: 'asc' } },
    });
  }

  async addFingerprint(employeeId: string, deviceId: string, fingerprintId: string) {
    const fid = String(fingerprintId).trim();
    if (!fid) throw new BadRequestException('معرف البصمة مطلوب');

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || !device.isActive) throw new BadRequestException('الجهاز غير موجود أو غير مفعّل');

    const existing = await this.prisma.employeeFingerprint.findUnique({
      where: { deviceId_fingerprintId: { deviceId, fingerprintId: fid } },
      include: { employee: { select: { fullName: true } } },
    });
    if (existing) {
      if (existing.employeeId === employeeId) {
        throw new BadRequestException('هذا الموظف مسجّل بالفعل بهذا المعرف على هذا الجهاز');
      }
      throw new ConflictException(
        `معرف البصمة "${fid}" مستخدم على هذا الجهاز للموظف: ${existing.employee.fullName}`,
      );
    }

    return this.prisma.employeeFingerprint.create({
      data: { employeeId, deviceId, fingerprintId: fid },
      include: { device: { select: { id: true, name: true, code: true } } },
    });
  }

  async removeFingerprint(employeeId: string, recordId: string) {
    const record = await this.prisma.employeeFingerprint.findFirst({
      where: { id: recordId, employeeId },
    });
    if (!record) throw new BadRequestException('السجل غير موجود');
    await this.prisma.employeeFingerprint.delete({ where: { id: recordId } });
    return { ok: true };
  }

  async updateFingerprintId(employeeId: string, recordId: string, fingerprintId: string) {
    const fid = String(fingerprintId).trim();
    if (!fid) throw new BadRequestException('معرف البصمة مطلوب');

    const record = await this.prisma.employeeFingerprint.findFirst({
      where: { id: recordId, employeeId },
      include: { device: { select: { id: true, name: true } } },
    });
    if (!record) throw new BadRequestException('السجل غير موجود');

    const existing = await this.prisma.employeeFingerprint.findUnique({
      where: {
        deviceId_fingerprintId: { deviceId: record.deviceId, fingerprintId: fid },
      },
      include: { employee: { select: { fullName: true } } },
    });
    if (existing && existing.id !== recordId) {
      throw new ConflictException(
        `معرف البصمة "${fid}" مستخدم على هذا الجهاز للموظف: ${existing.employee.fullName}`,
      );
    }

    return this.prisma.employeeFingerprint.update({
      where: { id: recordId },
      data: { fingerprintId: fid },
      include: { device: { select: { id: true, name: true, code: true } } },
    });
  }

  private parseFlexibleDateTime(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number') {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(value);
      if (!d) return null;
      const parsed = new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    // Example: 04/03/2026 08:42 A3P3 -> keep first date+time only
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = Number(m[3]);
      const hh = Number(m[4]);
      const mi = Number(m[5]);
      const ss = Number(m[6] || 0);
      const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  private normalizeFingerprintCode(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  async importAttendanceFile(params: {
    deviceId: string;
    fileName: string;
    fileBuffer: Buffer;
    uploadedById?: string;
  }) {
    const device = await this.prisma.device.findUnique({ where: { id: params.deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');

    const workbook = XLSX.read(params.fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('الملف لا يحتوي على أي Sheet');
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    if (!rows.length) throw new BadRequestException('الملف فارغ');

    const fingerprints = await this.prisma.employeeFingerprint.findMany({
      where: { deviceId: params.deviceId },
      select: { fingerprintId: true, employeeId: true },
    });
    const employeeByCode = new Map(fingerprints.map((f) => [f.fingerprintId, f.employeeId]));

    const parsedLogs: {
      deviceEmployeeCode: string;
      employeeId: string;
      scannedAt: Date;
      rowNumber: number;
    }[] = [];
    /** أخطاء صفوف Excel (رقم الصف ≥ 2) */
    const excelRejected: { rowNumber: number; reason: string }[] = [];
    /** تحذيرات معالجة (صف 0) — مثلاً فرق أقل من 3 ساعات */
    const processingWarnings: { rowNumber: number; reason: string }[] = [];

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2; // after header
      const keys = Object.keys(row);
      const idVal =
        row['رقم البصمه'] ??
        row['رقم البصمة'] ??
        row['fingerprint_id'] ??
        row['fingerprintId'] ??
        row[keys[0] || ''];
      const dtVal =
        row['التاريخ والوقت'] ??
        row['date_time'] ??
        row['datetime'] ??
        row['timestamp'] ??
        row[keys[1] || ''];

      const code = this.normalizeFingerprintCode(idVal);
      if (!code) {
        excelRejected.push({ rowNumber, reason: 'رقم البصمة فارغ' });
        return;
      }
      const employeeId = employeeByCode.get(code);
      if (!employeeId) {
        excelRejected.push({
          rowNumber,
          reason: `رقم البصمة ${code} غير مربوط بأي موظف على هذا الجهاز`,
        });
        return;
      }
      const scannedAt = this.parseFlexibleDateTime(dtVal);
      if (!scannedAt) {
        excelRejected.push({ rowNumber, reason: 'صيغة التاريخ/الوقت غير صحيحة' });
        return;
      }
      parsedLogs.push({ deviceEmployeeCode: code, employeeId, scannedAt, rowNumber });
    });

    type Group = { employeeId: string; logs: Date[] };
    const grouped = new Map<string, Group>();
    for (const log of parsedLogs) {
      const d = new Date(log.scannedAt);
      d.setHours(0, 0, 0, 0);
      const key = `${log.employeeId}|${d.toISOString()}`;
      const ex = grouped.get(key);
      if (!ex) grouped.set(key, { employeeId: log.employeeId, logs: [log.scannedAt] });
      else ex.logs.push(log.scannedAt);
    }

    const dailyRows: {
      employeeId: string;
      workDate: Date;
      checkInAt: Date | null;
      checkOutAt: Date | null;
      workedMinutes: number | null;
      isValid: boolean;
      validationReason: string | null;
    }[] = [];

    for (const [, group] of grouped.entries()) {
      const sorted = [...group.logs].sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length === 1) {
        const t = sorted[0];
        const workDate = new Date(t);
        workDate.setHours(0, 0, 0, 0);
        const hour = t.getHours();
        // قبل الساعة 12: حضور فقط؛ من 12 فما فوق: انصراف فقط (العمود الآخر يبقى فارغاً)
        if (hour < 12) {
          dailyRows.push({
            employeeId: group.employeeId,
            workDate,
            checkInAt: t,
            checkOutAt: null,
            workedMinutes: null,
            isValid: true,
            validationReason: 'بصمة واحدة — حضور فقط',
          });
        } else {
          dailyRows.push({
            employeeId: group.employeeId,
            workDate,
            checkInAt: null,
            checkOutAt: t,
            workedMinutes: null,
            isValid: true,
            validationReason: 'بصمة واحدة — انصراف فقط',
          });
        }
        continue;
      }

      const checkInAt = sorted[0];
      const checkOutAt = sorted[sorted.length - 1];
      const workedMinutes = Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
      const workDate = new Date(checkInAt);
      workDate.setHours(0, 0, 0, 0);
      if (workedMinutes < DevicesService.MIN_WORK_MINUTES) {
        processingWarnings.push({
          rowNumber: 0,
          reason: `تنبيه: الفرق بين أول وآخر بصمة أقل من 3 ساعات — موظف ${group.employeeId} — ${workDate.toISOString().slice(0, 10)}`,
        });
        dailyRows.push({
          employeeId: group.employeeId,
          workDate,
          checkInAt,
          checkOutAt,
          workedMinutes,
          isValid: false,
          validationReason: 'الفرق بين أول وآخر بصمة أقل من 3 ساعات',
        });
        continue;
      }
      dailyRows.push({
        employeeId: group.employeeId,
        workDate,
        checkInAt,
        checkOutAt,
        workedMinutes,
        isValid: true,
        validationReason: null,
      });
    }

    const allIssues = [...excelRejected, ...processingWarnings];
    const status =
      excelRejected.length === 0 && processingWarnings.length === 0
        ? 'SUCCESS'
        : dailyRows.length > 0
          ? 'PARTIAL'
          : 'FAILED';
    const batch = await this.prisma.attendanceImportBatch.create({
      data: {
        deviceId: params.deviceId,
        uploadedById: params.uploadedById || null,
        fileName: params.fileName,
        rowsTotal: rows.length,
        rowsParsed: parsedLogs.length,
        rowsAccepted: dailyRows.length,
        rowsRejected: excelRejected.length,
        status,
        notes:
          allIssues.length > 0
            ? allIssues
                .slice(0, 15)
                .map((r) => r.reason)
                .join(' | ')
            : null,
        ...(allIssues.length > 0 && { rejections: allIssues }),
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (parsedLogs.length) {
        await tx.attendanceImportRawLog.createMany({
          data: parsedLogs.map((r) => ({
            batchId: batch.id,
            deviceId: params.deviceId,
            deviceEmployeeCode: r.deviceEmployeeCode,
            scannedAt: r.scannedAt,
            rowNumber: r.rowNumber,
          })),
        });
      }
      if (dailyRows.length) {
        await tx.attendanceDailyRecord.createMany({
          data: dailyRows.map((r) => ({
            batchId: batch.id,
            deviceId: params.deviceId,
            employeeId: r.employeeId,
            workDate: r.workDate,
            checkInAt: r.checkInAt,
            checkOutAt: r.checkOutAt,
            workedMinutes: r.workedMinutes,
            isValid: r.isValid,
            validationReason: r.validationReason,
          })),
        });
      }
    });

    return {
      ok: true,
      batchId: batch.id,
      status,
      rowsTotal: rows.length,
      rowsParsed: parsedLogs.length,
      rowsAccepted: dailyRows.length,
      rowsRejected: excelRejected.length,
      warningsCount: processingWarnings.length,
      rejections: allIssues,
    };
  }

  async listAttendanceImports(deviceId: string) {
    return this.prisma.attendanceImportBatch.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true, username: true } },
        _count: { select: { rawLogs: true, dailyRecords: true } },
      },
    });
  }

  async getAttendanceImportBatch(deviceId: string, batchId: string) {
    const batch = await this.prisma.attendanceImportBatch.findFirst({
      where: { id: batchId, deviceId },
      include: {
        uploadedBy: { select: { id: true, name: true, username: true } },
        _count: { select: { rawLogs: true, dailyRecords: true } },
      },
    });
    if (!batch) throw new BadRequestException('عملية الرفع غير موجودة على هذا الجهاز');
    return batch;
  }

  /**
   * كشف: كل موظفي الجهاز × كل يوم في النطاق، مع إجازة / استراحة / عطلة / بصمة.
   * إما batchId (نطاق من الدفعة) أو fromDate + toDate (بصمات من أي دفعة، الأحدث لكل يوم).
   */
  async getAttendanceSheet(
    deviceId: string,
    query: { batchId?: string; fromDate?: string; toDate?: string },
  ) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');

    const batchIdTrim = query.batchId?.trim();
    const fromTrim = query.fromDate?.trim();
    const toTrim = query.toDate?.trim();
    const hasBatch = !!batchIdTrim;
    const hasRange = !!fromTrim && !!toTrim;
    if (!hasBatch && !hasRange) {
      throw new BadRequestException('حدد batchId أو fromDate و toDate لعرض الكشف');
    }

    let rangeFrom: Date;
    let rangeTo: Date;

    if (hasBatch) {
      const batch = await this.prisma.attendanceImportBatch.findFirst({
        where: { id: batchIdTrim, deviceId },
      });
      if (!batch) throw new BadRequestException('الدفعة غير موجودة لهذا الجهاز');

      const agg = await this.prisma.attendanceDailyRecord.aggregate({
        where: { batchId: batchIdTrim, deviceId },
        _min: { workDate: true },
        _max: { workDate: true },
      });

      if (agg._min.workDate && agg._max.workDate) {
        rangeFrom = startOfLocalDay(new Date(agg._min.workDate));
        rangeTo = startOfLocalDay(new Date(agg._max.workDate));
      } else {
        const logAgg = await this.prisma.attendanceImportRawLog.aggregate({
          where: { batchId: batchIdTrim },
          _min: { scannedAt: true },
          _max: { scannedAt: true },
        });
        if (!logAgg._min.scannedAt || !logAgg._max.scannedAt) {
          throw new BadRequestException('لا توجد تواريخ في هذه الدفعة لعرض الكشف');
        }
        rangeFrom = startOfLocalDay(new Date(logAgg._min.scannedAt));
        rangeTo = startOfLocalDay(new Date(logAgg._max.scannedAt));
      }
    } else {
      rangeFrom = startOfLocalDay(new Date(fromTrim!));
      rangeTo = startOfLocalDay(new Date(toTrim!));
      if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
        throw new BadRequestException('صيغة التاريخ غير صحيحة');
      }
      if (rangeFrom.getTime() > rangeTo.getTime()) {
        throw new BadRequestException('من تاريخ يجب أن يكون قبل أو يساوي إلى تاريخ');
      }
    }

    const maxDays = 120;
    const spanDays =
      Math.floor((startOfLocalDay(rangeTo).getTime() - startOfLocalDay(rangeFrom).getTime()) / 86400000) + 1;
    if (spanDays > maxDays) {
      throw new BadRequestException(`نطاق الكشف يقتصر على ${maxDays} يوماً`);
    }

    const fingerprints = await this.prisma.employeeFingerprint.findMany({
      where: { deviceId },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            workType: true,
            isActive: true,
            departmentId: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const employees = fingerprints
      .filter((f) => f.employee.isActive)
      .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, 'ar'));

    type PunchSel = {
      employeeId: string;
      workDate: Date;
      checkInAt: Date | null;
      checkOutAt: Date | null;
      workedMinutes: number | null;
      isValid: boolean;
      validationReason: string | null;
    };

    let punchRows: PunchSel[];
    if (hasBatch) {
      punchRows = await this.prisma.attendanceDailyRecord.findMany({
        where: { deviceId, batchId: batchIdTrim },
        select: {
          employeeId: true,
          workDate: true,
          checkInAt: true,
          checkOutAt: true,
          workedMinutes: true,
          isValid: true,
          validationReason: true,
        },
      });
    } else {
      punchRows = await this.prisma.attendanceDailyRecord.findMany({
        where: {
          deviceId,
          workDate: { gte: rangeFrom, lte: endOfLocalDay(rangeTo) },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          employeeId: true,
          workDate: true,
          checkInAt: true,
          checkOutAt: true,
          workedMinutes: true,
          isValid: true,
          validationReason: true,
        },
      });
    }

    const punchMap = new Map<string, PunchSel>();
    for (const r of punchRows) {
      const key = `${r.employeeId}|${localDateKeyFromDb(r.workDate)}`;
      if (!punchMap.has(key)) punchMap.set(key, r);
    }

    const employeeIds = employees.map((f) => f.employeeId);
    const rangeStartForLeave = startOfLocalDay(rangeFrom);
    const rangeEndForLeave = endOfLocalDay(rangeTo);

    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: rangeEndForLeave },
        endDate: { gte: rangeStartForLeave },
      },
      include: { leaveType: { select: { nameAr: true } } },
    });

    const holidays = await this.holidaysService.findInRange(rangeStartForLeave, rangeEndForLeave);
    const holidayByDay = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const k = localDateKey(new Date(h.date));
      const arr = holidayByDay.get(k) ?? [];
      arr.push(h);
      holidayByDay.set(k, arr);
    }

    const scheduleCache = new Map<string, WorkSchedule | null>();
    const loadSchedule = async (employeeId: string, day: Date): Promise<WorkSchedule | null> => {
      const y = day.getFullYear();
      const m = day.getMonth() + 1;
      const cacheKey = `${employeeId}|${y}-${m}`;
      if (scheduleCache.has(cacheKey)) return scheduleCache.get(cacheKey)!;
      let s = await this.prisma.workSchedule.findFirst({
        where: { employeeId, year: y, month: m, status: 'APPROVED' },
      });
      if (!s) {
        s = await this.prisma.workSchedule.findUnique({
          where: {
            employeeId_year_month: { employeeId, year: y, month: m },
          },
        });
      }
      scheduleCache.set(cacheKey, s);
      return s;
    };

    const leaveForCell = (empId: string, day: Date) => {
      const ds = startOfLocalDay(day);
      const de = endOfLocalDay(day);
      return (
        leaves.find(
          (l) => l.employeeId === empId && l.startDate <= de && l.endDate >= ds,
        ) ?? null
      );
    };

    const officialHolidayFor = (
      emp: { workType: WorkType; departmentId: string },
      dayKey: string,
    ): Holiday | null => {
      const list = holidayByDay.get(dayKey) ?? [];
      for (const h of list) {
        if (emp.workType !== 'MORNING') continue;
        if (h.appliesTo === 'ALL' || h.appliesTo === 'MORNING_ONLY') return h;
        if (h.appliesTo === 'CUSTOM' && h.departmentIds) {
          try {
            const ids = JSON.parse(h.departmentIds) as string[];
            if (Array.isArray(ids) && ids.includes(emp.departmentId)) return h;
          } catch {
            /* ignore */
          }
        }
      }
      return null;
    };

    const rows: AttendanceSheetRow[] = [];

    for (const fp of employees) {
      const emp = fp.employee;
      for (const day of eachLocalDay(rangeFrom, rangeTo)) {
        const dayKey = localDateKey(day);
        const punch = punchMap.get(`${emp.id}|${dayKey}`);
        const leave = leaveForCell(emp.id, day);
        const schedule = await loadSchedule(emp.id, day);
        const isRest = schedule ? isRestDayFromSchedule(day, schedule) : false;
        const hol = officialHolidayFor(emp, dayKey);

        let dayKind: AttendanceSheetDayKind;
        let dayKindLabel: string;
        let leaveTypeName: string | null = null;
        let officialHolidayName: string | null = null;

        if (leave) {
          dayKind = 'LEAVE';
          dayKindLabel = 'إجازة معتمدة';
          leaveTypeName = leave.leaveType.nameAr;
        } else if (hol) {
          dayKind = 'OFFICIAL_HOLIDAY';
          dayKindLabel = `عطلة رسمية: ${hol.nameAr}`;
          officialHolidayName = hol.nameAr;
        } else if (isRest) {
          dayKind = 'REST_DAY';
          dayKindLabel = 'يوم استراحة (جدول الدوام)';
        } else {
          dayKind = 'WORK_EXPECTED';
          dayKindLabel = 'يوم عمل متوقع';
        }

        let breakTimeLabel: string | null = null;
        if (!leave && schedule && !isRest && schedule.breakStart && schedule.breakEnd) {
          breakTimeLabel = `${schedule.breakStart} – ${schedule.breakEnd}`;
        }

        rows.push({
          employeeId: emp.id,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle,
          departmentName: emp.department?.name ?? null,
          workDate: dayKey,
          checkInAt: punch?.checkInAt?.toISOString() ?? null,
          checkOutAt: punch?.checkOutAt?.toISOString() ?? null,
          workedMinutes: punch?.workedMinutes ?? null,
          punchIsValid: punch ? punch.isValid : null,
          punchNote: punch?.validationReason ?? null,
          dayKind,
          dayKindLabel,
          leaveTypeName,
          officialHolidayName,
          breakTimeLabel,
        });
      }
    }

    return {
      deviceId,
      batchId: hasBatch ? batchIdTrim! : null,
      fromDate: localDateKey(rangeFrom),
      toDate: localDateKey(rangeTo),
      employeeCount: employees.length,
      rowCount: rows.length,
      rows,
    };
  }

  async listAttendanceDailyRecords(deviceId: string, fromDate?: string, toDate?: string) {
    const where: {
      deviceId: string;
      workDate?: { gte?: Date; lte?: Date };
    } = { deviceId };
    if (fromDate || toDate) {
      where.workDate = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!Number.isNaN(d.getTime())) where.workDate.gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          where.workDate.lte = d;
        }
      }
    }
    return this.prisma.attendanceDailyRecord.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { employee: { fullName: 'asc' } }],
      include: {
        employee: {
          select: { id: true, fullName: true, jobTitle: true, department: { select: { name: true } } },
        },
        batch: { select: { id: true, fileName: true, createdAt: true } },
      },
    });
  }

  async deleteAttendanceImport(deviceId: string, batchId: string) {
    const batch = await this.prisma.attendanceImportBatch.findFirst({
      where: { id: batchId, deviceId },
      select: { id: true },
    });
    if (!batch) throw new BadRequestException('عملية الرفع غير موجودة على هذا الجهاز');

    await this.prisma.attendanceImportBatch.delete({ where: { id: batchId } });
    return { ok: true };
  }
}
