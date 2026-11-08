import type { Locale } from '../accounts/locales';
import type { OutgoingMail } from '../mail/mail.service';

interface ResetMailText {
  subject: string;
  greeting: (name: string) => string;
  body: string;
  expiry: (minutes: number) => string;
  ignore: string;
}

/** In the account's language. Plano's six, so its accounts keep theirs. */
const TEXTS: Record<Locale, ResetMailText> = {
  fr: {
    subject: 'Réinitialiser votre mot de passe Synapse',
    greeting: (name) => `Bonjour ${name},`,
    body: 'Pour choisir un nouveau mot de passe, ouvrez ce lien :',
    expiry: (minutes) =>
      `Il reste valable ${minutes} minutes et ne sert qu’une fois.`,
    ignore:
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.',
  },
  en: {
    subject: 'Reset your Synapse password',
    greeting: (name) => `Hello ${name},`,
    body: 'To choose a new password, open this link:',
    expiry: (minutes) =>
      `It stays valid for ${minutes} minutes and works once.`,
    ignore:
      'If you did not ask for this, ignore this e-mail: your password does not change.',
  },
  nl: {
    subject: 'Je Synapse-wachtwoord opnieuw instellen',
    greeting: (name) => `Hallo ${name},`,
    body: 'Open deze link om een nieuw wachtwoord te kiezen:',
    expiry: (minutes) =>
      `Hij blijft ${minutes} minuten geldig en werkt maar één keer.`,
    ignore:
      'Heb je dit niet gevraagd? Negeer dan deze e-mail: je wachtwoord verandert niet.',
  },
  es: {
    subject: 'Restablecer tu contraseña de Synapse',
    greeting: (name) => `Hola ${name}:`,
    body: 'Para elegir una nueva contraseña, abre este enlace:',
    expiry: (minutes) =>
      `Es válido durante ${minutes} minutos y solo funciona una vez.`,
    ignore:
      'Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.',
  },
  de: {
    subject: 'Synapse-Passwort zurücksetzen',
    greeting: (name) => `Hallo ${name},`,
    body: 'Öffne diesen Link, um ein neues Passwort zu wählen:',
    expiry: (minutes) =>
      `Er ist ${minutes} Minuten gültig und funktioniert nur einmal.`,
    ignore:
      'Wenn du das nicht angefordert hast, ignoriere diese E-Mail: Dein Passwort bleibt unverändert.',
  },
  it: {
    subject: 'Reimposta la tua password di Synapse',
    greeting: (name) => `Ciao ${name},`,
    body: 'Per scegliere una nuova password, apri questo link:',
    expiry: (minutes) =>
      `Resta valido per ${minutes} minuti e funziona una sola volta.`,
    ignore:
      'Se non sei stato tu a chiederlo, ignora questa e-mail: la tua password non cambia.',
  },
};

export function passwordResetMail(details: {
  to: string;
  name: string;
  locale: Locale;
  link: string;
  validMinutes: number;
}): OutgoingMail {
  const text = TEXTS[details.locale] ?? TEXTS.fr;
  return {
    to: details.to,
    subject: text.subject,
    text: [
      text.greeting(details.name),
      '',
      text.body,
      details.link,
      '',
      text.expiry(details.validMinutes),
      '',
      text.ignore,
      '',
      '— Synapse Engineering',
    ].join('\n'),
  };
}
