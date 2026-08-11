import type { TremendousFulfillment, TremendousReconciliationResult, TremendousResult } from './types.ts';

export type TremendousConfig = {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
  readonly fundingSourceId: string;
  readonly campaignId: string;
};

export type TremendousReconciliationConfig = TremendousConfig & {
  readonly readyRewardStatuses: ReadonlySet<string>;
  readonly rewardPathTemplate: string;
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

export function readTremendousReconciliationConfig(get: (name: string) => string | undefined): TremendousReconciliationConfig | null {
  const base = readTremendousSandboxConfig(get);
  const statuses = (get('TREMENDOUS_READY_REWARD_STATUSES') ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  const rewardPathTemplate = get('TREMENDOUS_REWARD_PATH_TEMPLATE') ?? '';
  if (!base || statuses.length === 0 || !rewardPathTemplate.startsWith('/') || !rewardPathTemplate.includes('{rewardId}')) return null;
  return { ...base, readyRewardStatuses: new Set(statuses), rewardPathTemplate };
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


export function createTremendousReconciliationAdapter(config: TremendousReconciliationConfig, fetcher: Fetcher = fetch, timeoutMs = 15_000) {
  return async (rewardId: string): Promise<TremendousReconciliationResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const rewardPath = config.rewardPathTemplate.replace('{rewardId}', encodeURIComponent(rewardId));
      const response = await fetcher(`${config.apiBaseUrl}${rewardPath}`, {
        method: 'GET', signal: controller.signal, headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 404) return { kind: 'failure', retryable: false, code: 'unknown_provider_reward', providerStatus: null };
        return { kind: 'failure', retryable: response.status === 408 || response.status === 429 || response.status >= 500, code: `http_${response.status}`, providerStatus: null };
      }
      const body = await response.json().catch(() => null) as Record<string, any> | null;
      const reward = body?.reward ?? body;
      const status = typeof reward?.status === 'string' ? reward.status.toUpperCase() : null;
      if (!status) return { kind: 'failure', retryable: true, code: 'malformed_response', providerStatus: null };
      if (!config.readyRewardStatuses.has(status)) return { kind: 'processing', providerStatus: status };
      const redemptionUrl = reward?.delivery?.link ?? reward?.redemption_url;
      if (typeof redemptionUrl !== 'string' || !redemptionUrl.startsWith('https://')) {
        return { kind: 'failure', retryable: true, code: 'ready_without_artifact', providerStatus: status };
      }
      return { kind: 'ready', providerStatus: status, redemptionUrl };
    } catch (error) {
      return { kind: 'failure', retryable: true, code: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error', providerStatus: null };
    } finally {
      clearTimeout(timeout);
    }
  };
}
