/**
 * Auth hardening:
 *  - OTP attempts are counted atomically BEFORE the code is compared
 *  - an OTP can be redeemed only once (even by two parallel requests)
 *  - refresh tokens cannot be used as access tokens
 */
import { generateKeyPairSync } from 'crypto';
import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

let otpHash: string;

beforeAll(async () => {
  otpHash = await bcrypt.hash('123456', 4);
});

function build(opts: { jwt?: unknown } = {}) {
  const user = {
    id: 'u1',
    email: 'person@example.com',
    firstName: 'Pat',
    lastName: 'Lee',
    isAdmin: false,
    isVerified: false,
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
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as any;
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incrementWithTtl: jest.fn().mockResolvedValue({ count: 1, ttlSeconds: 300 }),
  } as any;
  const jwt = (opts.jwt ?? { signAsync: jest.fn().mockResolvedValue('tok'), verify: jest.fn() }) as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const funnel = { track: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new AuthService(prisma, redis, jwt, config, { sendOtpEmail: jest.fn() } as any, funnel);
  // acceptPendingOrganizationInvitation touches other tables; not under test here.
  (service as any).acceptPendingOrganizationInvitation = jest.fn().mockResolvedValue(undefined);
  return { service, prisma, redis, jwt, tx, user, funnel };
}

describe('OTP verification (verifyOtp)', () => {
  const dto = { userId: 'u1', otp: '123456' } as any;

  it('succeeds with the right code, consumes it conditionally, and verifies the user', async () => {
    const { service, tx, redis } = build();
    const res = await service.verifyOtp(dto);
    expect(res.accessToken).toBe('tok');
    expect(tx.otpCode.updateMany).toHaveBeenCalledWith({ where: { id: 'otp1', used: false }, data: { used: true } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isVerified: true } });
    expect(redis.del).toHaveBeenCalled(); // attempt counter cleared on success
  });

  it('refuses a second redemption of the same code (parallel requests) and issues no tokens', async () => {
    const { service, tx, jwt } = build();
    tx.otpCode.updateMany.mockResolvedValue({ count: 0 }); // someone else already used it
    await expect(service.verifyOtp(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('the 5th attempt with the RIGHT code still succeeds (exactly 5 tries are allowed)', async () => {
    const { service, redis } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 5, ttlSeconds: 300 });
    const res = await service.verifyOtp(dto);
    expect(res.accessToken).toBe('tok');
  });

  it('fails closed when the counter cannot be updated: no compare, no sign-in', async () => {
    const { service, redis, tx, jwt } = build();
    redis.incrementWithTtl.mockRejectedValue(new Error('redis down'));
    await expect(service.verifyOtp(dto)).rejects.toThrow('redis down');
    expect(tx.otpCode.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('counts the attempt atomically before comparing and blocks beyond the limit', async () => {
    const { service, redis, prisma } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 6, ttlSeconds: 300 });
    await expect(service.verifyOtp(dto)).rejects.toThrow(/Too many failed attempts/);
    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the right code is not even compared once the counter is past the limit', async () => {
    const { service, redis, tx } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 7, ttlSeconds: 300 });
    await expect(service.verifyOtp(dto)).rejects.toThrow(/Too many failed attempts/);
    expect(tx.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('still stops early, without counting, when the stored counter is already at the limit', async () => {
    const { service, redis } = build();
    redis.get.mockResolvedValue('5');
    await expect(service.verifyOtp(dto)).rejects.toThrow(/Too many failed attempts/);
    expect(redis.incrementWithTtl).not.toHaveBeenCalled();
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

  it('never writes the counter with a read-then-write', async () => {
    const { service, redis } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 2, ttlSeconds: 300 });
    await expect(service.verifyOtp({ userId: 'u1', otp: '000000' } as any)).rejects.toThrow();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe('OTP verification (verifyAccess)', () => {
  const dto = { userId: 'u1', otp: '123456' } as any;

  it('consumes the code once and verifies the user', async () => {
    const { service, tx } = build();
    const res = await service.verifyAccess(dto);
    expect(res.accessToken).toBe('tok');
    expect(tx.otpCode.updateMany).toHaveBeenCalledWith({ where: { id: 'otp1', used: false }, data: { used: true } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isVerified: true } });
  });

  it('refuses a second redemption and issues no tokens', async () => {
    const { service, tx, jwt } = build();
    tx.otpCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyAccess(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('the 5th attempt with the RIGHT code still succeeds', async () => {
    const { service, redis } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 5, ttlSeconds: 300 });
    const res = await service.verifyAccess(dto);
    expect(res.accessToken).toBe('tok');
  });

  it('fails closed when the counter cannot be updated', async () => {
    const { service, redis, tx } = build();
    redis.incrementWithTtl.mockRejectedValue(new Error('redis down'));
    await expect(service.verifyAccess(dto)).rejects.toThrow('redis down');
    expect(tx.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('blocks once the atomic counter passes the limit and records the block', async () => {
    const { service, redis, funnel, tx } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 6, ttlSeconds: 300 });
    await expect(service.verifyAccess(dto)).rejects.toThrow(/Too many failed attempts/);
    expect(funnel.track).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked', metadata: { reason: 'too_many_attempts' } }),
      expect.anything(),
    );
    expect(tx.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('a wrong code on the 5th attempt invalidates the code', async () => {
    const { service, redis, prisma } = build();
    redis.incrementWithTtl.mockResolvedValue({ count: 5, ttlSeconds: 300 });
    await expect(service.verifyAccess({ userId: 'u1', otp: '000000' } as any)).rejects.toThrow(/Too many failed attempts/);
    expect(prisma.otpCode.update).toHaveBeenCalledWith({ where: { id: 'otp1' }, data: { used: true } });
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

describe('concurrency (stateful fakes)', () => {
  /** A Redis fake whose INCR is atomic (single-threaded), like the real Lua script. */
  function statefulRedis(redis: { get: jest.Mock; del: jest.Mock; incrementWithTtl: jest.Mock }) {
    const counters = new Map<string, number>();
    redis.get.mockImplementation(async (key: string) => (counters.has(key) ? String(counters.get(key)) : null));
    redis.del.mockImplementation(async (key: string) => (counters.delete(key) ? 1 : 0));
    redis.incrementWithTtl.mockImplementation(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return { count: next, ttlSeconds: 300 };
    });
  }

  it('10 parallel WRONG guesses get exactly 5 real tries, the 5th invalidates the code, the rest are blocked', async () => {
    const { service, redis, prisma } = build();
    statefulRedis(redis);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.verifyOtp({ userId: 'u1', otp: '000000' } as any)),
    );
    const messages = results.map((r) => (r.status === 'rejected' ? String((r.reason as Error).message) : 'FULFILLED'));
    expect(messages.filter((m) => m === 'FULFILLED')).toHaveLength(0);
    // Tries 1-4 are compared and fail; try 5 is compared, fails and invalidates; tries 6-10 are never compared.
    expect(messages.filter((m) => m === 'Incorrect verification code')).toHaveLength(4);
    expect(messages.filter((m) => /Too many failed attempts/.test(m))).toHaveLength(6);
    expect(prisma.otpCode.update).toHaveBeenCalledTimes(1);
  });

  it('two parallel requests with the RIGHT code: exactly one signs in, the other is refused with no tokens', async () => {
    const { service, redis, tx, jwt } = build();
    statefulRedis(redis);
    let used = false;
    tx.otpCode.updateMany.mockImplementation(async () => {
      if (used) return { count: 0 };
      used = true;
      return { count: 1 };
    });
    const results = await Promise.allSettled([
      service.verifyOtp({ userId: 'u1', otp: '123456' } as any),
      service.verifyOtp({ userId: 'u1', otp: '123456' } as any),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(2); // one access + one refresh token, for the winner only
  });
});

describe('token types with real RS256 tokens', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const jwtService = new JwtService({ privateKey, publicKey });
  const config = { get: jest.fn().mockReturnValue(publicKey) } as any;

  /** Signs in through the real service so the tokens are exactly what production issues. */
  async function issueTokens() {
    const { service } = build({ jwt: jwtService });
    return service.verifyOtp({ userId: 'u1', otp: '123456' } as any);
  }

  function httpContext(authorization: string): { ctx: ExecutionContext; req: { headers: Record<string, string>; user?: unknown } } {
    const req: { headers: Record<string, string>; user?: unknown } = { headers: { authorization } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
      getHandler: () => function handler() {},
      getClass: () => class Dummy {},
    } as unknown as ExecutionContext;
    return { ctx, req };
  }

  it('contract: access tokens never carry a jti, refresh tokens always do', async () => {
    const { accessToken, refreshToken } = await issueTokens();
    const access = jwtService.decode<Record<string, unknown>>(accessToken);
    const refresh = jwtService.decode<Record<string, unknown>>(refreshToken);
    expect(access.jti).toBeUndefined();
    expect(typeof refresh.jti).toBe('string');
    const strategy = new JwtStrategy(config);
    expect(strategy.validate(access as any)).toMatchObject({ sub: 'u1' });
    expect(() => strategy.validate(refresh as any)).toThrow(UnauthorizedException);
  });

  it('through the real JwtAuthGuard: an access token passes and a refresh token gets 401', async () => {
    const { accessToken, refreshToken } = await issueTokens();
    new JwtStrategy(config); // registers the 'jwt' passport strategy with the real public key
    const guard = new JwtAuthGuard(new Reflector());

    const ok = httpContext(`Bearer ${accessToken}`);
    await expect(Promise.resolve(guard.canActivate(ok.ctx))).resolves.toBe(true);
    expect(ok.req.user).toMatchObject({ sub: 'u1' });

    const bad = httpContext(`Bearer ${refreshToken}`);
    await expect(Promise.resolve(guard.canActivate(bad.ctx))).rejects.toThrow(UnauthorizedException);
    expect(bad.req.user).toBeUndefined();
  });
});
