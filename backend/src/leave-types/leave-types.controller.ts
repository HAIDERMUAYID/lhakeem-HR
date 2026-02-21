import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('leave-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveTypesController {
  constructor(private leaveTypesService: LeaveTypesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.LEAVES_VIEW, PERMISSIONS.LEAVE_TYPES_MANAGE)
  async findAll() {
    return this.leaveTypesService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.LEAVES_VIEW, PERMISSIONS.LEAVE_TYPES_MANAGE)
  async findOne(@Param('id') id: string) {
    return this.leaveTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.LEAVE_TYPES_MANAGE)
  async create(@Body() dto: { name: string; nameAr: string; deductFromBalance?: boolean; requiresApproval?: boolean; annualAllowance?: number; monthlyAccrual?: number }) {
    return this.leaveTypesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.LEAVE_TYPES_MANAGE)
  async update(@Param('id') id: string, @Body() dto: Partial<{ name: string; nameAr: string; deductFromBalance: boolean; requiresApproval: boolean; annualAllowance: number | null; monthlyAccrual: number | null; isActive: boolean }>) {
    return this.leaveTypesService.update(id, dto);
  }
}
