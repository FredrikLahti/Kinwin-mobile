/**
 * Builds the password-reset redirect URL from the same public web origin
 * the recipient-invitation web fallback already uses (see
 * lib/recipient-invitations/url.ts's identical shape) — an https:// origin
 * works everywhere today (opens the web export in any browser) and will
 * transparently start opening natively once Universal Links / Android App
 * Links are fully configured, without any change here. Deliberately not a
 * custom `kinwin://` scheme: many mail clients refuse to open non-http(s)
 * links from a message body.
 */
export function buildPasswordResetRedirectUrl(publicBaseUrl: string | undefined): string | null {
  const base = publicBaseUrl?.trim().replace(/\/+$/g, '');
  if (!base || !/^https:\/\//i.test(base)) return null;
  return `${base}/auth/reset-password`;
}
