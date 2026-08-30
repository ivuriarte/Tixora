import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    _mimeType: string,
  ): Promise<{ imageUrl: string }> {
    // IDOR guard: verify event exists before uploading
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');

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

  async uploadFeaturedImage(
    eventId: string,
    buffer: Buffer,
  ): Promise<{ featuredImageUrl: string; width: number; height: number }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'axon-tickets/featured-events',
          public_id: `event-${eventId}-${Date.now()}`,
          overwrite: false,
          resource_type: 'image',
        },
        (error, uploaded) => {
          if (error || !uploaded) reject(error ?? new Error('Upload failed'));
          else resolve(uploaded);
        },
      );
      stream.end(buffer);
    });

    const width = result.width ?? 0;
    const height = result.height ?? 0;
    const ratio = height > 0 ? width / height : 0;
    const hasValidDimensions = width >= 1200 && height >= 800 && width <= 3600 && height <= 2400;
    const hasThreeByTwoRatio = Math.abs(ratio - 1.5) <= 0.015;

    if (!hasValidDimensions || !hasThreeByTwoRatio) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' }).catch(() => undefined);
      throw new BadRequestException(
        'Featured artwork must use a 3:2 aspect ratio and be between 1200×800 and 3600×2400 pixels. Recommended: 1800×1200.',
      );
    }

    const featuredImageUrl = cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      transformation: [
        { width: 1800, height: 1200, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good', fetch_format: 'auto' },
      ],
    });

    await this.prisma.event.update({
      where: { id: eventId },
      data: { featuredImageUrl },
    });

    this.logger.log({ msg: 'Featured event artwork uploaded', eventId, width, height });
    return { featuredImageUrl, width, height };
  }

  async uploadPaymentProof(
    registrationId: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<{ imageUrl: string; cloudinaryPublicId: string }> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'axon-tickets/payment-proofs',
          public_id: `proof-${registrationId}-${Date.now()}`,
          overwrite: false,
          resource_type: 'image',
          transformation: [
            { width: 1600, height: 1600, crop: 'limit' },
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

    this.logger.log({
      msg: 'Payment proof uploaded',
      registrationId,
      publicId: result.public_id,
    });
    return { imageUrl: result.secure_url, cloudinaryPublicId: result.public_id };
  }

  async deleteStoredImage(publicId: string): Promise<void> {
    if (!publicId.trim()) return;
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary deletion failed for ${publicId}`);
    }
  }

  async uploadPaymentQr(buffer: Buffer, mimeType: string): Promise<{ url: string }> {
    void mimeType;
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'axon-tickets/payment-qr', transformation: [{ quality: 'auto:good', fetch_format: 'auto' }] },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('Upload failed'));
          else resolve(result);
        },
      );
      stream.end(buffer);
    });
    this.logger.log({ msg: 'Payment QR uploaded', url: result.secure_url });
    return { url: result.secure_url };
  }

  async uploadEventCover(buffer: Buffer): Promise<{ url: string }> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'axon-tickets/event-covers',
          resource_type: 'image',
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
    this.logger.log({ msg: 'Event cover uploaded', url: result.secure_url });
    return { url: result.secure_url };
  }

  async uploadSponsorLogo(buffer: Buffer): Promise<{ url: string }> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'axon-tickets/sponsor-logos',
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'limit' },
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
    this.logger.log({ msg: 'Sponsor logo uploaded', url: result.secure_url });
    return { url: result.secure_url };
  }
}
