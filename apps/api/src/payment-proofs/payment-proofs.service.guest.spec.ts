import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PaymentProofsService } from './payment-proofs.service';

function fixture(token = 'valid-scoped-token') {
  const registration = {
    id: 'registration-1',
    userId: null,
    guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
    status: 'pending_payment',
    eventId: 'event-1',
    total: 500,
    attendeeCount: 1,
    attendeesCompletedAt: null,
  };
  const tx = {
    paymentProof: {
      create: jest.fn().mockResolvedValue({
        id: 'proof-1',
        registrationId: 'registration-1',
        imageUrl: 'https://cdn.example.com/proof.webp',
        status: 'pending',
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
      }),
    },
    registration: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    registration: { findUnique: jest.fn().mockResolvedValue(registration) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const upload = {
    uploadPaymentProof: jest.fn().mockResolvedValue({
      imageUrl: 'https://cdn.example.com/proof.webp',
      cloudinaryPublicId: 'proofs/proof-1',
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const funnel = { track: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentProofsService(
    prisma as any,
    upload as any,
    audit as any,
    funnel as any,
  );
  return { service, prisma, upload, tx };
}

describe('PaymentProofsService guest authorization', () => {
  it('allows payment proof before attendee completion with the matching scoped token', async () => {
    const { service, upload, tx } = fixture();

    const result = await service.createForGuest(
      'registration-1',
      'valid-scoped-token',
      Buffer.from('safe-image'),
      'image/webp',
    );

    expect(upload.uploadPaymentProof).toHaveBeenCalledWith(
      'registration-1',
      expect.any(Buffer),
      'image/webp',
    );
    expect(tx.registration.update).toHaveBeenCalledWith({
      where: { id: 'registration-1' },
      data: { status: 'proof_submitted', rejectionReason: null },
    });
    expect(result.status).toBe('pending');
  });

  it('rejects an invalid scoped token before uploading any file', async () => {
    const { service, upload, prisma } = fixture();

    await expect(
      service.createForGuest(
        'registration-1',
        'wrong-token',
        Buffer.from('untrusted-image'),
        'image/webp',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(upload.uploadPaymentProof).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
