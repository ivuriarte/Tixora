import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { EventsModule } from '../events/events.module';
import { TicketTiersModule } from '../ticket-tiers/ticket-tiers.module';
import { OrdersModule } from '../orders/orders.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ExecutiveAnalyticsService } from './executive-analytics.service';

@Module({
  imports: [EventsModule, TicketTiersModule, OrdersModule, RegistrationsModule, AuditModule, OrganizationsModule],
  controllers: [AdminController],
  providers: [AdminService, ExecutiveAnalyticsService],
})
export class AdminModule {}
