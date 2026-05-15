import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/order.dto';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an order from a reservation' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
      req.ip ??
      '';
    const userAgent = req.headers['user-agent'] ?? '';
    return this.ordersService.create(dto, user.sub, ip, userAgent);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user orders' })
  myOrders(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findByUser(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findOne(id, user.sub);
  }

  @Post(':id/payment-intent')
  @ApiOperation({ summary: 'Create payment link for an order' })
  createPaymentIntent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.createPaymentIntent(id, user.sub);
  }
}
