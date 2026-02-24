import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { WorkType } from '@prisma/client';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get('data-completion-stats')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.EMPLOYEES_MANAGE, PERMISSIONS.EMPLOYEES_VIEW)
  async getDataCompletionStats(
    @Query('departmentId') departmentId?: string,
    @Query('baseline') baseline?: string,
    @CurrentUser() user?: { departmentId?: string | null; permissions?: string[] },
  ) {
    const hasFullAccess = user?.permissions?.includes('ADMIN') || user?.permissions?.includes('EMPLOYEES_MANAGE') || user?.permissions?.includes('EMPLOYEES_VIEW');
    const deptFilter = departmentId ?? (!hasFullAccess && user?.departmentId ? user.departmentId : undefined);
    return this.employeesService.getDataCompletionStats(deptFilter, baseline);
  }

  @Get('stats')
  async getStats(
    @Query('departmentId') departmentId?: string,
    @CurrentUser() user?: { departmentId?: string | null; permissions?: string[] },
  ) {
    const hasFullAccess = user?.permissions?.includes('ADMIN') || user?.permissions?.includes('EMPLOYEES_MANAGE');
    const deptFilter = departmentId ?? (!hasFullAccess && user?.departmentId ? user.departmentId : undefined);
    return this.employeesService.getStats(deptFilter);
  }

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('departmentId') departmentId?: string,
    @Query('workType') workType?: WorkType,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('incompleteOnly') incompleteOnly?: string,
    @Query('updatedAfter') updatedAfter?: string,
    @Query('updatedBefore') updatedBefore?: string,
    @Query('sortBy') sortBy?: 'fullName' | 'jobTitle' | 'leaveBalance' | 'createdAt' | 'updatedAt' | 'department',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @CurrentUser() user?: { departmentId?: string | null; permissions?: string[] },
  ) {
    // رفع الحد الأعلى لتسهيل التصدير والمتابعة (مع بقاء الافتراضي 20 للواجهة)
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 5000);
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;
    const hasFullAccess =
      user?.permissions?.includes('ADMIN') ||
      user?.permissions?.includes('EMPLOYEES_MANAGE') ||
      user?.permissions?.includes('EMPLOYEES_VIEW') ||
      user?.permissions?.includes('LEAVES_APPROVE') ||
      user?.permissions?.includes('LEAVES_CREATE') ||
      user?.permissions?.includes('SCHEDULES_MANAGE');
    const deptFilter = departmentId ?? (!hasFullAccess && user?.departmentId ? user.departmentId : undefined);
    return this.employeesService.findAll({
      skip,
      take: limitNum,
      departmentId: deptFilter,
      workType,
      search,
      includeInactive: includeInactive === 'true' || includeInactive === '1',
      incompleteOnly: incompleteOnly === 'true' || incompleteOnly === '1',
      updatedAfter,
      updatedBefore,
      sortBy: sortBy as 'fullName' | 'jobTitle' | 'leaveBalance' | 'createdAt' | 'updatedAt' | 'department',
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
    });
  }

  @Get('import-batches')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.EMPLOYEES_MANAGE, PERMISSIONS.EMPLOYEES_VIEW)
  async getImportBatches() {
    return this.employeesService.getImportBatches();
  }

  @Delete('import-batches/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.EMPLOYEES_MANAGE)
  async deleteImportBatch(@Param('id') id: string) {
    return this.employeesService.deleteImportBatch(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Post('import')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.EMPLOYEES_MANAGE)
  async import(@Body() body: { rows: { fullName: string; jobTitle?: string; departmentCode: string; workType?: string; leaveBalance?: number }[]; fileName?: string }) {
    return this.employeesService.importFromCsv(body.rows ?? [], body.fileName);
  }

  @Post()
  async create(@Body() dto: {
    fullName: string;
    jobTitle: string;
    departmentId: string;
    managerId?: string;
    managerUserId?: string | null;
    workType?: 'MORNING' | 'SHIFTS';
    leaveBalance?: number;
    balanceStartDate?: string | null;
    isActive?: boolean;
  }) {
    return this.employeesService.create({
      ...dto,
      workType: dto.workType as WorkType | undefined,
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<{
    fullName: string;
    jobTitle: string;
    departmentId: string;
    managerId: string | null;
    managerUserId: string | null;
    workType: 'MORNING' | 'SHIFTS';
    leaveBalance: number;
    balanceStartDate: string | null;
    isActive: boolean;
  }>) {
    return this.employeesService.update(id, {
      ...dto,
      workType: dto.workType as WorkType | undefined,
    });
  }
}
