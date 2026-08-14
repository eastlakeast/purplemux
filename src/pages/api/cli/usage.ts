import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { readRateLimitsCache } from '@/lib/rate-limits-cache';
import { buildRateLimitsUsage } from '@/lib/rate-limits-usage';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cache = await readRateLimitsCache();
  return res.status(200).json(buildRateLimitsUsage(cache));
};

export default handler;
