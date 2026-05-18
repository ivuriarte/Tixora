import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import type { Request, Express } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { PaymentProofsService } from './payment-proofs.service';
import { CreateProofDto } from './dto/create-proof.dto';

@ApiTags('payment-proofs')
@Controller('payment-proofs')
export class PaymentProofsController {
  constructor(private readonly paymentProofsService: PaymentProofsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload payment proof for a registration' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG, PNG, WEBP allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  upload(
    @Body() dto: CreateProofDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Proof image is required');
    return this.paymentProofsService.create(
      dto.registrationId,
      user.sub,
      file.buffer,
      file.mimetype,
      req.ip,
    );
  }
}
