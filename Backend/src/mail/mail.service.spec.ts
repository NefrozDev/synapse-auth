import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

// ES modules: a named import cannot be spied on, so nodemailer is mocked.
const sendMail = vi.fn().mockResolvedValue({});
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail })),
}));

describe('MailService', () => {
  const mail = { to: 'ada@example.com', subject: 'Hi', text: 'Hello' };

  afterEach(() => vi.clearAllMocks());

  it('sends nothing, and says so, without SMTP_HOST', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new MailService(new ConfigService({}));

    expect(service.enabled).toBe(false);
    await service.send(mail);

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('uses implicit TLS on 465 and sends from MAIL_FROM', async () => {
    const service = new MailService(
      new ConfigService({
        SMTP_HOST: ' mail.example.com ',
        SMTP_PORT: '465',
        SMTP_USER: 'no-reply@example.com',
        SMTP_PASSWORD: 'secret',
        MAIL_FROM: 'Plano <no-reply@example.com>',
      }),
    );

    await service.send(mail);

    expect(service.enabled).toBe(true);
    expect(createTransport).toHaveBeenCalledExactlyOnceWith({
      host: 'mail.example.com',
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: 'no-reply@example.com', pass: 'secret' },
    });
    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      from: 'Plano <no-reply@example.com>',
      ...mail,
    });
  });

  it('requires STARTTLS on other ports, and sends from the SMTP user by default', async () => {
    const service = new MailService(
      new ConfigService({
        SMTP_HOST: 'mail.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'no-reply@example.com',
      }),
    );

    await service.send(mail);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'no-reply@example.com' }),
    );
  });

  it('connects without credentials when no SMTP user is set, on 465 by default', () => {
    new MailService(new ConfigService({ SMTP_HOST: 'relay.example.com' }));

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, auth: undefined }),
    );
  });

  it('lets sending failures reach the caller', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));
    const service = new MailService(
      new ConfigService({ SMTP_HOST: 'mail.example.com' }),
    );

    await expect(service.send(mail)).rejects.toThrow('SMTP down');
  });
});
