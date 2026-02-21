import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController, EmployeeFingerprintsController } from './devices.controller';

@Module({
  providers: [DevicesService],
  controllers: [DevicesController, EmployeeFingerprintsController],
  exports: [DevicesService],
})
export class DevicesModule {}
