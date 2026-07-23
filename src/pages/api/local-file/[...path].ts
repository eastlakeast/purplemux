import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import { isLocalFilePath } from '@/lib/local-file-links';
import {
  getLocalFileMime,
  isHtmlFile,
  isLoopbackAddress,
  LOCAL_FILE_REMOTE_ADDRESS_HEADER,
  resolveLocalFileRequestPath,
} from '@/lib/local-file-server';
import { createLogger } from '@/lib/logger';

const log = createLogger('local-file');

export const config = {
  api: {
    responseLimit: false,
  },
};

const contentDisposition = (filePath: string): string => {
  const fileName = path.basename(filePath).replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const forwardedAddress = req.headers[LOCAL_FILE_REMOTE_ADDRESS_HEADER];
  const remoteAddress = typeof forwardedAddress === 'string'
    ? forwardedAddress
    : req.socket.remoteAddress;
  if (!isLoopbackAddress(remoteAddress)) {
    return res.status(403).json({ error: 'Local file access is limited to this device' });
  }

  const parts = Array.isArray(req.query.path)
    ? req.query.path
    : typeof req.query.path === 'string'
      ? [req.query.path]
      : [];
  const requestedPath = resolveLocalFileRequestPath(parts);
  if (!requestedPath) return res.status(403).json({ error: 'Path not allowed' });

  try {
    const filePath = await realpath(requestedPath);
    if (!isLocalFilePath(filePath)) {
      return res.status(403).json({ error: 'Path not allowed' });
    }

    const info = await stat(filePath);
    if (!info.isFile()) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', getLocalFileMime(filePath));
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Content-Disposition', contentDisposition(filePath));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (isHtmlFile(filePath)) {
      res.setHeader(
        'Content-Security-Policy',
        "sandbox allow-scripts allow-forms allow-modals allow-popups; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'",
      );
    }
    await pipeline(createReadStream(filePath), res);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    if (code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    log.error(`serve local file failed: ${error instanceof Error ? error.message : error}`);
    return res.status(500).json({ error: 'Failed to serve local file' });
  }
};

export default handler;
