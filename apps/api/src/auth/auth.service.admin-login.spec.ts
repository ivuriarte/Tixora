/**
 * Password sign-in is for platform admins only; password sign-up is retired.
 *  - POST /auth/login: a non-admin is refused with the same message as an unknown account
 *  - POST /auth/register: answers 410 Gone and never touches the service
 */
import { GoneException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const PASSWORD = 'correct horse battery';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

function build(userOverrides: Record<string, unknown> = {}) {
  const user = {
    id: 'u1',
    email: 'person@example.com',
    firstName: 'Pat',
    lastName: 'Lee',
    isAdmin: false,
    isVerified: true,
    passwordHash: null as string | null,
    ...userOverrides,
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    otpCode: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    organizationMember: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
  const redis = { set: jest.fn().mockResolvedValue('OK') } as any;
  const jwt = { signAsync: jest.fn().mockResolvedValue('tok') } as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const emailService = { sendOtpEmail: jest.fn() } as any;
  const funnel = { track: jest.fn() } as any;
  const service = new AuthService(prisma, redis, jwt, config, emailService, funnel);
  return { service, prisma, jwt, emailService };
}

const login = (service: AuthService, password = PASSWORD) =>
  service.login({ email: 'person@example.com', password } as any);

describe('password login is admin-only', () => {
  it('lets a verified platform admin sign in with the right password', async () => {
    const { service } = build({ isAdmin: true, passwordHash });
    const res = await login(service);
    expect(res.accessToken).toBe('tok');
    expect(res.user.isAdmin).toBe(true);
  });

  it('rejects a NON-admin even with the right password, with the generic message', async () => {
    const { service, jwt } = build({ isAdmin: false, passwordHash });
    await expect(login(service)).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    expect(jwt.signAsync).not.toHaveBeenCalled(); // no token for a non-admin
  });

  it('rejects an unverified NON-admin without sending a code or revealing the account', async () => {
    const { service, emailService } = build({ isAdmin: false, isVerified: false, passwordHash });
    await expect(login(service)).rejects.toThrow('Invalid email or password');
    expect(emailService.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('answers a wrong password, an unknown account and a non-admin with the exact same error', async () => {
    const wrongPassword = build({ isAdmin: true, passwordHash });
    const unknown = build();
    unknown.prisma.user.findUnique.mockResolvedValue(null);
    const nonAdmin = build({ isAdmin: false, passwordHash });
    const noPassword = build({ isAdmin: true, passwordHash: null });

    const errors = await Promise.all([
      login(wrongPassword.service, 'nope').catch((e) => e),
      login(unknown.service).catch((e) => e),
      login(nonAdmin.service).catch((e) => e),
      login(noPassword.service).catch((e) => e),
    ]);
    for (const err of errors) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe('Invalid email or password');
      expect(err.getStatus()).toBe(401);
    }
  });
});

describe('password sign-up is retired', () => {
  it('POST /auth/register answers 410 Gone and does not call the service', () => {
    const authService = { register: jest.fn() } as any;
    const controller = new AuthController(authService);
    expect(() => controller.register()).toThrow(GoneException);
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('the 410 tells the caller to use the email code', () => {
    const controller = new AuthController({} as never);
    try {
      controller.register();
      fail('expected a GoneException');
    } catch (err) {
      expect(err).toBeInstanceOf(GoneException);
      expect((err as GoneException).getStatus()).toBe(410);
      expect((err as GoneException).message).toMatch(/email code/i);
    }
  });
});
