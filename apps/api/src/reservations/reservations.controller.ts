import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/reservation.dto';

@ApiTags('reservations')
@Controller('reservations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a ticket reservation (holds inventory for 15 min)' })
  create(@Body() dto: CreateReservationDto, @CurrentUser() user: JwtPayload) {
    return this.reservationsService.create(dto, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reservation details' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reservationsService.findOne(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel reservation and release inventory' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reservationsService.cancel(id, user.sub);
  }
}
