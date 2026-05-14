import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  reservationId: string;

  @ApiProperty({ enum: ['gcash', 'maya', 'card', 'free'] })
  @IsIn(['gcash', 'maya', 'card', 'free'])
  paymentMethod: 'gcash' | 'maya' | 'card' | 'free';

  @ApiProperty({ description: 'Client-generated idempotency key (UUID)' })
  @IsString()
  idempotencyKey: string;
}
