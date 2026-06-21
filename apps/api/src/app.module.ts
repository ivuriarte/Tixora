import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { TicketTiersModule } from './ticket-tiers/ticket-tiers.module';
import { ReservationsModule } from './reservations/reservations.module';
import { OrdersModule } from './orders/orders.module';
import { TicketsModule } from './tickets/tickets.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { PaymentProofsModule } from './payment-proofs/payment-proofs.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { CronModule } from './cron/cron.module';
import { FunnelModule } from './funnel/funnel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        customProps: () => ({ service: 'axon-tickets-api' }),
      },
    }),

    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          name: 'default',
          ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
          limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
        },
        {
          // Hard ceiling: no single IP can trigger more than 10 OTP emails
          // per hour, regardless of how many different email addresses it uses.
          name: 'otp-hourly',
          ttl: 3_600_000,
          limit: parseInt(process.env.OTP_HOURLY_LIMIT ?? '10', 10),
        },
      ],
    }),

    PrismaModule,
    RedisModule,
    HealthModule,
    EmailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    EventsModule,
    TicketTiersModule,
    ReservationsModule,
    OrdersModule,
    TicketsModule,
    AdminModule,
    UploadModule,
    RegistrationsModule,
    PaymentProofsModule,
    FunnelModule,
    SchedulerModule,
    CronModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
