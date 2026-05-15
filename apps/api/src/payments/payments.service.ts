import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PayMongoProvider } from './providers/paymongo.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly payMongoProvider: PayMongoProvider,
  ) {}

  async createPaymentIntent(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, status: 'pending' },
      include: { event: { select: { title: true } } },
    });
    if (!order) throw new NotFoundException('Pending order not found');

    const result = await this.payMongoProvider.createPaymentIntent(
      orderId,
      Number(order.total),
      order.currency,
      `Axon Tickets: ${order.event.title}`,
      { orderId, userId },
    );

    // Store payment link ID on order
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentLinkId: result.paymentLinkId },
    });

    return {
      orderId: result.orderId,
      paymentUrl: result.paymentUrl,
      amount: result.amount,
      currency: result.currency,
    };
  }

  async handleWebhook(rawBody: Buffer, signatureHeader: string): Promise<void> {
    const valid = this.payMongoProvider.verifyWebhookSignature(rawBody, signatureHeader);
    if (!valid) {
      this.logger.warn('Invalid PayMongo webhook signature');
      return;
    }

    const event = this.payMongoProvider.parseWebhookEvent(rawBody);
    this.logger.log({ msg: 'PayMongo webhook received', type: event.type, orderId: event.orderId });

    if (event.type === 'payment.paid') {
      await this.ordersService.confirmPayment(event.orderId, event.paymentRef);
    } else if (event.type === 'payment.failed') {
      await this.ordersService.markFailed(event.orderId);
    }
  }
}
