import pino from 'pino';
import { LOG_REDACT_PATHS } from './redact-paths';

function logLine(payload: Record<string, unknown>): string {
  let out = '';
  const log = pino({ redact: LOG_REDACT_PATHS }, { write: (chunk: string) => { out += chunk; } });
  log.info(payload, 'request');
  return out;
}

describe('LOG_REDACT_PATHS', () => {
  it('hides every sensitive request header, including the guest access token', () => {
    const line = logLine({
      req: {
        headers: {
          authorization: 'Bearer SECRET-JWT',
          cookie: 'session=SECRET-COOKIE',
          'x-cron-secret': 'SECRET-CRON',
          'x-registration-token': 'SECRET-GUEST-TOKEN',
          'user-agent': 'jest',
        },
      },
    });
    for (const secret of ['SECRET-JWT', 'SECRET-COOKIE', 'SECRET-CRON', 'SECRET-GUEST-TOKEN']) {
      expect(line).not.toContain(secret);
    }
    expect(line.match(/\[Redacted\]/g)).toHaveLength(4);
    expect(line).toContain('jest');
  });

  it('hides response cookies', () => {
    const line = logLine({ res: { headers: { 'set-cookie': 'sid=SECRET-SET-COOKIE' } } });
    expect(line).not.toContain('SECRET-SET-COOKIE');
    expect(line).toContain('[Redacted]');
  });
});
