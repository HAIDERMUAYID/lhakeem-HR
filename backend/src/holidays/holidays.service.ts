import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidayScope } from '@prisma/client';

@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  async findInRange(fromDate: Date, toDate: Date) {
    return this.prisma.holiday.findMany({
      where: {
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async findAll(year?: number) {
    const where: { date?: { gte?: Date; lte?: Date } } = {};
    if (year) {
      where.date = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      };
    }
    return this.prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async update(id: string, dto: Partial<{ name: string; nameAr: string; date: Date; appliesTo: HolidayScope }>) {
    return this.prisma.holiday.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async delete(id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }

  async create(dto: {
    name: string;
    nameAr: string;
    date: Date;
    appliesTo?: HolidayScope;
  }) {
    return this.prisma.holiday.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        appliesTo: dto.appliesTo || 'ALL',
      },
    });
  }
}
