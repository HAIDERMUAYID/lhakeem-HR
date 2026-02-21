import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

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
}
