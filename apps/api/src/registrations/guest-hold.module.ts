import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OptionalInclusionsModule } from '../optional-inclusions/optional-inclusions.module';
import { GuestHoldService } from './guest-hold.service';
import { RegistrationHoldService } from './registration-hold.service';

/**
 * Guest checkout hold policy (deadlines, caps, signed resume token) and the shared
 * "release an unpaid hold" helper. Imported by the registrations and scheduler
 * modules so every release path and limit lives in one place.
 */
@Module({
  imports: [AuditModule, OptionalInclusionsModule],
  providers: [GuestHoldService, RegistrationHoldService],
  exports: [GuestHoldService, RegistrationHoldService],
})
export class GuestHoldModule {}
