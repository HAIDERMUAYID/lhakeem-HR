import { Module } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { HolidaysModule } from '../holidays/holidays.module';
import { WorkSchedulesModule } from '../work-schedules/work-schedules.module';

@Module({
  imports: [HolidaysModule, WorkSchedulesModule],
  providers: [LeaveRequestsService],
  controllers: [LeaveRequestsController],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
