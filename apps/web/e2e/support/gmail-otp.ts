interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.TEST_GMAIL_CLIENT_ID ?? '',
    client_secret: process.env.TEST_GMAIL_CLIENT_SECRET ?? '',
    refresh_token: process.env.TEST_GMAIL_REFRESH_TOKEN ?? '',
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`Gmail OAuth failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token)
    throw new Error('Gmail OAuth response did not include an access token');
  return payload.access_token;
}

async function gmailJson<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail API failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function subjectOf(message: GmailMessage) {
  return (
    message.payload?.headers?.find((header) => header.name.toLowerCase() === 'subject')?.value ?? ''
  );
}

/**
 * Reads only a recent Axon OTP subject from a controlled test mailbox.
 * The code is never logged or attached to Playwright evidence.
 */
export async function waitForAxonOtp(email: string, requestedAfterMs: number) {
  const accessToken = await getAccessToken();
  const afterSeconds = Math.floor((requestedAfterMs - 5_000) / 1000);
  const query = encodeURIComponent(
    `to:${email} after:${afterSeconds} subject:"is your Axon Tickets code"`,
  );
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const list = await gmailJson<{ messages?: Array<{ id: string }> }>(
      accessToken,
      `messages?q=${query}&maxResults=5`,
    );
    for (const candidate of list.messages ?? []) {
      const message = await gmailJson<GmailMessage>(
        accessToken,
        `messages/${candidate.id}?format=metadata&metadataHeaders=Subject`,
      );
      if (Number(message.internalDate ?? 0) < requestedAfterMs - 5_000) continue;
      const match = subjectOf(message).match(/^([0-9]{6}) is your Axon Tickets code$/i);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error('A fresh Axon OTP did not arrive in the controlled mailbox within 90 seconds');
}
