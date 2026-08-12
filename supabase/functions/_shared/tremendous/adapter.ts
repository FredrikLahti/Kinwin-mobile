import type { TremendousFulfillment, TremendousGeneratedLinkResult, TremendousReconciliationResult, TremendousResult } from './types.ts';

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
  if (!validSandboxBaseUrl(apiBaseUrl) || !apiKey.startsWith('TEST_') || !fundingSourceId || !campaignId) return null;
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
      if (typeof orderId !== 'string' || typeof rewardId !== 'string') {
        return { ok: false, retryable: true, code: 'malformed_response' };
      }
      return { ok: true, reward: { orderId, rewardId } };
    } catch (error) {
      return { ok: false, retryable: true, code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error' };
    } finally {
      clearTimeout(timeout);
    }
  };
}


export function createTremendousReconciliationAdapter(config: TremendousConfig, fetcher: Fetcher = fetch, timeoutMs = 15_000) {
  return async (rewardId: string, expectedOrderId: string): Promise<TremendousReconciliationResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${config.apiBaseUrl}/api/v2/rewards/${encodeURIComponent(rewardId)}`, {
        method: 'GET', signal: controller.signal, headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 404) return { kind: 'failure', retryable: false, code: 'unknown_provider_reward', providerStatus: null };
        return { kind: 'failure', retryable: response.status === 408 || response.status === 429 || response.status >= 500, code: `http_${response.status}`, providerStatus: null };
      }
      const body = await response.json().catch(() => null) as Record<string, any> | null;
      const reward = body?.reward ?? body;
      const returnedRewardId = reward?.id;
      const returnedOrderId = reward?.order_id ?? reward?.order?.id ?? null;
      const method = typeof reward?.delivery?.method === 'string' ? reward.delivery.method.toUpperCase() : null;
      const status = typeof reward?.delivery?.status === 'string' ? reward.delivery.status.toUpperCase() : null;
      if (returnedRewardId !== rewardId || (returnedOrderId !== null && returnedOrderId !== expectedOrderId)) return { kind: 'failure', retryable: false, code: 'provider_identity_mismatch', providerStatus: status };
      if (method !== 'LINK') return { kind: 'failure', retryable: false, code: 'unsupported_delivery_method', providerStatus: status };
      if (status === 'SUCCEEDED') return { kind: 'ready', providerStatus: 'SUCCEEDED' };
      if (status === 'PENDING' || status === 'SCHEDULED') return { kind: 'processing', providerStatus: status };
      if (status === 'FAILED') return { kind: 'failure', retryable: false, code: 'provider_delivery_failed', providerStatus: status };
      return { kind: 'failure', retryable: false, code: status ? 'unknown_delivery_status' : 'malformed_response', providerStatus: status };
    } catch (error) {
      return { kind: 'failure', retryable: true, code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error', providerStatus: null };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createTremendousGenerateLinkAdapter(config: TremendousConfig, fetcher: Fetcher = fetch, timeoutMs = 15_000) {
  return async (rewardId: string): Promise<TremendousGeneratedLinkResult> => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${config.apiBaseUrl}/api/v2/rewards/${encodeURIComponent(rewardId)}/generate_link`, {
        method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      });
      if (!response.ok) return { ok: false, retryable: response.status === 408 || response.status === 429 || response.status >= 500, code: `http_${response.status}` };
      const body = await response.json().catch(() => null) as Record<string, any> | null;
      const reward = body?.reward ?? body;
      const returnedRewardId = reward?.id;
      const url = reward?.delivery?.link ?? reward?.link;
      if (returnedRewardId !== rewardId || typeof url !== 'string' || !url.startsWith('https://')) return { ok: false, retryable: false, code: 'malformed_link_response' };
      return { ok: true, url };
    } catch (error) {
      return { ok: false, retryable: true, code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error' };
    } finally { clearTimeout(timeout); }
  };
}
