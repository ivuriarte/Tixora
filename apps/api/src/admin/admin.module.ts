import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { EventsModule } from '../events/events.module';
import { TicketTiersModule } from '../ticket-tiers/ticket-tiers.module';
import { OrdersModule } from '../orders/orders.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [EventsModule, TicketTiersModule, OrdersModule, RegistrationsModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
