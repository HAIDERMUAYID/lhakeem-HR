import { Module } from '@nestjs/common';
import { WorkSchedulesService } from './work-schedules.service';
import { WorkSchedulesController } from './work-schedules.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [WorkSchedulesService],
  controllers: [WorkSchedulesController],
  exports: [WorkSchedulesService],
})
export class WorkSchedulesModule {}
