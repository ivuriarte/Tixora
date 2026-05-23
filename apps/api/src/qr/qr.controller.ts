import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { QrService } from './qr.service';

@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  /** Public endpoint — returns QR PNG for a given token. */
  @Public()
  @Get(':token')
  async getQrPng(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.qrService.generateQrPng(token);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Length': png.length.toString(),
    });
    res.end(png);
  }
}
