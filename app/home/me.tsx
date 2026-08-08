import AccountScreen from '@/app/account/index';

// Reuses the existing, real account screen (sign out, saved draft, pending
// commitment) as-is rather than duplicating its logic — the Me tab is a
// navigation entry point onto it, not a redesign. See PR description for
// the one known rough edge: its own back chevron, harmless but unnecessary
// as a tab root.
export default function MeV2() {
  return <AccountScreen />;
}
