import { ServiceUnavailableException } from '@nestjs/common';

export const SCOPES = ['pulse:read', 'pulse:write', 'offline_access'];
export function connectConfig() {
  if (process.env.PULSE_CONNECT_ENABLED !== 'true')
    throw new ServiceUnavailableException('Pulse Connect disabled');
  const origin = process.env.PULSE_CONNECT_ORIGIN || '';
  const frontend = process.env.PULSE_CONNECT_FRONTEND || '';
  const clientId = process.env.PULSE_CONNECT_CLIENT_ID || '';
  const redirects = (process.env.PULSE_CONNECT_REDIRECT_URIS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const value of [origin, frontend, ...redirects]) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Pulse Connect URL configuration',
      );
    }
    if (
      url.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    ) {
      throw new ServiceUnavailableException('Pulse Connect requires HTTPS');
    }
    if (url.username || url.password || url.hash)
      throw new ServiceUnavailableException('Invalid Pulse Connect URL');
  }
  if (
    !clientId ||
    new URL(origin).origin !== origin ||
    new URL(frontend).origin !== frontend
  )
    throw new ServiceUnavailableException('Pulse Connect not configured');
  return {
    origin,
    frontend,
    clientId,
    redirects,
    resource: `${origin}/api/mcp`,
  };
}
