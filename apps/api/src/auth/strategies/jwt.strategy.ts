import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@axon-tickets/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const publicKey = config.get<string>('jwt.publicKey');
    if (!publicKey) {
      throw new Error('JWT public key is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // Refresh tokens carry a `jti` and are signed with the same key. They may only be exchanged
    // at POST /auth/refresh; they must never work as a bearer token on normal API routes.
    if ((payload as JwtPayload & { jti?: string }).jti) {
      throw new UnauthorizedException('Invalid token type');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
    };
  }
}
