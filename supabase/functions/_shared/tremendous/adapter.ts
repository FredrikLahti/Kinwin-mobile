import type { TremendousFulfillment, TremendousResult } from './types.ts';

export type TremendousConfig = {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
  readonly fundingSourceId: string;
  readonly campaignId: string;
};

type Fetcher = typeof fetch;

function validSandboxBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'testflight.tremendous.com';
  } catch {
    return false;
  }
}

export function readTremendousSandboxConfig(get: (name: string) => string | undefined): TremendousConfig | null {
  const apiBaseUrl = get('TREMENDOUS_API_BASE_URL')?.replace(/\/$/, '') ?? '';
  const apiKey = get('TREMENDOUS_API_KEY') ?? '';
  const fundingSourceId = get('TREMENDOUS_FUNDING_SOURCE_ID') ?? '';
  const campaignId = get('TREMENDOUS_CAMPAIGN_ID') ?? '';
  if (!validSandboxBaseUrl(apiBaseUrl) || !apiKey || !fundingSourceId || !campaignId) return null;
  return { apiBaseUrl, apiKey, fundingSourceId, campaignId };
}

export function createTremendousSandboxAdapter(config: TremendousConfig, fetcher: Fetcher = fetch, timeoutMs = 15_000) {
  return async (item: TremendousFulfillment): Promise<TremendousResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${config.apiBaseUrl}/api/v2/orders`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify({
          external_id: item.idempotencyKey,
          payment: { funding_source_id: config.fundingSourceId },
          reward: {
            campaign_id: config.campaignId,
            value: { denomination: item.amountMinorUnits / 100, currency_code: item.currency },
            delivery: { method: 'LINK' },
            recipient: { name: item.organizerName },
          },
        }),
      });
      if (!response.ok) {
        return { ok: false, retryable: response.status === 408 || response.status === 429 || response.status >= 500, code: `http_${response.status}` };
      }
      const body = await response.json().catch(() => null) as Record<string, any> | null;
      const orderId = body?.order?.id ?? body?.id;
      const reward = body?.order?.rewards?.[0] ?? body?.reward ?? body?.rewards?.[0];
      const rewardId = reward?.id;
      const redemptionUrl = reward?.delivery?.link ?? reward?.redemption_url;
      if (typeof orderId !== 'string' || typeof rewardId !== 'string' || typeof redemptionUrl !== 'string' || !redemptionUrl.startsWith('https://')) {
        return { ok: false, retryable: true, code: 'malformed_response' };
      }
      return { ok: true, reward: { orderId, rewardId, redemptionUrl } };
    } catch (error) {
      return { ok: false, retryable: true, code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error' };
    } finally {
      clearTimeout(timeout);
    }
  };
}
