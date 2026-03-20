import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

type DeviceInfo = {
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
};

function parseDeviceInfo(userAgent?: string | null): DeviceInfo {
  const ua = (userAgent || '').toLowerCase();
  const browserLabel = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('chrome/')
        ? 'Chrome'
        : ua.includes('firefox/')
          ? 'Firefox'
          : ua.includes('safari/') && !ua.includes('chrome/')
            ? 'Safari'
            : 'متصفح غير معروف';

  const osLabel = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
      ? 'iOS'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os x') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'نظام غير معروف';

  let deviceLabel = 'جهاز غير معروف';
  if (ua.includes('iphone')) deviceLabel = 'iPhone';
  else if (ua.includes('ipad')) deviceLabel = 'iPad';
  else if (ua.includes('samsung')) deviceLabel = 'Samsung';
  else if (ua.includes('huawei')) deviceLabel = 'Huawei';
  else if (ua.includes('xiaomi') || ua.includes('redmi') || ua.includes('mi ')) deviceLabel = 'Xiaomi';
  else if (ua.includes('android') && ua.includes('mobile')) deviceLabel = 'Android Phone';
  else if (ua.includes('android')) deviceLabel = 'Android Tablet';
  else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) deviceLabel = 'Desktop/Laptop';

  return { deviceLabel, browserLabel, osLabel };
}

function buildAuditMessage(log: {
  action: string;
  entity: string;
  details?: unknown;
  user?: { name?: string | null } | null;
}) {
  const actor = log.user?.name || 'مستخدم النظام';
  const details = (log.details || {}) as Record<string, unknown>;
  if (log.action === 'LOGIN_SUCCESS') return `${actor} سجّل دخول بنجاح`;
  if (log.action === 'LOGIN_FAILED') return `محاولة دخول فاشلة (${String(details.reason || 'سبب غير معروف')})`;
  if (log.action === 'PASSWORD_CHANGE') return `${actor} غيّر كلمة المرور`;
  if (log.action.startsWith('HTTP_')) {
    const method = log.action.replace('HTTP_', '');
    const path = typeof details.path === 'string' ? details.path : `/api/${log.entity}`;
    const status = details.statusCode ? ` - ${details.statusCode}` : '';
    return `${actor} نفّذ ${method} على ${path}${status}`;
  }
  return `${actor} نفّذ ${log.action} على ${log.entity}`;
}

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
    @Query('username') username?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = Math.min(parseInt(limit, 10) || 50, 200);
    const where: Prisma.AuditLogWhereInput = {};
    if (entity?.trim()) where.entity = entity.trim();
    if (action?.trim()) where.action = action.trim();
    if (username?.trim()) {
      const q = username.trim();
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      };
    }
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
        include: { user: { select: { name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const enhanced = data.map((log) => ({
      ...log,
      ...parseDeviceInfo(log.userAgent),
      message: buildAuditMessage(log),
    }));

    return { data: enhanced, total };
  }

  @Get('active-sessions')
  async getActiveSessions(@Query('minutes') minutes = '60') {
    const windowMinutes = Math.max(5, Math.min(24 * 60, parseInt(minutes, 10) || 60));
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: { in: ['LOGIN_SUCCESS', 'HTTP_GET', 'HTTP_POST', 'HTTP_PUT', 'HTTP_PATCH', 'HTTP_DELETE'] },
      },
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 4000,
    });

    const sessionsMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        username: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        deviceLabel: string;
        browserLabel: string;
        osLabel: string;
        lastSeenAt: Date;
        firstSeenAt: Date;
        actionsCount: number;
        isActiveNow: boolean;
      }
    >();

    for (const log of logs) {
      if (!log.userId) continue;
      const key = `${log.userId}|${log.ipAddress || '-'}|${log.userAgent || '-'}`;
      const parsed = parseDeviceInfo(log.userAgent);
      const existing = sessionsMap.get(key);
      if (!existing) {
        sessionsMap.set(key, {
          userId: log.userId,
          userName: log.user?.name || 'مستخدم',
          username: log.user?.username || null,
          ipAddress: log.ipAddress || null,
          userAgent: log.userAgent || null,
          deviceLabel: parsed.deviceLabel,
          browserLabel: parsed.browserLabel,
          osLabel: parsed.osLabel,
          lastSeenAt: log.createdAt,
          firstSeenAt: log.createdAt,
          actionsCount: 1,
          isActiveNow: Date.now() - log.createdAt.getTime() <= 30 * 60 * 1000,
        });
      } else {
        existing.actionsCount += 1;
        if (log.createdAt > existing.lastSeenAt) existing.lastSeenAt = log.createdAt;
        if (log.createdAt < existing.firstSeenAt) existing.firstSeenAt = log.createdAt;
        existing.isActiveNow = existing.isActiveNow || Date.now() - log.createdAt.getTime() <= 30 * 60 * 1000;
      }
    }

    const data = Array.from(sessionsMap.values()).sort(
      (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
    );
    return { data, total: data.length, windowMinutes };
  }
}
