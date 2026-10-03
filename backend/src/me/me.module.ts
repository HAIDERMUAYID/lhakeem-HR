import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [DevicesModule, HolidaysModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
