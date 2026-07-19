import { BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { UploadService } from './upload.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    url: jest.fn().mockReturnValue('https://res.cloudinary.com/demo/featured-transformed.webp'),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

describe('UploadService featured event artwork', () => {
  const eventFindUnique = jest.fn();
  const eventUpdate = jest.fn();
  const prisma = {
    event: { findUnique: eventFindUnique, update: eventUpdate },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventFindUnique.mockResolvedValue({ id: 'event-1' });
    eventUpdate.mockResolvedValue({ id: 'event-1' });
  });

  function mockCloudinaryUpload(width: number, height: number) {
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options, callback: (error: unknown, result?: unknown) => void) => ({
        end: () => callback(null, {
          public_id: 'axon-tickets/featured-events/event-1-123',
          secure_url: 'https://res.cloudinary.com/demo/original.webp',
          version: 1,
          width,
          height,
        }),
      }),
    );
  }

  it('persists a validated 3:2 image using the optimized delivery URL', async () => {
    mockCloudinaryUpload(1800, 1200);
    const service = new UploadService({ get: jest.fn() } as never, prisma as never);

    const result = await service.uploadFeaturedImage('event-1', Buffer.from('image'));

    expect(result).toEqual({
      featuredImageUrl: 'https://res.cloudinary.com/demo/featured-transformed.webp',
      width: 1800,
      height: 1200,
    });
    expect(eventUpdate).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { featuredImageUrl: 'https://res.cloudinary.com/demo/featured-transformed.webp' },
    });
  });

  it('rejects and cleans up artwork outside the accepted dimensions', async () => {
    mockCloudinaryUpload(1000, 1000);
    const service = new UploadService({ get: jest.fn() } as never, prisma as never);

    await expect(service.uploadFeaturedImage('event-1', Buffer.from('image'))).rejects.toThrow(BadRequestException);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'axon-tickets/featured-events/event-1-123',
      { resource_type: 'image' },
    );
    expect(eventUpdate).not.toHaveBeenCalled();
  });
});
