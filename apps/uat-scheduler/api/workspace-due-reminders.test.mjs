import assert from 'node:assert/strict';
import test from 'node:test';
import handler from './workspace-due-reminders.mjs';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('rejects requests that do not carry the scheduler bearer secret', async () => {
  process.env.CRON_SECRET = 'uat-secret';
  process.env.UAT_API_BASE_URL = 'https://api-uat.example.test';
  const response = responseRecorder();

  await handler({ method: 'GET', headers: {} }, response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { ok: false, error: 'Unauthorized' });
});

test('forwards a protected request only to the configured UAT API', async (context) => {
  process.env.CRON_SECRET = 'uat-secret';
  process.env.UAT_API_BASE_URL = 'https://api-uat.example.test/';
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api-uat.example.test/api/v1/cron/workspace-due-reminders');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.authorization, 'Bearer uat-secret');
    return { status: 200, json: async () => ({ ok: true, recipients: 0, tasks: 0 }) };
  };
  const response = responseRecorder();

  await handler({ method: 'GET', headers: { authorization: 'Bearer uat-secret' } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, recipients: 0, tasks: 0 });
});
