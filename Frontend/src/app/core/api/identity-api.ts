import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

/** A sign-in an app started; the API answers 410 once it is unknown or expired. */
export interface InteractionDetails {
  uid: string;
  /** "login" asks who you are; "consent" only needs a call to consent(). */
  prompt: string;
  client: { id: string; name: string; uri: string | null };
  loginHint: string | null;
  locale: string | null;
}

export interface Redirect {
  redirectTo: string;
}

export interface NewAccount {
  givenName: string;
  familyName: string;
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  locale: string;
}

export interface AppLink {
  id: string;
  name: string;
  uri: string;
}

export interface Account {
  id: string;
  username: string;
  email: string;
  givenName: string;
  familyName: string;
  locale: string;
  createdAt: string;
  apps: AppLink[];
}

export type ProfileChanges = Partial<
  Pick<Account, 'username' | 'givenName' | 'familyName' | 'locale'>
>;

/** Where the API starts the account page's own sign-in (a full-page navigation). */
export function accountSignInUrl(lang: string): string {
  return `/api/account/sign-in?lang=${encodeURIComponent(lang)}`;
}

const interaction = (uid: string) => `/api/interaction/${encodeURIComponent(uid)}`;

@Injectable({ providedIn: 'root' })
export class IdentityApi {
  private readonly http = inject(HttpClient);

  interaction(uid: string): Observable<InteractionDetails> {
    return this.http.get<InteractionDetails>(`${interaction(uid)}/details`);
  }

  signIn(uid: string, login: string, password: string): Observable<Redirect> {
    return this.http.post<Redirect>(`${interaction(uid)}/login`, { login, password });
  }

  register(uid: string, account: NewAccount): Observable<Redirect> {
    return this.http.post<Redirect>(`${interaction(uid)}/register`, account);
  }

  consent(uid: string): Observable<Redirect> {
    return this.http.post<Redirect>(`${interaction(uid)}/consent`, {});
  }

  abort(uid: string): Observable<Redirect> {
    return this.http.post<Redirect>(`${interaction(uid)}/abort`, {});
  }

  account(): Observable<Account> {
    return this.http.get<Account>('/api/account');
  }

  updateProfile(changes: ProfileChanges): Observable<Account> {
    return this.http.patch<Account>('/api/account', changes);
  }

  changeEmail(email: string, password: string): Observable<Account> {
    return this.http.put<Account>('/api/account/email', { email, password });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>('/api/account/password', { currentPassword, newPassword });
  }

  signOut(): Observable<void> {
    return this.http.post<void>('/api/account/sign-out', {});
  }

  signOutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/account/sign-out-everywhere', {});
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>('/api/account', { body: { password } });
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>('/api/password-reset', { email });
  }

  confirmPasswordReset(token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/password-reset/confirm', { token, password });
  }
}
