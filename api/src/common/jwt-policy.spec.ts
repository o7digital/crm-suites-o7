import { ConfigService } from '@nestjs/config';
import { jwtProfile, localJwtOptions } from './jwt-policy';
const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as ConfigService;
describe('production JWT configuration', () => {
  it.each(['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE'])(
    'fails startup if %s is missing',
    (missing) => {
      const values = {
        NODE_ENV: 'production',
        JWT_SECRET: 'strong-production-test-value-at-least-32-bytes',
        JWT_ISSUER: 'https://pulse.test',
        JWT_AUDIENCE: 'pulse',
      };
      delete values[missing];
      expect(() => localJwtOptions(config(values))).toThrow();
    },
  );
  it('treats Railway production as production even without NODE_ENV', () => {
    expect(() =>
      localJwtOptions(config({ RAILWAY_ENVIRONMENT_NAME: 'production' })),
    ).toThrow();
  });
  it('requires audience for trusted asymmetric providers before looking up keys', () => {
    expect(() =>
      jwtProfile(
        config({
          NODE_ENV: 'production',
          CLERK_JWT_ISSUER: 'https://clerk.test',
        }),
        'https://clerk.test',
        'RS256',
      ),
    ).toThrow('AUDIENCE');
  });
  it('supports configured Supabase EC signing without trusting arbitrary issuers', () => {
    const profile = jwtProfile(
      config({
        NODE_ENV: 'production',
        SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
      }),
      'https://project.supabase.co/auth/v1',
      'ES256',
    );
    expect(profile.audience).toBe('authenticated');
  });
});
