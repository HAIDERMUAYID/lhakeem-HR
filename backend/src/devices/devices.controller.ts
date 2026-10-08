import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CurrentUser } from '../auth/decorators/user.decorator';

@Controller('devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.DEVICES_VIEW, PERMISSIONS.ATTENDANCE_VIEW)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get('stats')
  async getStats() {
    return this.devicesService.getStats();
  }

  @Get('adms-inbox')
  async listAdmsInbox() {
    return this.devicesService.listAdmsInbox();
  }

  @Get('department-options')
  async departmentOptions() {
    return this.devicesService.listDepartmentOptions();
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.devicesService.findAll({
      search,
      activeOnly: activeOnly !== 'false',
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Get(':id/attendance-imports/:batchId')
  async getAttendanceImportBatch(@Param('id') id: string, @Param('batchId') batchId: string) {
    return this.devicesService.getAttendanceImportBatch(id, batchId);
  }

  @Get(':id/attendance-imports')
  async getAttendanceImports(@Param('id') id: string) {
    return this.devicesService.listAttendanceImports(id);
  }

  @Get(':id/attendance-daily-records')
  async getAttendanceDailyRecords(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.devicesService.listAttendanceDailyRecords(id, fromDate, toDate);
  }

  @Get(':id/unmatched-pins')
  async listUnmatchedPins(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.devicesService.listUnmatchedPins(id, fromDate, toDate);
  }

  @Get(':id/live-day')
  async getLiveDay(
    @Param('id') id: string,
    @Query('date') date?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.devicesService.getLiveDay(id, fromDate || date, toDate || date);
  }

  @Post(':id/department')
  @RequirePermissions(PERMISSIONS.DEVICES_BIND, PERMISSIONS.DEVICES_MANAGE)
  async setDeviceDepartment(@Param('id') id: string, @Body() body: { departmentId?: string }) {
    if (!body?.departmentId?.trim()) throw new BadRequestException('القسم مطلوب');
    return this.devicesService.setDeviceDepartment(id, body.departmentId);
  }

  @Post(':id/assign-pin')
  @RequirePermissions(PERMISSIONS.PINS_ASSIGN)
  async assignPin(
    @Param('id') id: string,
    @Body() body: { fingerprintId?: string; employeeId?: string; moveToDepartment?: boolean },
  ) {
    if (!body?.fingerprintId?.trim() || !body?.employeeId?.trim()) {
      throw new BadRequestException('المعرف والموظف مطلوبان');
    }
    return this.devicesService.assignPin(
      id,
      body.fingerprintId,
      body.employeeId,
      Boolean(body.moveToDepartment),
    );
  }

  @Post(':id/bind-serial')
  @RequirePermissions(PERMISSIONS.DEVICES_BIND, PERMISSIONS.DEVICES_MANAGE)
  async bindSerial(@Param('id') id: string, @Body() body: { serial?: string }) {
    if (!body?.serial?.trim()) throw new BadRequestException('الرقم التسلسلي مطلوب');
    return this.devicesService.bindSerial(id, body.serial);
  }

  @Get(':id/live-attendance')
  async getLiveAttendance(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.devicesService.getLiveAttendance(id, fromDate, toDate);
  }

  @Post(':id/sync-adms')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.DEVICES_MANAGE)
  async syncAdmsAttendance(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.devicesService.syncAdmsAttendance(id, user?.id, fromDate, toDate);
  }

  @Get(':id/attendance-sheet')
  async getAttendanceSheet(
    @Param('id') id: string,
    @Query('batchId') batchId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.devicesService.getAttendanceSheet(id, { batchId, fromDate, toDate });
  }

  @Post(':id/attendance-imports')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @RequirePermissions(PERMISSIONS.ATTENDANCE_EXPORT, PERMISSIONS.DEVICES_MANAGE)
  async uploadAttendanceImport(
    @Param('id') id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string },
    @CurrentUser() user?: { id: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('ملف Excel مطلوب');
    }
    return this.devicesService.importAttendanceFile({
      deviceId: id,
      fileName: file.originalname || 'attendance.xlsx',
      fileBuffer: file.buffer,
      uploadedById: user?.id,
    });
  }

  @Delete(':id/attendance-imports/:batchId')
  @RequirePermissions(PERMISSIONS.DEVICES_MANAGE)
  async deleteAttendanceImport(
    @Param('id') id: string,
    @Param('batchId') batchId: string,
  ) {
    return this.devicesService.deleteAttendanceImport(id, batchId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEVICES_MANAGE)
  async create(
    @Body()
    dto: { name: string; code?: string; location?: string; isActive?: boolean },
  ) {
    return this.devicesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.DEVICES_MANAGE)
  async update(
    @Param('id') id: string,
    @Body()
    dto: Partial<{ name: string; code: string; location: string; isActive: boolean }>,
  ) {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DEVICES_MANAGE)
  async delete(@Param('id') id: string) {
    return this.devicesService.delete(id);
  }
}

@Controller('employees/:employeeId/fingerprints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.PINS_ASSIGN, PERMISSIONS.DEVICES_VIEW, PERMISSIONS.EMPLOYEES_VIEW, PERMISSIONS.EMPLOYEES_MANAGE)
export class EmployeeFingerprintsController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string) {
    return this.devicesService.getFingerprintsByEmployee(employeeId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PINS_ASSIGN, PERMISSIONS.EMPLOYEES_MANAGE)
  async add(
    @Param('employeeId') employeeId: string,
    @Body() body: { deviceId: string; fingerprintId: string },
  ) {
    return this.devicesService.addFingerprint(
      employeeId,
      body.deviceId,
      body.fingerprintId,
    );
  }

  @Patch(':recordId')
  @RequirePermissions(PERMISSIONS.PINS_ASSIGN, PERMISSIONS.EMPLOYEES_MANAGE)
  async updateFingerprintId(
    @Param('employeeId') employeeId: string,
    @Param('recordId') recordId: string,
    @Body() body: { fingerprintId: string },
  ) {
    return this.devicesService.updateFingerprintId(
      employeeId,
      recordId,
      body.fingerprintId,
    );
  }

  @Delete(':recordId')
  @RequirePermissions(PERMISSIONS.PINS_ASSIGN, PERMISSIONS.EMPLOYEES_MANAGE)
  async remove(
    @Param('employeeId') employeeId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.devicesService.removeFingerprint(employeeId, recordId);
  }
}
