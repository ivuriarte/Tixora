import { Global, Module } from '@nestjs/common';
import { EventAccessService } from './services/event-access.service';

@Global()
@Module({
  providers: [EventAccessService],
  exports: [EventAccessService],
})
export class CommonModule {}
