import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';

const PAYLOAD = '<a href="https://evil.example">Verify</a>';

function makeService() {
  const config = {
    get: (key: string) =>
      ({
        'smtp.user': 'user',
        'smtp.pass': 'pass',
        'smtp.fromEmail': 'noreply@example.com',
        'smtp.fromName': 'Axon Tickets',
        'smtp.host': 'localhost',
        'smtp.port': 587,
      })[key],
  };
  const qr = { generateQrPng: jest.fn().mockResolvedValue(Buffer.from('png')) };
  const service = new EmailService(config as never, qr as never);
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
  // Replace the real SMTP transport with a fake one.
  (service as unknown as { transporter: { sendMail: jest.Mock; close: () => void } }).transporter = {
    sendMail,
    close: () => undefined,
  };
  return { service, sendMail };
}

describe('EmailService security', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never writes the OTP code to the logs, but still sends it in the email', async () => {
    const lines: string[] = [];
    const capture = (arg: unknown) => lines.push(JSON.stringify(arg));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);

    const { service, sendMail } = makeService();
    await service.sendOtpEmail('person@example.com', '482913');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].subject).toContain('482913'); // the user still gets the code
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('482913');
  });

  it('does not log the OTP code on failed sends either', async () => {
    const lines: string[] = [];
    const capture = (arg: unknown) => lines.push(JSON.stringify(arg));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
    jest.useFakeTimers({ doNotFake: ['nextTick'] });

    const { service, sendMail } = makeService();
    sendMail.mockRejectedValue(new Error('smtp down'));
    const pending = service.sendOtpEmail('person@example.com', '731905');
    await jest.runAllTimersAsync();
    await pending;
    jest.useRealTimers();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(lines.join('\n')).not.toContain('731905');
  });

  it('still logs normal subjects (only OTP mail is redacted)', async () => {
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((arg: unknown) => lines.push(JSON.stringify(arg)));
    const { service } = makeService();
    await service.sendOrganizationTeamInvite('a@example.com', 'Acme', false);
    expect(lines.join('\n')).toContain('You were invited to Acme');
  });

  it('escapes user-controlled values in registration / proof / cancellation / rejection emails', async () => {
    const { service, sendMail } = makeService();
    await service.sendRegistrationConfirmation('a@example.com', PAYLOAD, PAYLOAD, PAYLOAD, PAYLOAD, PAYLOAD, PAYLOAD);
    await service.sendProofReceivedNotification('a@example.com', PAYLOAD, PAYLOAD, PAYLOAD);
    await service.sendCancellationEmail('a@example.com', PAYLOAD, PAYLOAD, PAYLOAD, PAYLOAD);
    await service.sendRejectionEmail('a@example.com', PAYLOAD, PAYLOAD, PAYLOAD, PAYLOAD, 'https://axontickets.online/r/1');

    expect(sendMail).toHaveBeenCalledTimes(4);
    for (const call of sendMail.mock.calls) {
      const html: string = call[0].html;
      expect(html).not.toContain('<a href="https://evil.example">');
      expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    }
  });

  it('escapes attendee name and email in the QR ticket email', async () => {
    const { service, sendMail } = makeService();
    await service.sendQrCodeEmail('a@example.com', 'Lead', 'Event', 'Oct 1', 'Hall', [
      { firstName: PAYLOAD, lastName: 'X', email: PAYLOAD, qrToken: 'tok' },
      { firstName: PAYLOAD, lastName: 'Y', email: PAYLOAD, qrToken: null },
    ]);
    const html: string = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
  });
});
