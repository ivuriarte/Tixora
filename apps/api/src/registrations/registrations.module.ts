import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { AuditModule } from '../audit/audit.module';
import { FunnelModule } from '../funnel/funnel.module';
import { OptionalInclusionsModule } from '../optional-inclusions/optional-inclusions.module';
import { GuestHoldModule } from './guest-hold.module';

@Module({
  imports: [AuditModule, FunnelModule, OptionalInclusionsModule, GuestHoldModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
