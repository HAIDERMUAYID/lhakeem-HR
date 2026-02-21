import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('holidays')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

  @Get('range')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.HOLIDAYS_VIEW, PERMISSIONS.LEAVES_VIEW)
  async findInRange(@Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) return [];
    return this.holidaysService.findInRange(new Date(from), new Date(to + 'T23:59:59'));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.HOLIDAYS_VIEW, PERMISSIONS.LEAVES_VIEW)
  async findAll(@Query('year') year?: string) {
    return this.holidaysService.findAll(year ? parseInt(year, 10) : undefined);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.HOLIDAYS_MANAGE)
  async create(@Body() dto: { name: string; nameAr: string; date: string; appliesTo?: string }) {
    return this.holidaysService.create({
      ...dto,
      date: new Date(dto.date),
      appliesTo: dto.appliesTo as 'ALL' | 'MORNING_ONLY' | 'CUSTOM' | undefined,
    });
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.HOLIDAYS_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; nameAr?: string; date?: string; appliesTo?: string },
  ) {
    return this.holidaysService.update(id, {
      ...dto,
      date: dto.date ? new Date(dto.date) : undefined,
      appliesTo: dto.appliesTo as 'ALL' | 'MORNING_ONLY' | 'CUSTOM' | undefined,
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.HOLIDAYS_MANAGE)
  async delete(@Param('id') id: string) {
    return this.holidaysService.delete(id);
  }
}
