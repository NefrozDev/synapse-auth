import { Routes } from '@angular/router';

/**
 * The provider sends browsers to /api/interaction/:uid, which redirects to
 * /interaction/:uid: the sign-in an app asked for. Everything else is the
 * account itself.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'account' },
  {
    path: 'interaction/:uid',
    title: 'titles.signIn',
    loadComponent: () => import('./features/interaction/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    path: 'interaction/:uid/sign-up',
    title: 'titles.signUp',
    loadComponent: () => import('./features/interaction/sign-up/sign-up').then((m) => m.SignUp),
  },
  {
    path: 'forgot-password',
    title: 'titles.forgotPassword',
    loadComponent: () =>
      import('./features/password/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    title: 'titles.resetPassword',
    loadComponent: () =>
      import('./features/password/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'account',
    title: 'titles.account',
    loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'signed-out',
    title: 'titles.signedOut',
    loadComponent: () => import('./features/signed-out/signed-out').then((m) => m.SignedOut),
  },
  {
    path: 'terms',
    title: 'titles.terms',
    loadComponent: () => import('./features/terms/terms').then((m) => m.Terms),
  },
  { path: '**', redirectTo: 'account' },
];
