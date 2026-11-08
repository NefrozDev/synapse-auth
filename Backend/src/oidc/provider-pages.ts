import type { KoaContextWithOIDC } from 'oidc-provider';

/**
 * The few pages the provider draws itself (sign-out and errors). Everything
 * else is the Angular app. They are plain HTML in the site's colours.
 */

function escapeHtml(value: string | undefined): string {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f5f3ff; color: #1e1b4b; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 420px; margin: 24px; padding: 32px; border-radius: 20px;
    background: #fff; box-shadow: 0 8px 30px rgb(30 27 75 / 0.08); text-align: center; }
  h1 { margin: 0 0 12px; font-size: 1.4rem; }
  p { margin: 0 0 20px; color: #4c4a6b; }
  button, a.button { display: inline-block; padding: 12px 20px; border: 0; border-radius: 12px;
    background: #4f46e5; color: #fff; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/**
 * Signing out of an app signs out of every Synapse app: the form posts
 * `logout=yes` by itself, and the button is there if scripts are off.
 */
export function logoutPage(ctx: KoaContextWithOIDC, form: string): void {
  ctx.type = 'html';
  ctx.body = page(
    'Déconnexion',
    `<h1>Déconnexion…</h1>
     <p>Tu vas être déconnecté de toutes les applications Synapse.</p>
     ${form}
     <button type="submit" form="op.logoutForm" name="logout" value="yes">Se déconnecter</button>
     <script>
       const form = document.getElementById('op.logoutForm');
       const all = document.createElement('input');
       all.type = 'hidden'; all.name = 'logout'; all.value = 'yes';
       form.appendChild(all);
       form.submit();
     </script>`,
  );
}

/** After a sign-out that named no app to return to. */
export function signedOutRedirect(publicUrl: string) {
  return (ctx: KoaContextWithOIDC): void => {
    ctx.redirect(`${publicUrl}/signed-out`);
  };
}

export function errorPage(publicUrl: string) {
  return (
    ctx: KoaContextWithOIDC,
    out: { error: string; error_description?: string },
  ): void => {
    ctx.type = 'html';
    ctx.body = page(
      'Erreur de connexion',
      `<h1>La connexion n’a pas abouti</h1>
       <p>${escapeHtml(out.error_description ?? out.error)}</p>
       <a class="button" href="${escapeHtml(publicUrl)}/account">Mon compte</a>`,
    );
  };
}
