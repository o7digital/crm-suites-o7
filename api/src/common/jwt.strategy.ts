import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  tenantId?: string;
  tenant_id?: string;
  email?: string;
  user_metadata?: Record<string, any>;
  [key: string]: any;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('SUPABASE_JWT_SECRET') ||
        configService.get<string>('JWT_SECRET') ||
        'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const tenantId = payload.tenant_id || payload.tenantId || payload.sub;
    const name =
      (payload.user_metadata && payload.user_metadata.name) ||
      payload.name ||
      payload.email ||
      'User';
    const tenantName = payload.user_metadata?.tenant_name;
    return { userId: payload.sub, tenantId, email: payload.email, name, tenantName };
  }
}
