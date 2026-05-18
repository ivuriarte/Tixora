import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProofDto {
  @ApiProperty({ description: 'Registration ID this proof belongs to' })
  @IsUUID()
  registrationId: string;
}
