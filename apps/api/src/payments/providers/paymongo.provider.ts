import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  IPaymentProvider,
  PaymentIntentResult,
  WebhookEvent,
} from './payment-provider.interface';
import { pesoToCentavos } from '@axon-tickets/utils';

interface PayMongoPaymentLink {
  data: {
    id: string;
    attributes: {
      checkout_url: string;
      reference_number: string;
    };
  };
}

interface PayMongoWebhookBody {
  data: {
    attributes: {
      type: string;
      data: {
        id: string;
        attributes: {
          status: string;
          reference_number: string;
          metadata: Record<string, string>;
          payments: Array<{ id: string }>;
        };
      };
    };
  };
}

@Injectable()
export class PayMongoProvider implements IPaymentProvider {
  private readonly logger = new Logger(PayMongoProvider.name);
  private readonly baseUrl = 'https://api.paymongo.com/v1';

  constructor(private readonly config: ConfigService) {}

  async createPaymentIntent(
    orderId: string,
    amount: number,
    currency: string,
    description: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntentResult> {
    const secretKey = this.config.get<string>('paymongo.secretKey');
    const webUrl = this.config.get<string>('webUrl');
    const amountInCentavos = pesoToCentavos(amount);

    const payload = {
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: currency.toUpperCase(),
          description,
          metadata: { ...metadata, orderId },
          redirect: {
            success: `${webUrl}/orders/${orderId}/success`,
            failed: `${webUrl}/orders/${orderId}/failed`,
          },
        },
      },
    };

    const res = await fetch(`${this.baseUrl}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error({ msg: 'PayMongo link creation failed', orderId, err });
      throw new Error('Payment provider error. Please try again.');
    }

    const data = (await res.json()) as PayMongoPaymentLink;

    return {
      orderId,
      paymentUrl: data.data.attributes.checkout_url,
      paymentLinkId: data.data.id,
      amount,
      currency,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    const webhookSecret = this.config.get<string>('paymongo.webhookSecret') ?? '';

    // PayMongo signature format: t=TIMESTAMP,te=SIG,li=SIG
    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [k, v] = part.split('=');
        return [k, v];
      }),
    );

    const timestamp = parts['t'];
    const signature = parts['te'] ?? parts['li'];
    if (!timestamp || !signature) return false;

    const hmac = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const hmacBuf = Buffer.from(hmac, 'hex');
    if (sigBuf.length !== hmacBuf.length) return false;

    return timingSafeEqual(sigBuf, hmacBuf);
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    const body = JSON.parse(rawBody.toString('utf8')) as PayMongoWebhookBody;
    const attrs = body.data.attributes;
    const linkData = attrs.data;
    const type = attrs.type;
    const orderId = linkData.attributes.metadata?.['orderId'] ?? '';
    const paymentLinkId = linkData.id;
    const paymentRef = linkData.attributes.reference_number;

    if (type === 'link.payment.paid') {
      return { type: 'payment.paid', paymentLinkId, paymentRef, orderId };
    }
    if (type === 'link.payment.failed') {
      return { type: 'payment.failed', paymentLinkId, paymentRef, orderId };
    }
    return { type: 'unknown', paymentLinkId, paymentRef, orderId };
  }
}
