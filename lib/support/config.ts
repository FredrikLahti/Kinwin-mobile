export type SupportConfig = {
  readonly email: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * No support address is invented here — if EXPO_PUBLIC_SUPPORT_EMAIL isn't
 * set to a real-looking address, the Support screen honestly reports itself
 * as not configured yet rather than shipping a fake or placeholder contact.
 */
export function readSupportConfig(): SupportConfig | null {
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  return { email };
}
