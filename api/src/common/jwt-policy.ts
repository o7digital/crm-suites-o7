import { ConfigService } from '@nestjs/config';

export function isProduction(config: ConfigService) {
  return (
    config.get<string>('NODE_ENV') === 'production' ||
    config.get<string>('RAILWAY_ENVIRONMENT_NAME') === 'production'
  );
}
export function requireStrongSecret(secret: string | undefined, name: string) {
  if (
    !secret ||
    Buffer.byteLength(secret) < 32 ||
    /^(dev-secret|change-me|your-|example|test-secret)/i.test(secret)
  ) {
    throw new Error(`${name} must be a strong secret of at least 32 bytes`);
  }
}
export function localJwtOptions(config: ConfigService) {
  const production = isProduction(config);
  const secret =
    config.get<string>('JWT_SECRET') || (production ? '' : 'dev-secret');
  const issuer = config.get<string>('JWT_ISSUER')?.trim();
  const audience = config.get<string>('JWT_AUDIENCE')?.trim();
  if (production) {
    requireStrongSecret(secret, 'JWT_SECRET');
    if (!issuer || !audience)
      throw new Error('JWT_ISSUER and JWT_AUDIENCE are required in production');
  }
  return {
    secret,
    signOptions: {
      expiresIn: '7d' as const,
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
    },
  };
}

export function jwtProfile(
  config: ConfigService,
  issuer: unknown,
  alg: string,
) {
  const production = isProduction(config);
  const profiles = [
    {
      issuer: config.get<string>('JWT_ISSUER')?.trim(),
      audience: config.get<string>('JWT_AUDIENCE')?.trim(),
      secret: config.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      name: 'JWT',
    },
    {
      issuer: config.get<string>('SUPABASE_JWT_ISSUER')?.trim(),
      audience: config.get<string>('SUPABASE_JWT_AUDIENCE')?.trim(),
      secret: config.get<string>('SUPABASE_JWT_SECRET'),
      algorithms: ['HS256', 'RS256', 'ES256'],
      name: 'SUPABASE_JWT',
    },
    {
      issuer: config.get<string>('CLERK_JWT_ISSUER')?.trim(),
      audience: config.get<string>('CLERK_JWT_AUDIENCE')?.trim(),
      secret: undefined,
      algorithms: ['RS256'],
      name: 'CLERK_JWT',
    },
  ];
  const profile = profiles.find((p) => p.issuer && p.issuer === issuer);
  if (!profile) {
    if (!production && !issuer && alg === 'HS256')
      return {
        ...profiles[0],
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
      };
    throw new Error('JWT issuer not allowed');
  }
  if (!profile.algorithms.includes(alg))
    throw new Error('Unsupported JWT algorithm');
  if (production && !profile.audience)
    throw new Error(`${profile.name}_AUDIENCE is required in production`);
  if (alg === 'HS256' && production)
    requireStrongSecret(profile.secret, `${profile.name}_SECRET`);
  if (alg === 'HS256' && !profile.secret)
    throw new Error('JWT signing secret is not configured');
  return profile;
}
