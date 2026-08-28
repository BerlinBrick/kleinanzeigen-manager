import { describe, expect, it, vi } from 'vitest';
import { listAllConversations } from '@/lib/messaging/unified-inbox';
import type { Conversation, ConversationsResponse } from '@/types/message';

function response(page: number, total: number, ids: string[]): ConversationsResponse {
  return {
    numUnread: 1,
    numUnreadMessages: 2,
    lastModified: '',
    conversations: ids.map((id) => ({ id } as Conversation)),
    _meta: {
      numFound: total,
      pageNum: page,
      pageSize: 2,
      numUnread: 1,
      numUnreadMessages: 2,
      attachmentsEnabled: true,
    },
  };
}

describe('unified inbox pagination', () => {
  it('loads every page for one isolated account workspace', async () => {
    const list = vi.fn(async (_workspace: string, page: number) => {
      if (page === 0) return response(0, 5, ['one', 'two']);
      if (page === 1) return response(1, 5, ['three', 'four']);
      return response(2, 5, ['five']);
    });

    const result = await listAllConversations('/accounts/cat-2-go', 2, list);

    expect(list.mock.calls.map((call) => call[0])).toEqual([
      '/accounts/cat-2-go',
      '/accounts/cat-2-go',
      '/accounts/cat-2-go',
    ]);
    expect(result.conversations.map((conversation) => conversation.id)).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(result.unread).toBe(2);
  });
});
