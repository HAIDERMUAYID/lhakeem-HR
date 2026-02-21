import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.AUDIT_VIEW)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = Math.min(parseInt(limit, 10) || 50, 100);
    const where: { entity?: string; action?: string; createdAt?: { gte?: Date; lte?: Date } } = {};
    if (entity?.trim()) where.entity = entity.trim();
    if (action?.trim()) where.action = action.trim();
    if (fromDate?.trim() || toDate?.trim()) {
      where.createdAt = {};
      if (fromDate?.trim()) {
        const from = new Date(fromDate.trim());
        if (!Number.isNaN(from.getTime())) where.createdAt.gte = from;
      }
      if (toDate?.trim()) {
        const to = new Date(toDate.trim());
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          where.createdAt.lte = to;
        }
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total };
  }
}
