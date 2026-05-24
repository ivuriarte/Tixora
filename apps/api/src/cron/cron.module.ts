import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { ReservationsModule } from '../reservations/reservations.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [ReservationsModule, SchedulerModule],
  controllers: [CronController],
})
export class CronModule {}
