import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('absences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AbsencesController {
  constructor(private absencesService: AbsencesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('employeeId') employeeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    return this.absencesService.findAll({
      skip,
      take: parseInt(limit, 10) || 20,
      employeeId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.ABSENCES_CANCEL)
  async cancel(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.absencesService.cancel(id, user.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.ABSENCES_CREATE)
  async create(
    @Body() dto: { employeeId: string; date: string; reason?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.absencesService.create(
      { ...dto, date: new Date(dto.date) },
      user.id
    );
  }
}
