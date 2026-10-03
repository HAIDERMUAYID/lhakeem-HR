import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeDailyAttendance,
  looksLikeHardwareSerial,
  parseAttlogBody,
  serialFromQuery,
  type PunchLog,
} from './attendance-from-punches';
import { evaluateAgainstSchedule } from './attendance-metrics';
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

  private ingestDb: PrismaClient | null = null;
  private punchCache = new Map<string, { at: number; punches: { pin: string; scannedAt: Date; serial?: string }[] }>();
  private punchInflight = new Map<string, Promise<{ pin: string; scannedAt: Date; serial?: string }[]>>();
  private static readonly PUNCH_CACHE_MS = 60_000;
  private liveDayCache = new Map<string, { at: number; payload: unknown }>();
  private unmatchedCache = new Map<string, { at: number; payload: unknown }>();
  private static readonly MIN_WORK_MINUTES = 180; // 3 hours

  async listDepartmentOptions() {
    return this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

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
    const nextCode = dto.code !== undefined ? dto.code?.trim() || null : undefined;
    if (nextCode && looksLikeHardwareSerial(nextCode)) {
      await this.prisma.device.updateMany({
        where: { code: nextCode, NOT: { id } },
        data: { code: null },
      });
    }
    return this.prisma.device.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(nextCode !== undefined && { code: nextCode }),
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

  private ingestDatabaseUrl(): string | null {
    const explicit = process.env.ADMS_INGEST_DATABASE_URL?.trim();
    if (explicit) return explicit;
    const hr = process.env.DATABASE_URL?.trim();
    if (!hr) return null;
    try {
      const url = new URL(hr);
      url.pathname = `/${process.env.ADMS_INGEST_DATABASE_NAME?.trim() || 'hospital_db_j0zf'}`;
      return url.toString();
    } catch {
      return null;
    }
  }

  private ingestClient(): PrismaClient {
    if (this.ingestDb) return this.ingestDb;
    const url = this.ingestDatabaseUrl();
    if (!url) {
      throw new BadRequestException('تعذر قراءة البصمات حالياً.');
    }
    this.ingestDb = new PrismaClient({ datasources: { db: { url } } });
    return this.ingestDb;
  }

  private async loadAdmsPunches(params: {
    serial?: string | null;
    receivedFrom: Date;
    receivedTo: Date;
    scannedFrom?: Date;
    scannedTo?: Date;
  }): Promise<{ pin: string; scannedAt: Date; serial?: string }[]> {
    const scannedFrom = params.scannedFrom ?? params.receivedFrom;
    const scannedTo = params.scannedTo ?? params.receivedTo;
    const stamp = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
    const cacheKey = `${params.serial ?? ''}|${stamp(scannedFrom)}|${stamp(scannedTo)}`;
    const hit = this.punchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < DevicesService.PUNCH_CACHE_MS) return hit.punches;
    const pending = this.punchInflight.get(cacheKey);
    if (pending) return pending;

    const job = this.readAdmsPunches(params, scannedFrom, scannedTo)
      .then((punches) => {
        this.punchCache.set(cacheKey, { at: Date.now(), punches });
        if (this.punchCache.size > 48) {
          const oldest = [...this.punchCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) this.punchCache.delete(oldest[0]);
        }
        return punches;
      })
      .finally(() => {
        this.punchInflight.delete(cacheKey);
      });
    this.punchInflight.set(cacheKey, job);
    return job;
  }

  private async readAdmsPunches(
    params: {
      serial?: string | null;
      receivedFrom: Date;
      receivedTo: Date;
    },
    scannedFrom: Date,
    scannedTo: Date,
  ): Promise<{ pin: string; scannedAt: Date; serial?: string }[]> {
    const ingest = this.ingestClient();
    const serialLike = looksLikeHardwareSerial(params.serial) ? `%${params.serial}%` : '%';
    const rows = await ingest.$queryRaw<
      { body: string; raw_query: string | null; received_at: Date }[]
    >`
      SELECT convert_from(coalesce(body_bytes, ''::bytea), 'UTF8') AS body,
             raw_query,
             received_at
      FROM ingest.raw_ingress_requests
      WHERE method = 'POST'
        AND raw_path = '/iclock/cdata'
        AND coalesce(safe_headers->>'user-agent', '') ILIKE ${'%iClock%'}
        AND coalesce(raw_query, '') ILIKE ${serialLike}
        AND received_at >= ${params.receivedFrom}
        AND received_at <= ${params.receivedTo}
      ORDER BY received_at ASC
    `;
    const seen = new Set<string>();
    const punches: { pin: string; scannedAt: Date; serial?: string }[] = [];
    for (const row of rows) {
      const serial = serialFromQuery(row.raw_query);
      if (looksLikeHardwareSerial(params.serial) && serial && serial !== params.serial) continue;
      for (const p of parseAttlogBody(row.body || '')) {
        if (p.scannedAt < scannedFrom || p.scannedAt > scannedTo) continue;
        const key = `${p.pin}|${p.scannedAt.toISOString()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        punches.push({ ...p, serial });
      }
    }
    punches.sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
    return punches;
  }

  async listAdmsInbox() {
    const receivedFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const receivedTo = new Date();
    const ingest = this.ingestClient();
    const rows = await ingest.$queryRaw<{ raw_query: string | null; received_at: Date }[]>`
      SELECT raw_query, received_at
      FROM ingest.raw_ingress_requests
      WHERE method = 'POST'
        AND raw_path = '/iclock/cdata'
        AND coalesce(safe_headers->>'user-agent', '') ILIKE ${'%iClock%'}
        AND received_at >= ${receivedFrom}
        AND received_at <= ${receivedTo}
    `;
    const bySn = new Map<string, { serial: string; lastSeenAt: Date; requestCount: number }>();
    for (const row of rows) {
      const serial = serialFromQuery(row.raw_query);
      if (!serial || !looksLikeHardwareSerial(serial)) continue;
      const ex = bySn.get(serial);
      if (!ex) bySn.set(serial, { serial, lastSeenAt: row.received_at, requestCount: 1 });
      else {
        ex.requestCount += 1;
        if (row.received_at > ex.lastSeenAt) ex.lastSeenAt = row.received_at;
      }
    }
    const seen = [...bySn.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());

    const devices = await this.prisma.device.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { fingerprints: true } } },
    });
    const boundBySerial = new Map(
      devices.filter((d) => looksLikeHardwareSerial(d.code)).map((d) => [d.code as string, d]),
    );
    return {
      boundDevices: devices
        .filter((d) => looksLikeHardwareSerial(d.code))
        .map((d) => ({
          id: d.id,
          name: d.name,
          serial: d.code as string,
          fingerprintCount: d._count.fingerprints,
        })),
      unboundSerials: seen
        .filter((s) => !boundBySerial.has(s.serial))
        .map((s) => ({
          serial: s.serial,
          lastSeenAt: s.lastSeenAt.toISOString(),
          requestCount: s.requestCount,
        })),
      linkableDevices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        serial: d.code,
        fingerprintCount: d._count.fingerprints,
        bound: looksLikeHardwareSerial(d.code),
      })),
    };
  }

  async bindSerial(deviceId: string, serial: string) {
    const sn = serial.trim();
    if (!looksLikeHardwareSerial(sn)) {
      throw new BadRequestException('الرقم التسلسلي غير صالح');
    }
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    return this.update(deviceId, { name: device.name, code: sn, isActive: device.isActive });
  }

  async inferDeviceDepartment(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { department: { select: { id: true, name: true } } },
    });
    if (device?.department) {
      return {
        id: device.department.id,
        name: device.department.name,
        employeeCount: 0,
        locked: true,
      };
    }
    const grouped = await this.prisma.employeeFingerprint.findMany({
      where: { deviceId },
      select: {
        employee: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
      },
    });
    const tally = new Map<string, { id: string; name: string; n: number }>();
    for (const row of grouped) {
      const id = row.employee.departmentId;
      const name = row.employee.department.name;
      const ex = tally.get(id);
      if (ex) ex.n += 1;
      else tally.set(id, { id, name, n: 1 });
    }
    const top = [...tally.values()].sort((a, b) => b.n - a.n)[0] ?? null;
    return top
      ? { id: top.id, name: top.name, employeeCount: top.n, locked: false }
      : null;
  }

  async setDeviceDepartment(deviceId: string, departmentId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new BadRequestException('القسم غير موجود');
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { departmentId },
    });
    return { id: dept.id, name: dept.name, locked: true };
  }

  async assignPin(
    deviceId: string,
    fingerprintId: string,
    employeeId: string,
    moveToDepartment = false,
  ) {
    const fid = fingerprintId.trim();
    if (!fid) throw new BadRequestException('معرف البصمة مطلوب');
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!emp) throw new BadRequestException('الموظف غير موجود');
    if (!emp.isActive) throw new BadRequestException('لا يمكن ربط موظف غير نشط');

    const deviceDept = await this.inferDeviceDepartment(deviceId);
    if (deviceDept && emp.departmentId !== deviceDept.id) {
      if (!moveToDepartment) {
        throw new BadRequestException(
          `الموظف يتبع قسم «${emp.department.name}». جهاز القسم هو «${deviceDept.name}». فعّل نقل الموظف لهذا القسم أو اختر موظفاً من نفس القسم.`,
        );
      }
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { departmentId: deviceDept.id },
      });
    }

    const created = await this.addFingerprint(employeeId, deviceId, fid);
    this.liveDayCache.clear();
    this.punchCache.clear();
    this.punchInflight.clear();
    this.unmatchedCache.clear();
    return created;
  }

  async listUnmatchedPins(deviceId: string, fromDateStr?: string, toDateStr?: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    if (!looksLikeHardwareSerial(device.code)) {
      throw new BadRequestException('اربط الرقم التسلسلي بهذا الجهاز أولاً');
    }

    const fromKey = fromDateStr?.trim() || '';
    const toKey = toDateStr?.trim() || '';
    const cacheKey = `${deviceId}|${fromKey}|${toKey}`;
    const hit = this.unmatchedCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 20_000) return hit.payload;

    const scannedFrom = fromKey ? startOfLocalDay(new Date(`${fromKey}T12:00:00`)) : new Date('2020-01-01T00:00:00');
    const scannedTo = toKey ? endOfLocalDay(startOfLocalDay(new Date(`${toKey}T12:00:00`))) : endOfLocalDay(new Date());
    if (Number.isNaN(scannedFrom.getTime()) || Number.isNaN(scannedTo.getTime())) {
      throw new BadRequestException('التاريخ غير صحيح');
    }
    if (scannedFrom.getTime() > scannedTo.getTime()) {
      throw new BadRequestException('من تاريخ يجب أن يكون قبل أو يساوي إلى تاريخ');
    }

    const receivedFrom = fromKey
      ? new Date(scannedFrom.getTime() - 3 * 24 * 60 * 60 * 1000)
      : new Date('2020-01-01T00:00:00');
    const receivedTo = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const [fingerprints, punches] = await Promise.all([
      this.prisma.employeeFingerprint.findMany({
        where: { deviceId },
        select: { fingerprintId: true },
      }),
      this.loadAdmsPunches({
        serial: device.code,
        receivedFrom,
        receivedTo,
        scannedFrom,
        scannedTo,
      }),
    ]);
    const known = new Set(fingerprints.map((f) => f.fingerprintId));
    const map = new Map<string, { fingerprintId: string; punchCount: number; firstSeenAt: string; lastSeenAt: string }>();
    for (const punch of punches) {
      if (known.has(punch.pin)) continue;
      const iso = punch.scannedAt.toISOString();
      const existing = map.get(punch.pin);
      if (!existing) {
        map.set(punch.pin, { fingerprintId: punch.pin, punchCount: 1, firstSeenAt: iso, lastSeenAt: iso });
      } else {
        existing.punchCount += 1;
        if (iso > existing.lastSeenAt) existing.lastSeenAt = iso;
        if (iso < existing.firstSeenAt) existing.firstSeenAt = iso;
      }
    }
    const pins = [...map.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    const payload = {
      deviceId,
      fromDate: fromKey || null,
      toDate: toKey || null,
      total: pins.length,
      pins,
    };
    this.unmatchedCache.set(cacheKey, { at: Date.now(), payload });
    if (this.unmatchedCache.size > 8) {
      const oldest = [...this.unmatchedCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.unmatchedCache.delete(oldest[0]);
    }
    return payload;
  }

  async getLiveDay(deviceId: string, fromDateStr?: string, toDateStr?: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    if (!looksLikeHardwareSerial(device.code)) {
      throw new BadRequestException('اربط الرقم التسلسلي بهذا الجهاز أولاً');
    }

    const fromKey = fromDateStr || toDateStr;
    const toKey = toDateStr || fromDateStr;
    const rangeFrom = fromKey ? startOfLocalDay(new Date(`${fromKey}T12:00:00`)) : startOfLocalDay(new Date());
    const rangeTo = toKey ? startOfLocalDay(new Date(`${toKey}T12:00:00`)) : rangeFrom;
    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      throw new BadRequestException('التاريخ غير صحيح');
    }
    if (rangeFrom.getTime() > rangeTo.getTime()) {
      throw new BadRequestException('من تاريخ يجب أن يكون قبل أو يساوي إلى تاريخ');
    }
    const spanDays =
      Math.floor((rangeTo.getTime() - rangeFrom.getTime()) / 86400000) + 1;
    if (spanDays > 31) {
      throw new BadRequestException('نطاق الكشف يقتصر على 31 يوماً');
    }
    const rangeEnd = endOfLocalDay(rangeTo);
    const liveKey = `${deviceId}|${localDateKey(rangeFrom)}|${localDateKey(rangeTo)}`;
    const liveHit = this.liveDayCache.get(liveKey);
    if (liveHit && Date.now() - liveHit.at < 60_000) {
      return liveHit.payload as any;
    }
    const receivedFrom = new Date(rangeFrom.getTime() - 3 * 24 * 60 * 60 * 1000);
    const receivedTo = new Date(Math.max(rangeEnd.getTime(), Date.now()) + 2 * 24 * 60 * 60 * 1000);

    const [fingerprints, punches] = await Promise.all([
      this.prisma.employeeFingerprint.findMany({
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
              unit: { select: { name: true } },
            },
          },
        },
      }),
      this.loadAdmsPunches({
        serial: device.code,
        receivedFrom,
        receivedTo,
        scannedFrom: rangeFrom,
        scannedTo: rangeEnd,
      }),
    ]);
    const byPin = new Map(fingerprints.map((f) => [f.fingerprintId, f]));

    const matchedLogs: PunchLog[] = [];
    const punchLog = punches.map((p) => {
      const fp = byPin.get(p.pin);
      if (fp) {
        matchedLogs.push({
          deviceEmployeeCode: p.pin,
          employeeId: fp.employeeId,
          scannedAt: p.scannedAt,
        });
      }
      return {
        fingerprintId: p.pin,
        scannedAt: p.scannedAt.toISOString(),
        employeeId: fp?.employeeId ?? null,
        employeeName: fp?.employee.fullName ?? null,
        unitName: fp?.employee.unit?.name ?? null,
        matched: Boolean(fp),
      };
    });
    const unmatchedMap = new Map<string, { fingerprintId: string; lastSeenAt: string; punchCount: number }>();
    for (const p of punches) {
      if (byPin.has(p.pin)) continue;
      const ex = unmatchedMap.get(p.pin);
      if (!ex) unmatchedMap.set(p.pin, { fingerprintId: p.pin, lastSeenAt: p.scannedAt.toISOString(), punchCount: 1 });
      else {
        ex.punchCount += 1;
        if (p.scannedAt.toISOString() > ex.lastSeenAt) ex.lastSeenAt = p.scannedAt.toISOString();
      }
    }
    const unmatchedDetails = [...unmatchedMap.values()];
    const unmatchedPins = unmatchedDetails.map((u) => u.fingerprintId);
    const dailyByEmpDay = new Map(
      computeDailyAttendance(matchedLogs).map((r) => [`${r.employeeId}|${localDateKey(r.workDate)}`, r]),
    );

    const employees = fingerprints
      .filter((f) => f.employee.isActive)
      .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, 'ar'));

    const employeeIds = employees.map((f) => f.employeeId);
    const monthKeys = new Set<string>();
    for (const d of eachLocalDay(rangeFrom, rangeTo)) {
      monthKeys.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }
    const [leaves, holidays, schedules] = await Promise.all([
      employeeIds.length
        ? this.prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              status: 'APPROVED',
              startDate: { lte: rangeEnd },
              endDate: { gte: rangeFrom },
            },
            include: { leaveType: { select: { nameAr: true } } },
          })
        : Promise.resolve([]),
      this.holidaysService.findInRange(rangeFrom, rangeEnd),
      employeeIds.length
        ? this.prisma.workSchedule.findMany({
            where: {
              employeeId: { in: employeeIds },
              OR: [...monthKeys].map((k) => {
                const [ys, ms] = k.split('-');
                return { year: Number(ys), month: Number(ms) };
              }),
            },
          })
        : Promise.resolve([]),
    ]);
    const leavesByEmp = new Map<string, typeof leaves>();
    for (const leave of leaves) {
      const list = leavesByEmp.get(leave.employeeId) ?? [];
      list.push(leave);
      leavesByEmp.set(leave.employeeId, list);
    }

    const scheduleByEmpMonth = new Map<string, (typeof schedules)[number]>();
    for (const s of schedules) {
      const key = `${s.employeeId}|${s.year}-${s.month}`;
      const prev = scheduleByEmpMonth.get(key);
      if (!prev || (prev.status !== 'APPROVED' && s.status === 'APPROVED')) {
        scheduleByEmpMonth.set(key, s);
      }
    }

    const roster = [];
    for (const day of eachLocalDay(rangeFrom, rangeTo)) {
      const dayKey = localDateKey(day);
      const dayEnd = endOfLocalDay(day);
      for (const fp of employees) {
        const emp = fp.employee;
        const punch = dailyByEmpDay.get(`${emp.id}|${dayKey}`);
        const leave =
          (leavesByEmp.get(emp.id) ?? []).find((l) => l.startDate <= dayEnd && l.endDate >= day) ?? null;
        const schedule = scheduleByEmpMonth.get(`${emp.id}|${day.getFullYear()}-${day.getMonth() + 1}`) ?? null;
        const isRest = schedule ? isRestDayFromSchedule(day, schedule) : false;
        let holidayName: string | null = null;
        if (emp.workType === 'MORNING') {
          for (const h of holidays) {
            if (localDateKey(new Date(h.date)) !== dayKey) continue;
            if (h.appliesTo === 'ALL' || h.appliesTo === 'MORNING_ONLY') {
              holidayName = h.nameAr;
              break;
            }
            if (h.appliesTo === 'CUSTOM' && h.departmentIds) {
              try {
                const ids = JSON.parse(h.departmentIds) as string[];
                if (Array.isArray(ids) && ids.includes(emp.departmentId)) {
                  holidayName = h.nameAr;
                  break;
                }
              } catch {
                /* ignore */
              }
            }
          }
        }

        let status: 'PRESENT' | 'SINGLE' | 'ABSENT' | 'LEAVE' | 'REST' | 'HOLIDAY';
        let statusLabel: string;
        if (leave) {
          status = 'LEAVE';
          statusLabel = leave.leaveType.nameAr || 'إجازة';
        } else if (holidayName) {
          status = 'HOLIDAY';
          statusLabel = `عطلة: ${holidayName}`;
        } else if (isRest) {
          status = 'REST';
          statusLabel = 'استراحة';
        } else if (punch?.displayMode === 'pair') {
          status = 'PRESENT';
          statusLabel = 'حاضر';
        } else if (punch) {
          status = 'SINGLE';
          statusLabel = 'حاضر — بصمة واحدة';
        } else {
          status = 'ABSENT';
          statusLabel = 'غائب';
        }

        const dutyDay = status === 'PRESENT' || status === 'SINGLE' || status === 'ABSENT';
        const metrics = evaluateAgainstSchedule({
          dutyDay,
          workDate: day,
          startTime: schedule?.startTime,
          endTime: schedule?.endTime,
          breakStart: schedule?.breakStart,
          breakEnd: schedule?.breakEnd,
          checkInAt: punch?.checkInAt ?? null,
          checkOutAt: punch?.checkOutAt ?? null,
          displayMode: punch?.displayMode ?? null,
        });
        if (metrics.lateMinutes > 0 && (status === 'PRESENT' || status === 'SINGLE')) {
          statusLabel = status === 'SINGLE' ? 'متأخر — بصمة واحدة' : 'متأخر';
        }

        roster.push({
          employeeId: emp.id,
          fingerprintId: fp.fingerprintId,
          employeeName: emp.fullName,
          jobTitle: emp.jobTitle,
          departmentName: emp.department?.name ?? null,
          unitName: emp.unit?.name ?? null,
          workDate: dayKey,
          scheduledStart: metrics.scheduledStart,
          scheduledEnd: metrics.scheduledEnd,
          checkInAt: dutyDay ? punch?.checkInAt?.toISOString() ?? null : null,
          checkOutAt: dutyDay ? punch?.checkOutAt?.toISOString() ?? null : null,
          expectedMinutes: metrics.expectedMinutes,
          workedMinutes: metrics.workedMinutes,
          lateMinutes: metrics.lateMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          displayMode: punch?.displayMode ?? null,
          punchCount: punch?.punchCount ?? 0,
          status,
          statusLabel,
        });
      }
    }

    const deviceDepartment = device.department
      ? {
          id: device.department.id,
          name: device.department.name,
          employeeCount: fingerprints.filter((f) => f.employee.departmentId === device.department!.id).length,
          locked: true,
        }
      : (() => {
          const tally = new Map<string, { id: string; name: string; n: number }>();
          for (const row of fingerprints) {
            const id = row.employee.departmentId;
            const name = row.employee.department.name;
            const ex = tally.get(id);
            if (ex) ex.n += 1;
            else tally.set(id, { id, name, n: 1 });
          }
          const top = [...tally.values()].sort((a, b) => b.n - a.n)[0] ?? null;
          return top ? { id: top.id, name: top.name, employeeCount: top.n, locked: false } : null;
        })();

    const counts = {
      employees: employees.length,
      rows: roster.length,
      present: roster.filter((r) => r.status === 'PRESENT' || r.status === 'SINGLE').length,
      late: roster.filter((r) => r.lateMinutes > 0 && (r.status === 'PRESENT' || r.status === 'SINGLE')).length,
      overtime: roster.filter((r) => r.overtimeMinutes > 0).length,
      absent: roster.filter((r) => r.status === 'ABSENT').length,
      leave: roster.filter((r) => r.status === 'LEAVE').length,
      rest: roster.filter((r) => r.status === 'REST').length,
      holiday: roster.filter((r) => r.status === 'HOLIDAY').length,
      unmatchedPins: unmatchedPins.length,
    };

    const payload = {
      deviceId,
      deviceName: device.name,
      serial: device.code,
      deviceDepartment,
      date: localDateKey(rangeFrom),
      fromDate: localDateKey(rangeFrom),
      toDate: localDateKey(rangeTo),
      counts,
      unmatchedPins,
      unmatchedDetails,
      roster,
      punches: punchLog,
    };
    this.liveDayCache.set(liveKey, { at: Date.now(), payload });
    if (this.liveDayCache.size > 6) {
      const oldest = [...this.liveDayCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.liveDayCache.delete(oldest[0]);
    }
    return payload;
  }


  async punchesOnSerial(serial: string | null | undefined, from: Date, to: Date) {
    if (!looksLikeHardwareSerial(serial)) return [];
    return this.loadAdmsPunches({
      serial,
      receivedFrom: new Date(from.getTime() - 3 * 24 * 60 * 60 * 1000),
      receivedTo: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      scannedFrom: from,
      scannedTo: to,
    });
  }

  async getLiveAttendance(deviceId: string, fromDate?: string, toDate?: string) {
    return this.getLiveDay(deviceId, fromDate, toDate);
  }

  async syncAdmsAttendance(deviceId: string, uploadedById?: string, fromDate?: string, toDate?: string) {
    const fingerprints = await this.prisma.employeeFingerprint.findMany({
      where: { deviceId },
      select: { fingerprintId: true, employeeId: true, deviceId: true },
    });
    const byPin = new Map(fingerprints.map((f) => [f.fingerprintId, f]));
    const employeeByCode = new Map(fingerprints.map((f) => [f.fingerprintId, f.employeeId]));
    const to = toDate ? new Date(`${toDate}T23:59:59`) : new Date();
    const from = fromDate
      ? new Date(`${fromDate}T00:00:00`)
      : new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new BadRequestException('الجهاز غير موجود');
    const allPunches = await this.loadAdmsPunches({
      serial: device.code,
      receivedFrom: from,
      receivedTo: to,
      scannedFrom: from,
      scannedTo: to,
    });
    const unmatchedPins = [...new Set(allPunches.filter((p) => !byPin.has(p.pin)).map((p) => p.pin))];
    const parsedLogs: PunchLog[] = [];
    for (const p of allPunches) {
      const employeeId = employeeByCode.get(p.pin);
      if (!employeeId) continue;
      parsedLogs.push({
        deviceEmployeeCode: p.pin,
        employeeId,
        scannedAt: p.scannedAt,
      });
    }
    const dailyRows = computeDailyAttendance(parsedLogs);

    const existing = await this.prisma.attendanceImportBatch.findMany({
      where: { deviceId, fileName: 'ADMS-LIVE' },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      if (existing.length) {
        await tx.attendanceImportBatch.deleteMany({
          where: { id: { in: existing.map((b) => b.id) } },
        });
      }
      const batch = await tx.attendanceImportBatch.create({
        data: {
          deviceId,
          uploadedById: uploadedById || null,
          fileName: 'ADMS-LIVE',
          rowsTotal: allPunches.length,
          rowsParsed: parsedLogs.length,
          rowsAccepted: dailyRows.length,
          rowsRejected: unmatchedPins.length,
          status:
            unmatchedPins.length === 0
              ? 'SUCCESS'
              : dailyRows.length > 0
                ? 'PARTIAL'
                : 'FAILED',
          notes:
            unmatchedPins.length > 0
              ? `معرفات غير مربوطة: ${unmatchedPins.slice(0, 20).join(', ')}`
              : 'مزامنة مباشرة من جهاز البصمة السحابي',
        },
      });
      if (parsedLogs.length) {
        await tx.attendanceImportRawLog.createMany({
          data: parsedLogs.map((r, i) => ({
            batchId: batch.id,
            deviceId,
            deviceEmployeeCode: r.deviceEmployeeCode,
            scannedAt: r.scannedAt,
            rowNumber: i + 1,
          })),
        });
      }
      if (dailyRows.length) {
        await tx.attendanceDailyRecord.createMany({
          data: dailyRows.map((r) => ({
            batchId: batch.id,
            deviceId,
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
    },
      { timeout: 60000 },
    );

    return {
      ok: true,
      punchCount: allPunches.length,
      matchedCount: parsedLogs.length,
      dailyCount: dailyRows.length,
      unmatchedPins,
    };
  }
}
