import { UnauthorizedException } from '@nestjs/common';
import { OliviaIntegrationController } from './olivia-integration.controller';
import { OliviaIntegrationService } from './olivia-integration.service';

describe('OliviaIntegrationController', () => {
  const originalSecret = process.env.OLIVIA_INTEGRATION_SECRET;

  afterEach(() => {
    process.env.OLIVIA_INTEGRATION_SECRET = originalSecret;
  });

  it('rejects requests with an invalid or missing X-O7-Integration-Secret', () => {
    process.env.OLIVIA_INTEGRATION_SECRET = 'correct-secret';
    const service = { createOpportunity: jest.fn() } as unknown as OliviaIntegrationService;
    const controller = new OliviaIntegrationController(service);

    expect(() => controller.createOpportunity({}, 'wrong-secret')).toThrow(UnauthorizedException);
    expect(() => controller.createOpportunity({}, undefined)).toThrow(UnauthorizedException);
    expect(service.createOpportunity).not.toHaveBeenCalled();
  });

  it('rejects all requests when no secret is configured server-side', () => {
    delete process.env.OLIVIA_INTEGRATION_SECRET;
    const service = { createOpportunity: jest.fn() } as unknown as OliviaIntegrationService;
    const controller = new OliviaIntegrationController(service);

    expect(() => controller.createOpportunity({}, 'anything')).toThrow(UnauthorizedException);
  });

  it('forwards the payload to the service when the secret matches', () => {
    process.env.OLIVIA_INTEGRATION_SECRET = 'correct-secret';
    const service = { createOpportunity: jest.fn().mockReturnValue({ clientId: 'c1' }) } as unknown as OliviaIntegrationService;
    const controller = new OliviaIntegrationController(service);

    const payload = { sourceMailbox: 'sales@brand.com', sourceMessageId: 'msg-1' };
    const result = controller.createOpportunity(payload, 'correct-secret');

    expect(service.createOpportunity).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ clientId: 'c1' });
  });
});
