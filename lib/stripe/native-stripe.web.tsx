import { ReactNode } from 'react';

// Web build of '@/lib/stripe/native-stripe' (see native-stripe.tsx). Never
// imports the real @stripe/stripe-react-native package at runtime — that
// package's native module spec calls `TurboModuleRegistry.getEnforcing`
// at import time, which throws immediately outside a real native runtime.
// PaymentSheet is a native-only feature; this file exists purely so the
// app-owned consent/status screens can still render on Expo Web for visual
// review, with every Stripe call resolving to an honest "native required"
// outcome instead of ever attempting a real (or fake) payment sheet.

type StripeProviderProps = {
  readonly children: ReactNode;
  readonly publishableKey?: string;
  readonly urlScheme?: string;
};

export function StripeProvider({ children }: StripeProviderProps) {
  return <>{children}</>;
}

const nativeRequiredError = {
  code: 'Failed' as const,
  message: 'Payment setup requires the Kinwin app on a phone or tablet — it is not available on web.',
};

export function usePaymentSheet() {
  return {
    loading: false,
    initPaymentSheet: async (_params?: unknown) => ({ error: nativeRequiredError }),
    presentPaymentSheet: async (_options?: unknown) => ({ error: nativeRequiredError }),
  };
}

export function useStripe() {
  return {
    handleURLCallback: async (_url: string): Promise<boolean> => false,
  };
}

export const PAYMENT_SHEET_NATIVE_SUPPORT = false;
