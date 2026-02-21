import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaveTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.leaveType.findUnique({
      where: { id },
    });
  }

  async create(dto: {
    name: string;
    nameAr: string;
    deductFromBalance?: boolean;
    requiresApproval?: boolean;
    annualAllowance?: number;
    monthlyAccrual?: number;
  }) {
    return this.prisma.leaveType.create({
      data: {
        name: dto.name,
        nameAr: dto.nameAr,
        deductFromBalance: dto.deductFromBalance ?? true,
        requiresApproval: dto.requiresApproval ?? true,
        annualAllowance: dto.annualAllowance,
        monthlyAccrual: dto.monthlyAccrual,
      },
    });
  }

  async update(id: string, dto: Partial<{
    name: string;
    nameAr: string;
    deductFromBalance: boolean;
    requiresApproval: boolean;
    annualAllowance: number | null;
    monthlyAccrual: number | null;
    isActive: boolean;
  }>) {
    return this.prisma.leaveType.update({
      where: { id },
      data: dto as object,
    });
  }
}
