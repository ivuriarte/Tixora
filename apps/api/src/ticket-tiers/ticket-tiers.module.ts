import { Module } from '@nestjs/common';
import { TicketTiersService } from './ticket-tiers.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [TicketTiersService],
  exports: [TicketTiersService],
})
export class TicketTiersModule {}
