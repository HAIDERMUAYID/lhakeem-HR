import { Module } from '@nestjs/common';
import { FingerprintCalendarService } from './fingerprint-calendar.service';
import { FingerprintCalendarController } from './fingerprint-calendar.controller';

@Module({
  providers: [FingerprintCalendarService],
  controllers: [FingerprintCalendarController],
  exports: [FingerprintCalendarService],
})
export class FingerprintCalendarModule {}
