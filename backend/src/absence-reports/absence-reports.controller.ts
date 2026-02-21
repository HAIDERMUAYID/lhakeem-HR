import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AbsenceReportsService } from './absence-reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('absence-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AbsenceReportsController {
  constructor(private service: AbsenceReportsService) {}

  @Get('report')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async getOrCreateReport(
    @Query('date') date: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.getOrCreateReport(user.id, new Date(date));
  }

  @Get('validate')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async validateEmployee(
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
  ) {
    return this.service.validateEmployeeForDate(
      employeeId,
      new Date(date),
    );
  }

  @Post(':reportId/absences')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async addAbsence(
    @Param('reportId') reportId: string,
    @Body() body: { employeeId: string },
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.addAbsenceToReport(reportId, user.id, body);
  }

  @Delete(':reportId/absences/:absenceId')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async removeAbsence(
    @Param('reportId') reportId: string,
    @Param('absenceId') absenceId: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.removeAbsenceFromReport(
      reportId,
      absenceId,
      user.id,
    );
  }

  @Post(':reportId/submit')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async submitReport(
    @Param('reportId') reportId: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.submitReport(reportId, user.id);
  }

  @Get('by-date')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async listReportsForDate(
    @Query('date') date: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    const isManager = !!(user.permissions?.includes(PERMISSIONS.ADMIN) || user.permissions?.includes(PERMISSIONS.FINGERPRINT_MANAGER));
    return this.service.listReportsForDate(
      new Date(date),
      user.id,
      isManager,
    );
  }

  @Get('consolidated')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async getConsolidated(@Query('date') date: string) {
    return this.service.getConsolidatedForDate(new Date(date));
  }

  @Get('consolidation/duplicates')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_MANAGER)
  async getDuplicates(
    @Query('date') date: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.getDuplicatesForDate(new Date(date));
  }

  @Post('consolidation/resolve-duplicate')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_MANAGER)
  async resolveDuplicate(
    @Body() body: { date: string; employeeId: string },
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.resolveDuplicate(
      new Date(body.date),
      body.employeeId,
      user.id,
    );
  }

  @Post('consolidation/approve')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_MANAGER)
  async approveConsolidation(
    @Body() body: { date: string },
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.approveConsolidation(
      new Date(body.date),
      user.id,
    );
  }

  @Post('consolidation/unapprove')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_MANAGER)
  async unapproveConsolidation(
    @Body() body: { date: string },
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.unapproveConsolidation(new Date(body.date));
  }

  @Get('date-locked')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async isDateLocked(@Query('date') date: string) {
    return this.service.isDateLocked(new Date(date));
  }

  @Get('employees')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER)
  async getEmployeesForOfficer(
    @Query('search') search: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.getEmployeesForOfficer(
      user.id,
      search,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('archive')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async getArchive(
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    return this.service.getArchiveDates(
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  @Get('official-report')
  @RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
  async getOfficialReport(
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
    @CurrentUser() user: { id: string; permissions?: string[] },
  ) {
    const from = fromStr ? new Date(fromStr) : new Date();
    const to = toStr ? new Date(toStr) : new Date();
    if (from > to) {
      return this.service.getOfficialReport(to, from);
    }
    return this.service.getOfficialReport(from, to);
  }
}
