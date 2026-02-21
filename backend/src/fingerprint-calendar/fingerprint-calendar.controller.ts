import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { FingerprintCalendarService } from './fingerprint-calendar.service';

@Controller('fingerprint-calendar')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
export class FingerprintCalendarController {
  constructor(private service: FingerprintCalendarService) {}

  @Get('month')
  async getMonth(
    @Query('deviceId') deviceId: string,
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('workType') workType?: string,
    @Query('search') search?: string,
  ) {
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = Math.min(12, Math.max(1, parseInt(monthStr, 10) || new Date().getMonth() + 1));
    if (!deviceId) {
      return { year, month, deviceId: null, days: [] };
    }
    return this.service.getMonthCalendar({
      deviceId,
      year,
      month,
      departmentId: departmentId || undefined,
      employeeId: employeeId || undefined,
      workType: workType || undefined,
      search: search || undefined,
    });
  }

  @Get('day')
  async getDay(
    @Query('deviceId') deviceId: string,
    @Query('date') date: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('time') time?: string,
    @Query('search') search?: string,
  ) {
    if (!deviceId || !date) return null;
    return this.service.getDayDetail({
      deviceId,
      date,
      departmentId: departmentId || undefined,
      employeeId: employeeId || undefined,
      time: time || undefined,
      search: search || undefined,
    });
  }
}
