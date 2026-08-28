import type { Conversation, ConversationsResponse } from '@/types/message';

export async function listAllConversations(
  workspace: string,
  pageSize: number,
  listConversations: (workspace: string, page: number, size: number) => Promise<ConversationsResponse>,
): Promise<{ conversations: Conversation[]; unread: number }> {
  const first = await listConversations(workspace, 0, pageSize);
  const total = first._meta?.numFound ?? first.conversations.length;
  const pages = Math.ceil(total / pageSize);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => listConversations(workspace, index + 1, pageSize)))
    : [];
  return {
    conversations: [first, ...rest].flatMap((page) => page.conversations ?? []),
    unread: first.numUnreadMessages ?? 0,
  };
}
