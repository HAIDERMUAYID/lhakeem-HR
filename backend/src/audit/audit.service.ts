import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEY = new Set(
  [
    'password',
    'currentpassword',
    'newpassword',
    'passwordhash',
    'accesstoken',
    'refreshtoken',
    'token',
    'authorization',
    'secret',
    'apikey',
    'clientsecret',
  ].map((s) => s.toLowerCase()),
);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_KEY.has(k)) return true;
  return k.includes('password') || k.includes('secret');
}

export type AuditLogInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  details?: object;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private static readonly MAX_JSON_CHARS = 24_000;

  constructor(private prisma: PrismaService) {}

  /** استخراج IP من الطلب (يدعم البروكسي) */
  static clientIp(req: Pick<Request, 'headers' | 'socket'>): string | undefined {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') return xff.split(',')[0]?.trim();
    if (Array.isArray(xff) && xff[0]) return xff[0].split(',')[0]?.trim();
    const ip = req.socket?.remoteAddress;
    return ip || undefined;
  }

  static clientUserAgent(req: Pick<Request, 'headers'>): string | undefined {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 1024) : undefined;
  }

  /** إخفاء الحقول الحساسة قبل التخزين */
  sanitizeForAudit(value: unknown, depth = 0): unknown {
    if (depth > 12) return '[عمق زائد]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.sanitizeForAudit(v, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isSensitiveKey(k)) out[k] = '[مخفي]';
        else out[k] = this.sanitizeForAudit(v, depth + 1);
      }
      return out;
    }
    return String(value);
  }

  truncateDetails(details: object): object {
    try {
      const s = JSON.stringify(details);
      if (s.length <= AuditService.MAX_JSON_CHARS) return details;
      return {
        _truncated: true,
        _originalLength: s.length,
        preview: s.slice(0, 8000) + '…',
      };
    } catch {
      return { _error: 'تعذر تسلسل التفاصيل' };
    }
  }

  /**
   * تسجيل حدث تدقيق (لا يرمي خطأ إذا فشل التخزين حتى لا يتعطل العمل الرئيسي)
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      const safeDetails = input.details
        ? (this.truncateDetails(this.sanitizeForAudit(input.details) as object) as object)
        : undefined;
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          details: safeDetails,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent?.slice(0, 2048),
        },
      });
    } catch (e) {
      this.logger.warn(`audit log failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** تسجيل طلب HTTP (يُستدعى من الاعتراض العام) */
  async logHttpRequest(params: {
    userId?: string | null;
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    statusCode: number;
    durationMs: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const entity = AuditService.entityFromPath(params.path);
    const action = `HTTP_${params.method.toUpperCase()}`;
    const details = {
      path: params.path,
      query: params.query && Object.keys(params.query).length ? params.query : undefined,
      body: params.body !== undefined && params.body !== null ? params.body : undefined,
      statusCode: params.statusCode,
      durationMs: params.durationMs,
    };
    await this.log({
      userId: params.userId ?? null,
      action,
      entity,
      details,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  static entityFromPath(path: string): string {
    const pathname = path.split('?')[0].replace(/\/+$/, '') || '/';
    const withoutApi = pathname.replace(/^\/api\/?/, '');
    const first = withoutApi.split('/').filter(Boolean)[0];
    return first ? first : 'api';
  }

  static shouldSkipHttpAudit(path: string, method: string): boolean {
    const pathname = path.split('?')[0];
    if (pathname === '/api/health') return true;
    if (method === 'OPTIONS') return true;
    // تسجيل الدخول وتغيير كلمة المرور يُسجَّلان صراحةً في AuthService لتفاصيل أوضح
    if (method === 'POST' && pathname === '/api/auth/login') return true;
    if (method === 'POST' && pathname === '/api/auth/change-password') return true;
    return false;
  }
}
