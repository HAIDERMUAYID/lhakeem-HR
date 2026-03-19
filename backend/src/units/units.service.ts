import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findByDepartment(departmentId: string, params?: { activeOnly?: boolean }) {
    if (!departmentId?.trim()) throw new BadRequestException('departmentId مطلوب');
    return this.prisma.unit.findMany({
      where: {
        departmentId: departmentId.trim(),
        ...(params?.activeOnly !== false ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findOne(id: string) {
    if (!id?.trim()) throw new BadRequestException('id مطلوب');
    const unit = await this.prisma.unit.findUnique({
      where: { id: id.trim() },
      include: {
        department: { select: { id: true, name: true } },
        managerUser: { select: { id: true, name: true, email: true } },
        employees: {
          where: { isActive: true },
          include: { department: { select: { id: true, name: true } }, unit: { select: { id: true, name: true } } },
          orderBy: { fullName: 'asc' },
        },
        _count: { select: { employees: true } },
      },
    });
    if (!unit) throw new NotFoundException('الوحدة غير موجودة');
    return unit;
  }

  async create(dto: {
    departmentId: string;
    name: string;
    code?: string | null;
    description?: string | null;
    managerUserId?: string | null;
    sortOrder?: number | null;
  }) {
    if (!dto.departmentId?.trim()) throw new BadRequestException('يجب اختيار القسم');
    if (!dto.name?.trim()) throw new BadRequestException('اسم الوحدة مطلوب');

    return this.prisma.unit.create({
      data: {
        departmentId: dto.departmentId.trim(),
        name: dto.name.trim(),
        code: dto.code?.trim() ? dto.code.trim() : null,
        description: dto.description?.trim() ? dto.description.trim() : null,
        managerUserId: dto.managerUserId?.trim() ? dto.managerUserId.trim() : null,
        sortOrder: dto.sortOrder != null ? Number(dto.sortOrder) : 0,
      },
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      code: string | null;
      description: string | null;
      managerUserId: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    if (!id?.trim()) throw new BadRequestException('id مطلوب');
    const exists = await this.prisma.unit.findUnique({ where: { id: id.trim() }, select: { id: true } });
    if (!exists) throw new NotFoundException('الوحدة غير موجودة');

    return this.prisma.unit.update({
      where: { id: id.trim() },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code?.trim() ? dto.code.trim() : null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ? dto.description.trim() : null } : {}),
        ...(dto.managerUserId !== undefined ? { managerUserId: dto.managerUserId?.trim() ? dto.managerUserId.trim() : null } : {}),
        ...(dto.sortOrder != null ? { sortOrder: Number(dto.sortOrder) } : {}),
        ...(dto.isActive !== undefined ? { isActive: !!dto.isActive } : {}),
      },
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async softDelete(id: string) {
    return this.update(id, { isActive: false });
  }
}

