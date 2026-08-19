const UAT_REMINDER_PATH = '/api/v1/cron/workspace-due-reminders';

function sendJson(response, status, body) {
  response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const apiBaseUrl = process.env.UAT_API_BASE_URL?.replace(/\/$/, '');
  if (!secret || !apiBaseUrl) {
    return sendJson(response, 503, { ok: false, error: 'Scheduler is not configured' });
  }

  if (request.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(response, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}${UAT_REMINDER_PATH}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${secret}`,
      },
    });
    const payload = await upstream.json().catch(() => ({ ok: false }));
    return sendJson(response, upstream.status, payload);
  } catch {
    return sendJson(response, 502, { ok: false, error: 'UAT reminder service unavailable' });
  }
}
