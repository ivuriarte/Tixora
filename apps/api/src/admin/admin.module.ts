import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { EventsModule } from '../events/events.module';
import { TicketTiersModule } from '../ticket-tiers/ticket-tiers.module';
import { OrdersModule } from '../orders/orders.module';
import { RegistrationsModule } from '../registrations/registrations.module';

@Module({
  imports: [EventsModule, TicketTiersModule, OrdersModule, RegistrationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
