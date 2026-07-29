import { describe, expect, it } from 'vitest';
import {
  MAX_SUBMIT_DELAY_MS,
  MSG_WEB_STDIN,
  MSG_WEB_SUBMIT,
  encodeWebStdin,
  encodeWebSubmit,
} from '@/lib/terminal-protocol';

/** Mirrors how terminal-server reads a MSG_WEB_SUBMIT frame. */
const decodeWebSubmit = (frame: ArrayBuffer) => {
  const bytes = new Uint8Array(frame);
  const payload = bytes.slice(1);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    type: bytes[0],
    submitDelayMs: view.getUint16(0),
    text: new TextDecoder().decode(payload.slice(2)),
  };
};

describe('web submit frame', () => {
  it('carries the text and its submit delay in a single frame', () => {
    expect(decodeWebSubmit(encodeWebSubmit('deploy the build', 250))).toEqual({
      type: MSG_WEB_SUBMIT,
      submitDelayMs: 250,
      text: 'deploy the build',
    });
  });

  it('preserves bracketed paste markers and multibyte text', () => {
    const multiline = '\x1b[200~첫 줄\n둘째 줄\x1b[201~';
    expect(decodeWebSubmit(encodeWebSubmit(multiline, 250)).text).toBe(multiline);
  });

  it('clamps a delay that would overflow the 2-byte field', () => {
    expect(decodeWebSubmit(encodeWebSubmit('x', 999_999)).submitDelayMs).toBe(MAX_SUBMIT_DELAY_MS);
    expect(decodeWebSubmit(encodeWebSubmit('x', -1)).submitDelayMs).toBe(0);
  });

  it('leaves the text-only frame type unchanged', () => {
    expect(new Uint8Array(encodeWebStdin('x'))[0]).toBe(MSG_WEB_STDIN);
  });
});
