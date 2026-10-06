import nodemailer from 'nodemailer';
import { SignatureMailService } from './signature-mail.service';
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
describe('workspace signature mail transport', () => {
  const sendMail = jest.fn(async () => ({ accepted: ['client@example.test'] }));
  const prisma = { tenant: { findUnique: jest.fn() } };
  const service = new SignatureMailService(prisma as any);
  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockResolvedValue({ accepted: ['client@example.test'] });
  });
  const configured = {
    name: 'Workspace',
    marketingSetup: {
      provider: 'MAILCOW',
      fromName: 'Clinic',
      fromEmail: 'clinic@example.test',
      replyTo: 'reply@example.test',
      smtp: {
        host: 'mail.example.test',
        port: 465,
        username: 'clinic',
        password: 'private-secret',
      },
    },
  };
  it('uses only the requested tenant connector and never exposes credentials', async () => {
    prisma.tenant.findUnique.mockResolvedValue(configured);
    expect(await service.status('clinic-id')).toEqual({
      configured: true,
      provider: 'MAILCOW',
      fromEmail: 'clinic@example.test',
    });
    await service.send(
      'clinic-id',
      'client@example.test',
      'Signature',
      'content',
      Buffer.from('PDF'),
    );
    expect(prisma.tenant.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'clinic-id' },
      select: { name: true, marketingSetup: true },
    });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'mail.example.test',
        port: 465,
        secure: true,
        auth: { user: 'clinic', pass: 'private-secret' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Clinic', address: 'clinic@example.test' },
        replyTo: 'reply@example.test',
        attachments: [
          expect.objectContaining({ contentType: 'application/pdf' }),
        ],
      }),
    );
  });
  it('requires a complete per-workspace connector even with global SMTP variables', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      marketingSetup: { provider: 'SMTP', smtp: { host: 'host' } },
    });
    process.env.SMTP_HOST = 'global';
    await expect(
      service.send('empty', 'client@example.test', 'title', 'body'),
    ).rejects.toThrow('Configure the SMTP/Mailcow');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    delete process.env.SMTP_HOST;
  });
  it('reports mail rejection', async () => {
    prisma.tenant.findUnique.mockResolvedValue(configured);
    sendMail.mockResolvedValueOnce({ accepted: [] });
    await expect(
      service.send('clinic-id', 'client@example.test', 'title', 'body'),
    ).rejects.toThrow('did not accept');
  });
});
