import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OptionalInclusionsModule } from '../optional-inclusions/optional-inclusions.module';

@Module({
  imports: [PrismaModule, AuditModule, OptionalInclusionsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
