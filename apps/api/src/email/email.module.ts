import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { QrModule } from '../qr/qr.module';

@Global()
@Module({
  imports: [QrModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
