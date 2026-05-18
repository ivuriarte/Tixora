import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  /** Returns a PNG image as a Buffer. */
  async generateQrPng(data: string): Promise<Buffer> {
    return QRCode.toBuffer(data, { type: 'png', width: 256, margin: 2 });
  }

  /** Returns a base64 PNG data URI (data:image/png;base64,...). */
  async generateQrDataUrl(data: string): Promise<string> {
    return QRCode.toDataURL(data, { type: 'image/png', width: 256, margin: 2 });
  }
}
