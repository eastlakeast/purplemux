import type {
  IRateLimitWindow,
  IRateLimitsCache,
  IRateLimitsData,
  TRateLimitsProvider,
} from '@/types/status';

export const RATE_LIMIT_PERIOD_SECONDS = {
  five_hour: 5 * 60 * 60,
  seven_day: 7 * 24 * 60 * 60,
} as const;

export type TRateLimitPeriod = keyof typeof RATE_LIMIT_PERIOD_SECONDS;

export interface IEffectiveRateLimitWindow {
  used_percentage: number;
  resets_at: number;
  resets_at_iso: string;
  resets_in_seconds: number;
}

export interface IProviderUsage {
  updated_at: number;
  updated_at_iso: string;
  five_hour: IEffectiveRateLimitWindow | null;
  seven_day: IEffectiveRateLimitWindow | null;
}

export interface IRateLimitsUsage {
  providers: Record<TRateLimitsProvider, IProviderUsage | null>;
}

export const getEffectiveRateLimitWindow = (
  window: IRateLimitWindow,
  period: TRateLimitPeriod,
  nowSeconds = Date.now() / 1000,
): IEffectiveRateLimitWindow => {
  if (window.resets_at > nowSeconds) {
    return {
      used_percentage: window.used_percentage,
      resets_at: window.resets_at,
      resets_at_iso: new Date(window.resets_at * 1000).toISOString(),
      resets_in_seconds: Math.max(0, Math.ceil(window.resets_at - nowSeconds)),
    };
  }

  const periodSeconds = RATE_LIMIT_PERIOD_SECONDS[period];
  const elapsed = nowSeconds - window.resets_at;
  const resetsAt = window.resets_at + (Math.floor(elapsed / periodSeconds) + 1) * periodSeconds;
  return {
    used_percentage: 0,
    resets_at: resetsAt,
    resets_at_iso: new Date(resetsAt * 1000).toISOString(),
    resets_in_seconds: Math.max(0, Math.ceil(resetsAt - nowSeconds)),
  };
};

const buildProviderUsage = (
  data: IRateLimitsData | null | undefined,
  nowSeconds: number,
): IProviderUsage | null => {
  if (!data || (!data.five_hour && !data.seven_day)) return null;
  return {
    updated_at: data.ts,
    updated_at_iso: new Date(data.ts * 1000).toISOString(),
    five_hour: data.five_hour
      ? getEffectiveRateLimitWindow(data.five_hour, 'five_hour', nowSeconds)
      : null,
    seven_day: data.seven_day
      ? getEffectiveRateLimitWindow(data.seven_day, 'seven_day', nowSeconds)
      : null,
  };
};

export const buildRateLimitsUsage = (
  cache: Partial<IRateLimitsCache>,
  nowSeconds = Date.now() / 1000,
): IRateLimitsUsage => ({
  providers: {
    claude: buildProviderUsage(cache.claude, nowSeconds),
    codex: buildProviderUsage(cache.codex, nowSeconds),
  },
});
