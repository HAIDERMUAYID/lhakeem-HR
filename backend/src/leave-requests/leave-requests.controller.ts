import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { LeaveStatus } from '@prisma/client';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard)
export class LeaveRequestsController {
  constructor(private leaveRequestsService: LeaveRequestsService) {}

  @Get('stats')
  async getStats() {
    return this.leaveRequestsService.getStats();
  }

  @Get('balance-info')
  async getBalanceInfo(
    @Query('employeeId') employeeId: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    if (!employeeId?.trim()) {
      return { totalBalanceCumulative: 0, accrualPerMonth: 3, balanceStartDate: null, baseBalance: 0, leaveDaysInCurrentMonth: 0 };
    }
    const asOf = asOfDate?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? new Date(asOfDate) : undefined;
    return this.leaveRequestsService.getBalanceInfo(employeeId, leaveTypeId ?? undefined, asOf ?? undefined);
  }

  @Get('effective-balances')
  async getEffectiveBalances(@Query('ids') ids?: string) {
    const list = ids?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
    return this.leaveRequestsService.getEffectiveBalances(list);
  }

  @Get('chart-data')
  async getChartData() {
    return this.leaveRequestsService.getChartData();
  }

  @Get('calendar')
  async calendar(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = parseInt(year ?? String(new Date().getFullYear()), 10);
    const m = parseInt(month ?? String(new Date().getMonth() + 1), 10);
    return this.leaveRequestsService.findForCalendar(y, m);
  }

  @Get('official-report')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.LEAVES_VIEW, PERMISSIONS.LEAVES_PRINT, PERMISSIONS.REPORTS_VIEW)
  async getOfficialReport(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('status') status?: LeaveStatus,
    @Query('workType') workType?: 'MORNING' | 'SHIFTS',
  ) {
    if (!fromDate?.trim() || !toDate?.trim()) {
      throw new BadRequestException('fromDate and toDate are required');
    }
    return this.leaveRequestsService.getOfficialReport({
      fromDate: fromDate.trim(),
      toDate: toDate.trim(),
      search: search?.trim(),
      departmentId: departmentId?.trim() || undefined,
      leaveTypeId: leaveTypeId?.trim() || undefined,
      status: status || undefined,
      workType: workType || undefined,
    });
  }

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: LeaveStatus,
    @Query('departmentId') departmentId?: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    return this.leaveRequestsService.findAll({
      skip,
      take: parseInt(limit, 10) || 20,
      search,
      employeeId,
      status,
      departmentId,
      leaveTypeId,
      fromDate,
      toDate,
      activeOnly: activeOnly === 'false' ? false : true,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.leaveRequestsService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate?: string;
      startTime?: string;
      daysCount?: number;
      hoursCount?: number;
      reason?: string;
    },
    @CurrentUser() user?: { id: string },
  ) {
    return this.leaveRequestsService.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      startTime: dto.startTime,
      createdByUserId: user?.id,
    });
  }

  @Post(':id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.LEAVES_APPROVE)
  async approve(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.leaveRequestsService.updateStatus(id, 'APPROVED', user.id);
  }

  @Post(':id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.LEAVES_APPROVE)
  async reject(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.leaveRequestsService.updateStatus(id, 'REJECTED', user.id);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.LEAVES_APPROVE, PERMISSIONS.ADMIN)
  async delete(@Param('id') id: string) {
    return this.leaveRequestsService.delete(id);
  }
}
