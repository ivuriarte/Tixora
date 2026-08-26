import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '@axon-tickets/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { EventAccessService } from '../common/services/event-access.service';
import {
  AdjustInclusionStockDto,
  CreateEventInclusionDto,
  CreateInclusionQuoteDto,
  FulfillInclusionDto,
  InclusionVariantInputDto,
  ReverseFulfillmentDto,
  SetOptionalInclusionsEnabledDto,
  UpdateEventInclusionDto,
  UpdateInclusionVariantDto,
} from './dto/optional-inclusion.dto';
import { OptionalInclusionsService } from './optional-inclusions.service';

@ApiTags('optional-inclusions')
@Controller('events/:eventId')
export class PublicOptionalInclusionsController {
  constructor(private readonly service: OptionalInclusionsService) {}

  @Get('optional-inclusions')
  @ApiOperation({ summary: 'List active optional add-ons for a public event' })
  list(@Param('eventId') eventId: string) {
    return this.service.listPublic(eventId);
  }

  @Post('inclusion-quote')
  @ApiOperation({ summary: 'Create an authoritative short-lived admission and add-on quote' })
  quote(@Param('eventId') eventId: string, @Body() dto: CreateInclusionQuoteDto) {
    return this.service.createQuote(eventId, dto);
  }
}

@ApiTags('admin-optional-inclusions')
@Controller('admin/events/:eventId/optional-inclusions')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminOptionalInclusionsController {
  constructor(
    private readonly service: OptionalInclusionsService,
    private readonly access: EventAccessService,
  ) {}

  @Get()
  list(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    return this.withCapability(eventId, user, 'inclusions.read', () => this.service.listOrganizer(eventId));
  }

  @Patch('settings')
  setEnabled(
    @Param('eventId') eventId: string,
    @Body() dto: SetOptionalInclusionsEnabledDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.manage', () => this.service.setEventEnabled(eventId, dto.enabled, user.sub));
  }

  @Post()
  create(@Param('eventId') eventId: string, @Body() dto: CreateEventInclusionDto, @CurrentUser() user: JwtPayload) {
    return this.withCapability(eventId, user, 'inclusions.manage', () => this.service.create(eventId, dto, user.sub));
  }

  @Patch(':inclusionId')
  update(
    @Param('eventId') eventId: string,
    @Param('inclusionId') inclusionId: string,
    @Body() dto: UpdateEventInclusionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.manage', () => this.service.update(eventId, inclusionId, dto, user.sub));
  }

  @Post(':inclusionId/variants')
  createVariant(
    @Param('eventId') eventId: string,
    @Param('inclusionId') inclusionId: string,
    @Body() dto: InclusionVariantInputDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.manage', () => this.service.createVariant(eventId, inclusionId, dto, user.sub));
  }

  @Patch(':inclusionId/variants/:variantId')
  updateVariant(
    @Param('eventId') eventId: string,
    @Param('inclusionId') inclusionId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateInclusionVariantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.manage', () => this.service.updateVariant(eventId, inclusionId, variantId, dto, user.sub));
  }

  @Post(':inclusionId/variants/:variantId/stock-adjustments')
  adjustStock(
    @Param('eventId') eventId: string,
    @Param('inclusionId') inclusionId: string,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustInclusionStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.inventory.manage', () => this.service.adjustStock(eventId, inclusionId, variantId, dto, user.sub));
  }

  @Get('fulfillments')
  listFulfillments(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('variantId') variantId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
  ) {
    return this.withCapability(eventId, user, 'inclusions.fulfill', () => this.service.listFulfillments(eventId, status, variantId, page, limit));
  }

  @Post('fulfillments/:lineItemId')
  fulfill(
    @Param('eventId') eventId: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: FulfillInclusionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.fulfill', () => this.service.fulfill(eventId, lineItemId, dto, user.sub));
  }

  @Post('fulfillments/:fulfillmentId/reverse')
  reverse(
    @Param('eventId') eventId: string,
    @Param('fulfillmentId') fulfillmentId: string,
    @Body() dto: ReverseFulfillmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.withCapability(eventId, user, 'inclusions.fulfill', () => this.service.reverseFulfillment(eventId, fulfillmentId, dto, user.sub));
  }

  @Get('report')
  report(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    return this.withCapability(eventId, user, 'inclusions.finance.read', () => this.service.report(eventId));
  }

  private async withCapability<T>(
    eventId: string,
    user: JwtPayload,
    capability: 'inclusions.read' | 'inclusions.manage' | 'inclusions.inventory.manage' | 'inclusions.fulfill' | 'inclusions.finance.read',
    action: () => Promise<T>,
  ) {
    await this.access.assertEventCapability(eventId, user, capability);
    return action();
  }
}
