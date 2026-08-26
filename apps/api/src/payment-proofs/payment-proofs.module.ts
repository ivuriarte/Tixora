import { Module } from '@nestjs/common';
import { PaymentProofsService } from './payment-proofs.service';
import { PaymentProofsController } from './payment-proofs.controller';
import { UploadModule } from '../upload/upload.module';
import { AuditModule } from '../audit/audit.module';
import { FunnelModule } from '../funnel/funnel.module';
import { OptionalInclusionsModule } from '../optional-inclusions/optional-inclusions.module';

@Module({
  imports: [UploadModule, AuditModule, FunnelModule, OptionalInclusionsModule],
  controllers: [PaymentProofsController],
  providers: [PaymentProofsService],
  exports: [PaymentProofsService],
})
export class PaymentProofsModule {}
