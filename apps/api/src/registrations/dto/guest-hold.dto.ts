import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { RESUME_TOKEN_PATTERN } from '../guest-hold.service';

/** Body of POST /registrations/guest/:id/save-for-later. */
export class SaveForLaterDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;
}

/**
 * Body of POST /registrations/guest/resume. The pattern rejects malformed input
 * before any signature or database work.
 */
export class ResumeGuestDto {
  @IsString()
  @MaxLength(512)
  @Matches(RESUME_TOKEN_PATTERN, { message: 'This link is no longer valid.' })
  token!: string;
}
