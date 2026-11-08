import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  type CurrentSession,
  OidcSessionsService,
} from '../oidc/oidc-sessions.service';

interface RequestWithSession extends Request {
  synapseSession?: CurrentSession;
}

/** Lets through only a browser signed in to the provider; 401 otherwise. */
@Injectable()
export class AccountSessionGuard implements CanActivate {
  constructor(private readonly sessions: OidcSessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithSession>();
    const session = await this.sessions.current(
      request,
      http.getResponse<Response>(),
    );
    if (!session) {
      throw new UnauthorizedException();
    }
    request.synapseSession = session;
    return true;
  }
}

/** The session AccountSessionGuard found. */
export const SignedIn = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentSession => {
    const session = context
      .switchToHttp()
      .getRequest<RequestWithSession>().synapseSession;
    if (!session) {
      throw new UnauthorizedException();
    }
    return session;
  },
);
