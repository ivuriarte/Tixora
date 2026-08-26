import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OptionalInclusionsModule } from '../optional-inclusions/optional-inclusions.module';

@Module({
  imports: [WorkspacesModule, OptionalInclusionsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
