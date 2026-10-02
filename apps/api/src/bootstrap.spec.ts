import { Body, Controller, Get, INestApplication, Logger, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import * as Sentry from '@sentry/node';
import { configureApp } from './bootstrap';

class EchoDto {
  @IsString()
  name!: string;
}

@Controller('probe')
class ProbeController {
  @Get('ok')
  ok() {
    return { fine: true };
  }

  @Get('boom')
  boom(): never {
    throw new TypeError('secret internal detail');
  }

  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }
}

describe('configureApp (shared by main.ts and serverless.ts)', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Sentry, 'captureException').mockReturnValue('id');
    jest.spyOn(Sentry, 'flush').mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ allowedOrigins: ['https://app.example'] })] })],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const post = (body: string) =>
    fetch(`${base}/api/v1/probe/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  it('wraps successful responses in the { success, data } envelope under /api/v1', async () => {
    const res = await fetch(`${base}/api/v1/probe/ok`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { fine: true } });
  });

  it('sets security headers', async () => {
    const res = await fetch(`${base}/api/v1/probe/ok`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 400 (not 500) for malformed JSON', async () => {
    const res = await post('{"name": ');
    expect(res.status).toBe(400);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('rejects unknown fields and missing required fields with 400', async () => {
    expect((await post('{"name":"a","extra":1}')).status).toBe(400);
    expect((await post('{}')).status).toBe(400);
    expect((await post('{"name":"a"}')).status).toBe(201);
  });

  it('returns 404 for unknown routes', async () => {
    expect((await fetch(`${base}/api/v1/nope`)).status).toBe(404);
  });

  it('hides internals on unexpected errors and reports them to Sentry', async () => {
    const res = await fetch(`${base}/api/v1/probe/boom`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret internal detail');
    expect(JSON.parse(text)).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not reflect an untrusted CORS origin', async () => {
    const res = await fetch(`${base}/api/v1/probe/ok`, { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    const ok = await fetch(`${base}/api/v1/probe/ok`, { headers: { Origin: 'https://app.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });
});
