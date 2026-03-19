import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { UnitsService } from './units.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.DEPARTMENTS_MANAGE)
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get('departments/:departmentId/units')
  async listByDepartment(
    @Param('departmentId') departmentId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.unitsService.findByDepartment(departmentId, { activeOnly: activeOnly !== 'false' });
  }

  @Get('units/:id')
  async findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Post('units')
  async create(
    @Body()
    dto: {
      departmentId: string;
      name: string;
      code?: string | null;
      description?: string | null;
      managerUserId?: string | null;
      sortOrder?: number | null;
    },
  ) {
    return this.unitsService.create(dto);
  }

  @Patch('units/:id')
  async update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      code?: string | null;
      description?: string | null;
      managerUserId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.unitsService.update(id, dto);
  }

  @Delete('units/:id')
  async remove(@Param('id') id: string) {
    return this.unitsService.softDelete(id);
  }
}

