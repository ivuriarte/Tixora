import { RedisService } from './redis.service';

describe('RedisService.deleteIfEquals', () => {
  function build(scriptResult: unknown) {
    const service = new RedisService({ get: jest.fn() } as never);
    const client = { eval: jest.fn().mockResolvedValue(scriptResult) };
    (service as unknown as { client: unknown }).client = client;
    return { service, client };
  }

  it('runs one script and passes the key and the expected value as arguments, not inside the script', async () => {
    const { service, client } = build(1);
    const expected = `{"codeHash":"x'); redis.call('FLUSHALL"}`;

    await service.deleteIfEquals('guest-checkout-otp:registration-1', expected);

    expect(client.eval).toHaveBeenCalledTimes(1);
    const [script, keyCount, key, value] = client.eval.mock.calls[0] as [string, number, string, string];
    expect(keyCount).toBe(1);
    expect(key).toBe('guest-checkout-otp:registration-1');
    expect(value).toBe(expected);
    expect(script).not.toContain(expected);
    expect(script).toContain('KEYS[1]');
    // Delete only when the stored value EQUALS the expected one (an inverted compare would refuse
    // every claim). This mock cannot run Lua, so the script text is pinned here and a real Redis
    // is exercised by one successful guest confirmation on UAT.
    expect(script).toContain("redis.call('GET', KEYS[1]) == ARGV[1]");
  });

  it('returns 1 when it removed the key', async () => {
    const { service } = build(1);
    await expect(service.deleteIfEquals('k', 'v')).resolves.toBe(1);
  });

  it('returns 0 when the key is missing or holds something else', async () => {
    const { service } = build(0);
    await expect(service.deleteIfEquals('k', 'v')).resolves.toBe(0);
  });
});
