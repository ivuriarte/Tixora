import { Controller } from '@nestjs/common';
import { PaymentProofsService } from './payment-proofs.service';

@Controller('payment-proofs')
export class PaymentProofsController {
  constructor(private readonly paymentProofsService: PaymentProofsService) {}

  // Phase 3: POST /payment-proofs (upload), PATCH /payment-proofs/:id/approve, PATCH /payment-proofs/:id/reject
}
