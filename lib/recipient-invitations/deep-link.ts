const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function extractRecipientInvitationToken(value: string): string | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const token = segments.length === 2 && segments[0] === 'invite' ? segments[1]
      : url.protocol === 'kinwin:' && url.hostname === 'invite' && segments.length === 1 ? segments[0] : null;
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch { return null; }
}
