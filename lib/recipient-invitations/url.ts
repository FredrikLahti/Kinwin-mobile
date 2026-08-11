export function buildRecipientInvitationUrl(publicBaseUrl: string | undefined, token: string): string | null {
  const base = publicBaseUrl?.trim().replace(/\/+$/g, '');
  if (!base || !/^https:\/\//i.test(base) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return `${base}/invite/${encodeURIComponent(token)}`;
}
