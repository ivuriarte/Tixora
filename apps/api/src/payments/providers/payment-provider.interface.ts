export interface PaymentIntentResult {
  orderId: string;
  paymentUrl: string;
  paymentLinkId: string;
  amount: number;
  currency: string;
}

export interface IPaymentProvider {
  createPaymentIntent(
    orderId: string,
    amount: number,
    currency: string,
    description: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntentResult>;

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;

  parseWebhookEvent(rawBody: Buffer): WebhookEvent;
}

export interface WebhookEvent {
  type: 'payment.paid' | 'payment.failed' | 'unknown';
  paymentLinkId: string;
  paymentRef: string;
  orderId: string;
}
