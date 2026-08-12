const IPV4_LITERAL_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

function parseInvitationOrigin(rawValue) {
  let url;
  try { url = new URL(rawValue ?? ''); } catch { throw new Error('must be a valid URL'); }
  if (url.protocol !== 'https:') throw new Error('must use https');
  if (url.port) throw new Error('must not include a port');
  if (url.pathname !== '/') throw new Error('must not include a path (the app appends /invite/{token})');
  if (url.search) throw new Error('must not include a query');
  if (url.hash) throw new Error('must not include a fragment');
  if (url.username || url.password) throw new Error('must not include credentials');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('must not be localhost');
  if (hostname === '127.0.0.1' || hostname === '::1' || IPV4_LITERAL_PATTERN.test(hostname) || hostname.includes(':')) {
    throw new Error('must not be an IP literal');
  }
  return { host: url.host, hostname };
}

module.exports = { parseInvitationOrigin };
