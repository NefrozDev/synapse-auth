import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../config/app-config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Refuses state-changing requests sent by another site (CSRF): browsers send
 * an Origin (or at least a Referer) with them, which must be this site's.
 */
@Injectable()
export class AllowedOriginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const supplied =
      request.get('origin') ?? originOf(request.get('referer') ?? '');
    // Non-browser clients commonly send neither header; browsers always send
    // an Origin for cross-site requests, the case refused here.
    if (!supplied || supplied === this.config.publicOrigin) {
      return true;
    }
    throw new ForbiddenException('Request origin not allowed.');
  }
}
