import { describe, expect, it } from 'vitest';
import {
  buildRateLimitsUsage,
  getEffectiveRateLimitWindow,
  RATE_LIMIT_PERIOD_SECONDS,
} from '@/lib/rate-limits-usage';

describe('rate limit usage', () => {
  it('preserves live usage and reports seconds until reset', () => {
    expect(getEffectiveRateLimitWindow(
      { used_percentage: 42, resets_at: 2_000 },
      'five_hour',
      1_900,
    )).toEqual({
      used_percentage: 42,
      resets_at: 2_000,
      resets_at_iso: '1970-01-01T00:33:20.000Z',
      resets_in_seconds: 100,
    });
  });

  it('rolls expired windows to the next reset and clears usage', () => {
    const period = RATE_LIMIT_PERIOD_SECONDS.five_hour;
    expect(getEffectiveRateLimitWindow(
      { used_percentage: 88, resets_at: 1_000 },
      'five_hour',
      1_000 + period,
    )).toEqual({
      used_percentage: 0,
      resets_at: 1_000 + period * 2,
      resets_at_iso: '1970-01-01T10:16:40.000Z',
      resets_in_seconds: period,
    });
  });

  it('builds a stable provider-shaped response when one provider has no data', () => {
    const usage = buildRateLimitsUsage({
      claude: {
        ts: 1_700,
        five_hour: { used_percentage: 12, resets_at: 2_000 },
        seven_day: null,
      },
    }, 1_900);

    expect(usage.providers.claude).toEqual({
      updated_at: 1_700,
      updated_at_iso: '1970-01-01T00:28:20.000Z',
      five_hour: {
        used_percentage: 12,
        resets_at: 2_000,
        resets_at_iso: '1970-01-01T00:33:20.000Z',
        resets_in_seconds: 100,
      },
      seven_day: null,
    });
    expect(usage.providers.codex).toBeNull();
  });
});
