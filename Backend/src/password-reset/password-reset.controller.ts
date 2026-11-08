import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../accounts/identifiers';
import { AllowedOriginGuard } from '../security/allowed-origin.guard';
import { SENSITIVE_THROTTLE } from '../security/rate-limits';
import { PasswordResetService } from './password-reset.service';

export class ResetRequestDto {
  @IsEmail()
  @Length(3, 254)
  email: string;
}

export class ResetConfirmationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token is malformed' })
  token: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password: string;
}

@Controller('password-reset')
@UseGuards(AllowedOriginGuard)
@Throttle(SENSITIVE_THROTTLE)
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /** Always 204, whether or not the address has an account. */
  @Post()
  @HttpCode(204)
  async request(@Body() body: ResetRequestDto): Promise<void> {
    await this.resets.request(body.email);
  }

  @Post('confirm')
  @HttpCode(204)
  async confirm(@Body() body: ResetConfirmationDto): Promise<void> {
    await this.resets.confirm(body.token, body.password);
  }
}
