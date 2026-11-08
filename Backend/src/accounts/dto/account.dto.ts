import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_PATTERN,
} from '../identifiers';
import { SUPPORTED_LOCALES, type Locale } from '../locales';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @IsString()
  @Transform(trimString)
  @Matches(USERNAME_PATTERN, { message: USERNAME_FORMAT_MESSAGE })
  username: string;

  @IsEmail()
  @Transform(trimString)
  @Length(3, 254)
  email: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password: string;

  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  givenName: string;

  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  familyName: string;

  @IsBoolean()
  @Equals(true, { message: 'acceptedTerms must be true' })
  acceptedTerms: boolean;

  /** The language the pages were in while registering. */
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}

export class LoginDto {
  /** A username or an e-mail address. */
  @IsString()
  @Length(1, 254)
  login: string;

  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password: string;
}

export class ProfileDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Matches(USERNAME_PATTERN, { message: USERNAME_FORMAT_MESSAGE })
  username?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  givenName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  familyName?: string;

  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}

export class EmailChangeDto {
  @IsEmail()
  @Transform(trimString)
  @Length(3, 254)
  email: string;

  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password: string;
}

export class PasswordChangeDto {
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class PasswordConfirmationDto {
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password: string;
}
