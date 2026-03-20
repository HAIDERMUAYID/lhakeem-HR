import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditService } from './audit.service';

type ReqUser = { id: string };

@Injectable()
export class AuditHttpInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = (req.method || 'GET').toUpperCase();
    const path = req.originalUrl || req.url || '';
    const pathname = path.split('?')[0];

    if (AuditService.shouldSkipHttpAudit(pathname, method)) {
      return next.handle();
    }

    const started = Date.now();
    let httpError: { status?: number } | null = null;

    const user = (req as Request & { user?: ReqUser }).user;
    const userId = user?.id ?? null;
    const ip = AuditService.clientIp(req);
    const ua = AuditService.clientUserAgent(req);

    const rawBody = req.body;
    const sanitizedBody =
      rawBody !== undefined && rawBody !== null
        ? (this.audit.sanitizeForAudit(rawBody) as object)
        : undefined;

    const queryObj =
      req.query && typeof req.query === 'object'
        ? (this.audit.sanitizeForAudit(req.query) as Record<string, unknown>)
        : undefined;

    return next.handle().pipe(
      tap({
        error: (err: { status?: number; statusCode?: number }) => {
          httpError = { status: err?.status ?? err?.statusCode };
        },
        finalize: () => {
          const statusCode =
            httpError?.status ??
            (typeof res.statusCode === 'number' ? res.statusCode : 200);
          const durationMs = Date.now() - started;
          void this.audit.logHttpRequest({
            userId,
            method,
            path: pathname,
            query: queryObj,
            body: sanitizedBody,
            statusCode,
            durationMs,
            ipAddress: ip,
            userAgent: ua,
          });
        },
      }),
    );
  }
}
