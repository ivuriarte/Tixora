import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PayMongoProvider } from './providers/paymongo.provider';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayMongoProvider],
  exports: [PaymentsService, PayMongoProvider],
})
export class PaymentsModule {}
