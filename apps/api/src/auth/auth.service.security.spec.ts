/**
 * Auth hardening:
 *  - password sign-in is for platform admins only
 *  - password sign-up is retired (HTTP 410)
 *  - OTP attempts are counted atomically BEFORE the code is compared
 *  - an OTP can be redeemed only once (even by two parallel requests)
 *  - verifying an email clears any pre-planted password on non-admin accounts
 *  - refresh tokens cannot be used as access tokens
 */
import { BadRequestException, GoneException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

const PASSWORD = 'correct horse battery';
let passwordHash: string;
let otpHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  otpHash = await bcrypt.hash('123456', 4);
});

function build(userOverrides: Record<string, unknown> = {}) {
  const user = {
    id: 'u1',
    email: 'person@example.com',
    firstName: 'Pat',
    lastName: 'Lee',
    isAdmin: false,
    isVerified: false,
    passwordHash: null as string | null,
    ...userOverrides,
  };
  const otpRecord = { id: 'otp1', codeHash: otpHash };

  const tx = {
    otpCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { update: jest.fn().mockResolvedValue(user) },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(otpRecord),
      update: jest.fn().mockResolvedValue({}),
    },
    organizationMember: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationInvitation: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as any;
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incrementWithTtl: jest.fn().mockResolvedValue({ count: 1, ttlSeconds: 300 }),
  } as any;
  const jwt = { signAsync: jest.fn().mockResolvedValue('tok'), verify: jest.fn() } as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const funnel = { track: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new AuthService(prisma, redis, jwt, config, { sendOtpEmail: jest.fn() } as any, funnel);
  // acceptPendingOrganizationInvitation touches other tables; not under test here.
  (service as any).acceptPendingOrganizationInvitation = jest.fn().mockResolvedValue(undefined);
  return { service, prisma, redis, jwt, tx, user };
}

describe('password login is admin-only', () => {
  it('lets a verified platform admin sign in with the right password', async () => {
    const { service, prisma } = build({ isAdmin: true, isVerified: true, passwordHash });
    const res = await service.login({ email: 'person@example.com', password: PASSWORD } as any);
    expect(res.accessToken).toBe('tok');
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('rejects a NON-admin even with the right password, with the generic message', async () => {
    const { service } = build({ isAdmin: false, isVerified: true, passwordHash });
    await expect(service.login({ email: 'person@example.com', password: PASSWORD } as any)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  it('rejects wrong passwords and unknown users with the same message', async () => {
    const admin = build({ isAdmin: true, isVerified: true, passwordHash });
    await expect(admin.service.login({ email: 'person@example.com', password: 'nope' } as any)).rejects.toThrow(
      'Invalid email or password',
    );
    const unknown = build();
    unknown.prisma.user.findUnique.mockResolvedValue(null);
    await expect(unknown.service.login({ email: 'x@example.com', password: PASSWORD } as any)).rejects.toThrow(
      'Invalid email or password',
    );
  });
});

describe('password sign-up is retired', () => {
  it('POST /auth/register answers 410 Gone', () => {
    const controller = new AuthController({} as never);
    expect(() => controller.register()).toThrow(GoneException);
  });
});

describe('OTP verification (verifyOtp)', () => {
  const dto = { userId: 'u1', otp: '123456' } as any;

  it('succeeds with the right code, consumes it conditionally, and clears a planted password', async () => {
    const { service, tx, redis } = build({ passwordHash: 'planted-by-someone-else' });
    const res = await service.verifyOtp(dto);
    expect(res.accessToken).toBe('tok');
    expect(tx.otpCode.updateMany).toHaveBeenCalledWith({ where: { id: 'otp1', used: false }, data: { used: true } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isVerified: true, passwordHash: null } });
    expect(redis.del).toHaveBeenCalled(); // attempt counter cleared on success
  });

  it('keeps an admin password when the admin verifies', async () => {
    const { service, tx } = build({ isAdmin: true, passwordHash });
    await service.verifyOtp(dto);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isVerified: true } });
  });

  it('refuses a second redemption of the same code (parallel requests)', async () => {
    const { service, tx } = build();
    tx.otpCode.updateMany.mockResolvedValue({ count: 0 }); // someone else already used it
    await expect(service.verifyOtp(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('counts the attempt atomically before comparing and blocks beyond the limit', async () => {
    const { service, redis, prisma } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 6, ttlSeconds: 300 });
    await expect(service.verifyOtp(dto)).rejects.toThrow(/Too many failed attempts/);
    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a wrong code on the 5th attempt invalidates the code', async () => {
    const { service, redis, prisma } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 5, ttlSeconds: 300 });
    await expect(service.verifyOtp({ userId: 'u1', otp: '000000' } as any)).rejects.toThrow(/Too many failed attempts/);
    expect(prisma.otpCode.update).toHaveBeenCalledWith({ where: { id: 'otp1' }, data: { used: true } });
  });

  it('a wrong code before the limit says so and does not invalidate the code', async () => {
    const { service, redis, prisma } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 2, ttlSeconds: 300 });
    await expect(service.verifyOtp({ userId: 'u1', otp: '000000' } as any)).rejects.toThrow('Incorrect verification code');
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
  });
});

describe('OTP verification (verifyAccess)', () => {
  const dto = { userId: 'u1', otp: '123456' } as any;

  it('consumes the code once and clears a planted password', async () => {
    const { service, tx } = build({ passwordHash: 'planted' });
    const res = await service.verifyAccess(dto);
    expect(res.accessToken).toBe('tok');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isVerified: true, passwordHash: null } });
  });

  it('refuses a second redemption', async () => {
    const { service, tx } = build();
    tx.otpCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyAccess(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('blocks once the atomic counter passes the limit', async () => {
    const { service, redis } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 6, ttlSeconds: 300 });
    await expect(service.verifyAccess(dto)).rejects.toThrow(/Too many failed attempts/);
  });
});

describe('token types', () => {
  const config = { get: jest.fn().mockReturnValue('-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----') } as any;

  it('the bearer strategy rejects refresh tokens (they carry a jti)', () => {
    const strategy = new JwtStrategy(config);
    expect(() => strategy.validate({ sub: 'u1', jti: 'abc' } as any)).toThrow(UnauthorizedException);
  });

  it('the bearer strategy still accepts normal access tokens', () => {
    const strategy = new JwtStrategy(config);
    expect(strategy.validate({ sub: 'u1', email: 'a@b.c', isAdmin: false })).toEqual({
      sub: 'u1',
      email: 'a@b.c',
      isAdmin: false,
    });
  });

  it('the refresh endpoint rejects an access token (no jti => no stored session)', async () => {
    const { service, jwt, redis } = build();
    jwt.verify.mockReturnValue({ sub: 'u1' }); // an access-token-shaped payload
    redis.get.mockResolvedValue(null);
    await expect(service.refreshTokens('access.token.here')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
