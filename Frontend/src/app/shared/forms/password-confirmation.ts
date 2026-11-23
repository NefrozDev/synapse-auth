import { type SchemaPath, required, validate } from '@angular/forms/signals';

/**
 * A new password typed a second time, so a typo does not lock the person out. Only `required`
 * speaks while it is empty; the mismatch is checked again whenever either field changes.
 */
export function confirmsPassword(
  confirmation: SchemaPath<string>,
  password: SchemaPath<string>,
): void {
  required(confirmation, { message: 'errors.required' });
  validate(confirmation, ({ value, valueOf }) =>
    !value() || value() === valueOf(password)
      ? null
      : { kind: 'passwordMismatch', message: 'errors.passwordMismatch' },
  );
}
