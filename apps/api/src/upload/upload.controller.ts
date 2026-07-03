import {
  Controller,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UploadService } from './upload.service';
import { Express } from 'express';

@ApiTags('upload')
@Controller('upload')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('events/:eventId/image')
  @ApiOperation({ summary: 'Upload event cover image (admin only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
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
  uploadEventImage(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.uploadService.uploadEventImage(eventId, file.buffer, file.mimetype);
  }

  @Post('payment-qr')
  @ApiOperation({ summary: 'Upload a payment QR code image (admin only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG and PNG allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  uploadPaymentQr(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.uploadService.uploadPaymentQr(file.buffer, file.mimetype);
  }

  @Post('event-cover')
  @ApiOperation({ summary: 'Upload an event cover image (admin only, no eventId yet)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
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
  uploadEventCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.uploadService.uploadEventCover(file.buffer);
  }

  @Post('sponsor-logo')
  @ApiOperation({ summary: 'Upload a sponsor logo (admin only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG, PNG, and WEBP allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  uploadSponsorLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.uploadService.uploadSponsorLogo(file.buffer);
  }
}
