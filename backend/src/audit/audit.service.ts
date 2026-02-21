import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    userId: string,
    action: string,
    entity: string,
    entityId?: string,
    details?: object,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          entity,
          entityId,
          details: details as object,
        },
      });
    } catch {
      // Don't fail the main operation if audit fails
    }
  }
}
