import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { DepartmentsModule } from './departments/departments.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { AbsencesModule } from './absences/absences.module';
import { HolidaysModule } from './holidays/holidays.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';
import { AuditModule } from './audit/audit.module';
import { BalanceModule } from './balance/balance.module';
import { AttendanceValidationModule } from './attendance-validation/attendance-validation.module';
import { AbsenceReportsModule } from './absence-reports/absence-reports.module';
import { DevicesModule } from './devices/devices.module';
import { FingerprintCalendarModule } from './fingerprint-calendar/fingerprint-calendar.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    DepartmentsModule,
    LeaveTypesModule,
    LeaveRequestsModule,
    AbsencesModule,
    HolidaysModule,
    WorkSchedulesModule,
    BalanceModule,
    AttendanceValidationModule,
    AbsenceReportsModule,
    DevicesModule,
    FingerprintCalendarModule,
  ],
  providers: [PermissionsGuard],
})
export class AppModule {}
