import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAttachmentDraftStore from '@/hooks/use-attachment-draft-store';

describe('attachment draft store', () => {
  beforeEach(() => {
    useAttachmentDraftStore.setState({ byTabId: {} });
    vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  });

  it('keeps uploaded image chips by tab while another workspace is active', () => {
    const attachment = {
      id: 'image-one',
      path: '/tmp/upload.png',
      filename: 'upload.png',
      thumbnail: 'blob:upload',
    };

    useAttachmentDraftStore.getState().add('tab-one', 'ws-one', [attachment]);

    expect(useAttachmentDraftStore.getState().byTabId['tab-one']?.attachments).toEqual([attachment]);
    expect(useAttachmentDraftStore.getState().byTabId['tab-two']).toBeUndefined();
  });

  it('releases image previews when a tab or workspace is deleted', () => {
    const first = { id: 'one', path: '/tmp/one.png', filename: 'one.png', thumbnail: 'blob:one' };
    const second = { id: 'two', path: '/tmp/two.png', filename: 'two.png', thumbnail: 'blob:two' };
    const store = useAttachmentDraftStore.getState();
    store.add('tab-one', 'ws-one', [first]);
    store.add('tab-two', 'ws-two', [second]);

    useAttachmentDraftStore.getState().clearWorkspace('ws-one');

    expect(useAttachmentDraftStore.getState().byTabId['tab-one']).toBeUndefined();
    expect(useAttachmentDraftStore.getState().byTabId['tab-two']?.attachments).toEqual([second]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one');
  });
});
