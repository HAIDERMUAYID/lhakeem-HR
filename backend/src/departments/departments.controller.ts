import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.DEPARTMENTS_MANAGE)
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get('stats')
  async getStats() {
    return this.departmentsService.getStats();
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.departmentsService.findAll({
      search,
      activeOnly: activeOnly !== 'false',
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: { name: string; code?: string; description?: string; managerUserId?: string | null },
  ) {
    return this.departmentsService.create(dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; code?: string; description?: string; isActive?: boolean; managerUserId?: string | null },
  ) {
    return this.departmentsService.update(id, dto);
  }
}
