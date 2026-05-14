import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * PayMongo webhook endpoint.
   * Requires raw body — configured in main.ts via rawBody: true.
   */
  @Public()
  @Post('webhook/paymongo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayMongo payment webhook (internal)' })
  async paymongoWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('paymongo-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).send({ error: 'Raw body not available' });
      return;
    }

    try {
      await this.paymentsService.handleWebhook(rawBody, signature ?? '');
      res.status(200).send({ received: true });
    } catch (err) {
      this.logger.error('Webhook processing error', err);
      res.status(200).send({ received: true }); // Always 200 to PayMongo
    }
  }
}
