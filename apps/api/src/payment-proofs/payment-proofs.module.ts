import { Module } from '@nestjs/common';
import { PaymentProofsService } from './payment-proofs.service';
import { PaymentProofsController } from './payment-proofs.controller';
import { UploadModule } from '../upload/upload.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [UploadModule, AuditModule],
  controllers: [PaymentProofsController],
  providers: [PaymentProofsService],
  exports: [PaymentProofsService],
})
export class PaymentProofsModule {}
