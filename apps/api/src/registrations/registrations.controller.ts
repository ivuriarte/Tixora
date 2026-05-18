import { Controller } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';

@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  // Phase 2: POST /registrations, GET /registrations/:id, DELETE /registrations/:id
}
