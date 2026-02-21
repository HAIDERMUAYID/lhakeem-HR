import { Module } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';
import { LeaveTypesController } from './leave-types.controller';

@Module({
  providers: [LeaveTypesService],
  controllers: [LeaveTypesController],
  exports: [LeaveTypesService],
})
export class LeaveTypesModule {}
