import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import {
  AdminOptionalInclusionsController,
  PublicOptionalInclusionsController,
} from './optional-inclusions.controller';
import { OptionalInclusionsService } from './optional-inclusions.service';

@Module({
  imports: [AuditModule],
  controllers: [PublicOptionalInclusionsController, AdminOptionalInclusionsController],
  providers: [OptionalInclusionsService],
  exports: [OptionalInclusionsService],
})
export class OptionalInclusionsModule {}
