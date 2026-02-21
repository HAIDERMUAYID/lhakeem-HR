import { Module } from '@nestjs/common';
import { AttendanceValidationService } from './attendance-validation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [PrismaModule, HolidaysModule],
  providers: [AttendanceValidationService],
  exports: [AttendanceValidationService],
})
export class AttendanceValidationModule {}
