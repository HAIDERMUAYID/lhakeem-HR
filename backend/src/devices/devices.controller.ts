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
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@Controller('devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get('stats')
  async getStats() {
    return this.devicesService.getStats();
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

  @Post()
  async create(
    @Body()
    dto: { name: string; code?: string; location?: string; isActive?: boolean },
  ) {
    return this.devicesService.create(dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    dto: Partial<{ name: string; code: string; location: string; isActive: boolean }>,
  ) {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.devicesService.delete(id);
  }
}

@Controller('employees/:employeeId/fingerprints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ADMIN, PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER, PERMISSIONS.EMPLOYEES_MANAGE)
export class EmployeeFingerprintsController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string) {
    return this.devicesService.getFingerprintsByEmployee(employeeId);
  }

  @Post()
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
  async remove(
    @Param('employeeId') employeeId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.devicesService.removeFingerprint(employeeId, recordId);
  }
}
