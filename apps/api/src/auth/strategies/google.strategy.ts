import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('google.clientId') ?? '';
    const clientSecret = config.get<string>('google.clientSecret') ?? '';
    const callbackURL = config.get<string>('google.callbackUrl') ?? 'http://localhost:3001/api/v1/auth/google/callback';

    // passport-google-oauth20 throws if clientID/clientSecret are empty.
    // Use placeholder values when not configured so the app boots normally;
    // the /auth/google routes will simply return 500 until real creds are set.
    super({
      clientID: clientID || 'GOOGLE_NOT_CONFIGURED',
      clientSecret: clientSecret || 'GOOGLE_NOT_CONFIGURED',
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const { id, name, emails, photos } = profile;
    done(null, {
      googleId: id,
      email: emails?.[0]?.value ?? '',
      firstName: name?.givenName ?? '',
      lastName: name?.familyName ?? '',
      avatarUrl: photos?.[0]?.value ?? null,
    });
  }
}
