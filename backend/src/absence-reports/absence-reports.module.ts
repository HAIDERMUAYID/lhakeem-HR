import { Module } from '@nestjs/common';
import { AbsenceReportsService } from './absence-reports.service';
import { AbsenceReportsController } from './absence-reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AttendanceValidationModule } from '../attendance-validation/attendance-validation.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AttendanceValidationModule,
  ],
  controllers: [AbsenceReportsController],
  providers: [AbsenceReportsService],
  exports: [AbsenceReportsService],
})
export class AbsenceReportsModule {}
