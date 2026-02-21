import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { WorkSchedulesService } from './work-schedules.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CurrentUser } from '../auth/decorators/user.decorator';

@Controller('work-schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkSchedulesController {
  constructor(
    private workSchedulesService: WorkSchedulesService,
    private usersService: UsersService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_VIEW, PERMISSIONS.SCHEDULES_MANAGE)
  async findAll(
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user, departmentId);
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    const month = monthStr ? parseInt(monthStr, 10) : undefined;
    return this.workSchedulesService.findAll(year, month, employeeId, deptFilter);
  }

  @Get('months')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_VIEW, PERMISSIONS.SCHEDULES_MANAGE)
  async getAvailableMonths(
    @Query('departmentId') departmentId?: string,
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user, departmentId);
    return this.workSchedulesService.getAvailableMonths(deptFilter);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_MANAGE)
  async upsert(
    @Body()
    dto: {
      employeeId: string;
      year: number;
      month: number;
      workType: string;
      shiftPattern?: string;
      daysOfWeek: string;
      cycleStartDate?: string;
      startTime: string;
      endTime: string;
      breakStart?: string;
      breakEnd?: string;
    },
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user);
    const now = new Date();
    const year = dto.year ?? now.getFullYear();
    const month = dto.month ?? now.getMonth() + 1;
    return this.workSchedulesService.upsert(dto.employeeId, year, month, {
      workType: dto.workType as 'MORNING' | 'SHIFTS',
      shiftPattern: dto.shiftPattern ?? null,
      daysOfWeek: dto.daysOfWeek,
      cycleStartDate: dto.cycleStartDate ? new Date(dto.cycleStartDate) : undefined,
      startTime: dto.startTime,
      endTime: dto.endTime,
      breakStart: dto.breakStart,
      breakEnd: dto.breakEnd,
    }, deptFilter, user?.permissions);
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_MANAGE)
  async bulkApply(
    @Body()
    body: {
      employeeIds: string[];
      year?: number;
      month?: number;
      workType: string;
      shiftPattern?: string;
      daysOfWeek: string;
      cycleStartDate?: string;
      startTime: string;
      endTime: string;
      breakStart?: string;
      breakEnd?: string;
    },
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user);
    const now = new Date();
    const year = body.year ?? now.getFullYear();
    const month = body.month ?? now.getMonth() + 1;
    return this.workSchedulesService.bulkApply(year, month, body, deptFilter, user?.permissions);
  }

  @Post('approve-department-month')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_APPROVE)
  async approveDepartmentMonth(
    @Body() body: { year: number; month: number; departmentId: string },
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user, body.departmentId);
    return this.workSchedulesService.approveDepartmentMonth(
      body.year,
      body.month,
      body.departmentId,
      user.id,
      deptFilter,
      user.permissions,
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_MANAGE, PERMISSIONS.SCHEDULES_APPROVE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user);
    return this.workSchedulesService.delete(id, deptFilter, user?.permissions);
  }

  @Get('official-report')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_VIEW, PERMISSIONS.SCHEDULES_MANAGE)
  async getOfficialReport(
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
    @Query('departmentId') departmentId?: string,
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      throw new ForbiddenException('السنة والشهر غير صالحين');
    }
    const deptFilter = await this.getDepartmentFilter(user, departmentId);
    return this.workSchedulesService.getOfficialReport(year, month, deptFilter, departmentId ?? undefined);
  }

  @Post('copy-from-month')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.SCHEDULES_MANAGE)
  async copyFromMonth(
    @Body()
    body: {
      sourceYear: number;
      sourceMonth: number;
      targetYear: number;
      targetMonth: number;
      departmentId?: string;
    },
    @CurrentUser() user?: { id: string; permissions?: string[] },
  ) {
    const deptFilter = await this.getDepartmentFilter(user, body.departmentId);
    return this.workSchedulesService.copyFromMonth(
      body.sourceYear,
      body.sourceMonth,
      body.targetYear,
      body.targetMonth,
      deptFilter,
    );
  }

  /** يرجع null = كل الأقسام، string = قسم واحد، string[] = قائمة أقسام مسموح بها */
  private async getDepartmentFilter(
    user?: { id: string; permissions?: string[] },
    override?: string,
  ): Promise<string | string[] | null> {
    if (!user?.id) return null;
    const allowedIds = await this.usersService.getScheduleAllowedDepartmentIds(user.id, user.permissions);
    if (allowedIds === null) {
      return override ?? null;
    }
    if (allowedIds.length === 0) {
      return [];
    }
    if (override) {
      if (!allowedIds.includes(override)) {
        throw new ForbiddenException('غير مصرح بعرض هذا القسم');
      }
      return override;
    }
    return allowedIds;
  }
}
