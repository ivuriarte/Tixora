import { IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ description: 'Ticket tier ID' })
  @IsString()
  tierId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @ApiProperty({ description: 'Client-generated idempotency key (UUID)' })
  @IsString()
  idempotencyKey: string;
}
