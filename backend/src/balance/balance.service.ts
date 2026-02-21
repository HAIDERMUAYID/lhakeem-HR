import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BalanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * استحقاق رصيد الإجازات يومياً لجميع الموظفين النشطين.
   * يُضاف استحقاق يوم واحد (annualAllowance/365) لكل موظف. يمكن جدولته عبر cron يومياً.
   */
  async runDailyAccrual(userId: string) {
    const types = await this.prisma.leaveType.findMany({
      where: { isActive: true, annualAllowance: { not: null } },
    });
    const totalPerDay = types.reduce((s, t) => s + Number(t.annualAllowance ?? 0) / 365, 0);
    if (totalPerDay <= 0) return { accrued: 0, message: 'لا توجد أنواع إجازات مع رصيد سنوي' };

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const accrual = Math.round(totalPerDay * 100) / 100;
    for (const emp of employees) {
      await this.prisma.employee.update({
        where: { id: emp.id },
        data: { leaveBalance: { increment: accrual } },
      });
    }

    await this.audit.log(userId, 'BALANCE_ACCRUAL_DAILY', 'Employee', undefined, {
      employeeCount: employees.length,
      amountPerEmployee: accrual,
    });

    return {
      accrued: employees.length,
      amountPerEmployee: accrual,
      message: `تم استحقاق يومي (${accrual} يوم) لكل من ${employees.length} موظف نشط`,
    };
  }

  /**
   * استحقاق رصيد الإجازات شهرياً للموظفين النشطين
   * بناءً على monthlyAccrual في أنواع الإجازات
   */
  async runMonthlyAccrual(userId: string) {
    const types = await this.prisma.leaveType.findMany({
      where: { isActive: true, monthlyAccrual: { not: null } },
    });
    const totalAccrual = types.reduce((s, t) => s + Number(t.monthlyAccrual ?? 0), 0);
    if (totalAccrual <= 0) return { accrued: 0, message: 'لا توجد أنواع إجازات مع استحقاق شهري' };

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const emp of employees) {
      await this.prisma.employee.update({
        where: { id: emp.id },
        data: { leaveBalance: { increment: totalAccrual } },
      });
    }

    await this.audit.log(
      userId,
      'BALANCE_ACCRUAL',
      'Employee',
      undefined,
      { employeeCount: employees.length, amountPerEmployee: totalAccrual },
    );

    return {
      accrued: employees.length,
      amountPerEmployee: totalAccrual,
      message: `تم استحقاق ${totalAccrual} يوم لكل من ${employees.length} موظف نشط`,
    };
  }
}
