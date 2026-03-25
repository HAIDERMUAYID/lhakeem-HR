import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController, EmployeeFingerprintsController } from './devices.controller';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [HolidaysModule],
  providers: [DevicesService],
  controllers: [DevicesController, EmployeeFingerprintsController],
  exports: [DevicesService],
})
export class DevicesModule {}
