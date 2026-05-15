import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    cloudinary.config({
      cloud_name: this.config.get('cloudinary.cloudName'),
      api_key: this.config.get('cloudinary.apiKey'),
      api_secret: this.config.get('cloudinary.apiSecret'),
      secure: true,
    });
  }

  async uploadEventImage(
    eventId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ imageUrl: string }> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'axon-tickets/events',
          public_id: `event-${eventId}`,
          overwrite: true,
          transformation: [
            { width: 1200, height: 630, crop: 'fill', gravity: 'auto' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('Upload failed'));
          else resolve(result);
        },
      );
      stream.end(buffer);
    });

    const imageUrl = result.secure_url;

    await this.prisma.event.update({
      where: { id: eventId },
      data: { imageUrl },
    });

    this.logger.log({ msg: 'Event image uploaded', eventId, imageUrl });
    return { imageUrl };
  }
}
