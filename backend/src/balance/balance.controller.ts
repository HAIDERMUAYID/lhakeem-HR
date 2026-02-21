import { Controller, Post, UseGuards } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('balance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.BALANCE_ACCRUAL)
export class BalanceController {
  constructor(private balanceService: BalanceService) {}

  @Post('accrual')
  async runAccrual(@CurrentUser() user: { id: string }) {
    return this.balanceService.runMonthlyAccrual(user.id);
  }

  @Post('daily-accrual')
  async runDailyAccrual(@CurrentUser() user: { id: string }) {
    return this.balanceService.runDailyAccrual(user.id);
  }
}
