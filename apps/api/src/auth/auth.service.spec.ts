/**
 * U-A1 – U-A8: AuthService.requestAccess unit tests
 *
 * Covers the profile pre-filling logic added for the inline registration wizard:
 *  U-A1  New user (no existing record) — creates stub with all profile fields
 *  U-A2  New user — creates stub with email only when no profile supplied
 *  U-A3  Returning stub user (firstName === null) — fills in profile on requestAccess
 *  U-A4  Returning stub user — trims whitespace from profile fields
 *  U-A5  Returning verified user (firstName set) — never overwrites existing profile
 *  U-A6  Rate-limit — throws when an OTP was sent in last 60 seconds
 *  U-A7  Returns { userId } on success for new user
 *  U-A8  Returns { userId } on success for returning user
 */

import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

// ── helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isVerified: boolean;
  isAdmin: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'user_1',
    email: overrides.email ?? 'test@example.com',
    firstName: overrides.firstName !== undefined ? overrides.firstName : null,
    lastName: overrides.lastName !== undefined ? overrides.lastName : null,
    phone: overrides.phone !== undefined ? overrides.phone : null,
    isVerified: overrides.isVerified ?? false,
    isAdmin: overrides.isAdmin ?? false,
    passwordHash: null,
    googleId: null,
    avatarUrl: null,
    company: null,
    jobTitle: null,
    city: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildMocks() {
  const createdUser = makeUser({ id: 'new_user' });
  const updatedUser = makeUser({ id: 'stub_user', firstName: 'Juan', lastName: 'Cruz', phone: '+639171234567' });

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdUser),
      update: jest.fn().mockResolvedValue(updatedUser),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null), // no recent OTP by default
      create: jest.fn().mockResolvedValue({ id: 'otp_1' }),
    },
  } as any;

  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as any;

  const emailService = {
    sendOtpEmail: jest.fn().mockResolvedValue(true),
  } as any;

  const funnel = {
    track: jest.fn().mockResolvedValue(undefined),
  } as any;

  const jwt = {
    signAsync: jest.fn().mockResolvedValue('mock_token'),
  } as any;

  const config = {
    get: jest.fn().mockReturnValue('15m'),
  } as any;

  const service = new AuthService(prisma, redis, jwt, config, emailService, funnel);
  return { prisma, redis, emailService, funnel, service, createdUser, updatedUser };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('AuthService.requestAccess — profile pre-filling', () => {
  const BASE_DTO = {
    email: 'juan@example.com',
    eventId: 'evt_1',
    sessionId: 'sess_1',
  };

  it('U-A1: creates stub user with all profile fields for new email', async () => {
    const { prisma, service } = buildMocks();

    await service.requestAccess({
      ...BASE_DTO,
      firstName: 'Juan',
      lastName: 'dela Cruz',
      phone: '+639171234567',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'juan@example.com',
        isVerified: false,
        firstName: 'Juan',
        lastName: 'dela Cruz',
        phone: '+639171234567',
      }),
    });
  });

  it('U-A2: creates stub user with null profile when no fields supplied', async () => {
    const { prisma, service } = buildMocks();

    await service.requestAccess({ ...BASE_DTO });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'juan@example.com',
        isVerified: false,
        firstName: null,
        lastName: null,
        phone: null,
      }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('U-A3: fills profile on existing stub user (firstName === null)', async () => {
    const { prisma, service } = buildMocks();
    const existingStub = makeUser({ id: 'stub_user', firstName: null });
    prisma.user.findUnique.mockResolvedValue(existingStub);

    await service.requestAccess({
      ...BASE_DTO,
      firstName: 'Maria',
      lastName: 'Santos',
      phone: '+639181234567',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'juan@example.com' },
      data: expect.objectContaining({
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '+639181234567',
      }),
    });
  });

  it('U-A4: trims whitespace from profile fields on stub user', async () => {
    const { prisma, service } = buildMocks();
    prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'stub_user', firstName: null }));

    await service.requestAccess({
      ...BASE_DTO,
      firstName: '  Pedro  ',
      lastName: '  Reyes  ',
      phone: '  +639191234567  ',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'juan@example.com' },
      data: expect.objectContaining({
        firstName: 'Pedro',
        lastName: 'Reyes',
        phone: '+639191234567',
      }),
    });
  });

  it('U-A5: does NOT update existing user who already has firstName set', async () => {
    const { prisma, service } = buildMocks();
    const existingFull = makeUser({
      id: 'full_user',
      firstName: 'Existing',
      lastName: 'Name',
      isVerified: true,
    });
    prisma.user.findUnique.mockResolvedValue(existingFull);

    await service.requestAccess({
      ...BASE_DTO,
      firstName: 'NewName',
      lastName: 'Override',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('U-A6: throws 400 when OTP sent within last 60 seconds (rate-limit)', async () => {
    const { prisma, service } = buildMocks();
    const existingFull = makeUser({ id: 'user_r', firstName: 'Rate', isVerified: true });
    prisma.user.findUnique.mockResolvedValue(existingFull);
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'recent_otp', createdAt: new Date() });

    await expect(service.requestAccess({ ...BASE_DTO })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('U-A7: returns { userId } for new user after OTP is sent', async () => {
    const { service, createdUser } = buildMocks();

    const result = await service.requestAccess({ ...BASE_DTO, firstName: 'Ben' });

    expect(result).toEqual({ userId: createdUser.id });
  });

  it('U-A8: returns { userId } for returning user after OTP is sent', async () => {
    const { prisma, service } = buildMocks();
    const returning = makeUser({ id: 'returning_user', firstName: 'Ana', isVerified: true });
    prisma.user.findUnique.mockResolvedValue(returning);

    const result = await service.requestAccess({ ...BASE_DTO });

    expect(result).toEqual({ userId: 'returning_user' });
  });
});
