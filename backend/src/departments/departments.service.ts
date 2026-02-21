import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [total, active, withManager, totalEmployees] = await Promise.all([
      this.prisma.department.count(),
      this.prisma.department.count({ where: { isActive: true } }),
      this.prisma.department.count({ where: { managerUserId: { not: null } } }),
      this.prisma.employee.count({ where: { isActive: true } }),
    ]);
    return { total, active, inactive: total - active, withManager, totalEmployees };
  }

  async findAll(params?: { search?: string; activeOnly?: boolean }) {
    const where: Record<string, unknown> = {};
    if (params?.activeOnly !== false) where.isActive = true;
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.department.findUnique({
      where: { id },
      include: {
        managerUser: { select: { id: true, name: true, email: true } },
        employees: {
          where: { isActive: true },
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async update(
    id: string,
    dto: Partial<{ name: string; code: string; description: string; isActive: boolean; managerUserId: string | null }>,
  ) {
    return this.prisma.department.update({
      where: { id },
      data: dto,
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true } },
      },
    });
  }

  async create(dto: {
    name: string;
    code?: string;
    description?: string;
    managerUserId?: string | null;
  }) {
    return this.prisma.department.create({
      data: dto,
      include: {
        _count: { select: { employees: true } },
        managerUser: { select: { id: true, name: true } },
      },
    });
  }
}
