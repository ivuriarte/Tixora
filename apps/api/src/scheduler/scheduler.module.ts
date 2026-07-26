import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, AuditModule, UploadModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
