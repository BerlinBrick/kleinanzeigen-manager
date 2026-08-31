'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ConversationsResponse, ConversationDetail, UnifiedInboxResponse } from '@/types/message';
import { useAccount } from '@/contexts/AccountContext';

interface MessagingStatus {
  status: 'ready' | 'starting' | 'logging_in' | 'error' | 'not_started' | 'browserless' | 'awaiting_mfa';
  userId: number | null;
  numUnreadMessages?: number;
  botCommand?: string | null;
  error?: string;
}

export function useMessagingStatus() {
  const { activeAccountId } = useAccount();
  return useQuery<MessagingStatus>({
    queryKey: ['messaging-status', activeAccountId],
    queryFn: () => api.get('/api/messages/status'),
    retry: 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Keep polling while session is starting up or waiting for MFA
      if (status === 'starting' || status === 'logging_in') return 3000;
      if (status === 'awaiting_mfa') return 5000;
      // Poll periodically in browserless mode to detect when bot finishes
      if (status === 'browserless') return 10000;
      return false;
    },
  });
}

export function useStartMessaging() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/messages/status', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging-status'] });
    },
  });
}

export function useStopMessaging() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/api/messages/status'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging-status'] });
    },
  });
}

export function usePrepareMessagingMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/messages/mfa', { action: 'prepare' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging-status'] });
    },
  });
}

export function useSubmitMessagingMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.post('/api/messages/mfa', { code }).then((r: unknown) => r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging-status'] });
    },
  });
}

export function useUnreadCount() {
  const { activeAccountId } = useAccount();
  return useQuery<MessagingStatus & { numUnreadMessages?: number }>({
    queryKey: ['unread-count', activeAccountId],
    queryFn: () => api.get('/api/messages/status'),
    refetchInterval: (query) => query.state.error ? false : 30000,
    retry: 0,
    select: (data) => data,
  });
}

export function useConversations(size = 25) {
  const { activeAccountId } = useAccount();
  return useInfiniteQuery<ConversationsResponse>({
    queryKey: ['conversations', activeAccountId, size],
    queryFn: ({ pageParam = 0 }) => api.get(`/api/messages?page=${pageParam}&size=${size}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const meta = lastPage._meta;
      const nextPage = meta.pageNum + 1;
      return nextPage * meta.pageSize < meta.numFound ? nextPage : undefined;
    },
    retry: false,
    refetchInterval: (query) => query.state.error ? false : 30000,
  });
}

export function useUnifiedInbox(complete = true) {
  return useQuery<UnifiedInboxResponse>({
    queryKey: ['unified-inbox', complete ? 'complete' : 'summary'],
    queryFn: () => api.get(complete ? '/api/inbox?size=100' : '/api/inbox?size=1&complete=false'),
    retry: false,
    refetchInterval: (query) => query.state.error ? false : 30_000,
  });
}

export function useConversation(conversationId: string | null, accountId?: string) {
  const { activeAccountId } = useAccount();
  const routedAccountId = accountId ?? activeAccountId;
  return useQuery<ConversationDetail & { aiSentTexts?: string[] }>({
    queryKey: ['conversation', routedAccountId, conversationId],
    queryFn: () => accountId
      ? api.getForAccount(`/api/messages/${conversationId}`, accountId)
      : api.get(`/api/messages/${conversationId}`),
    enabled: !!conversationId,
    retry: false,
    refetchInterval: (query) => query.state.error ? false : 15000,
  });
}

interface ResponderStatus {
  mode: 'auto' | 'review' | 'off' | 'out_of_office';
  running: boolean;
  lastPoll: number;
  sentCount: number;
  oooSentCount: number;
  pendingCount: number;
  pendingReplies: Array<{
    conversationId: string;
    buyerName: string;
    adTitle: string;
    suggestedReply: string;
    status: string;
    createdAt: number;
  }>;
  aiAdGen: { adGenerations: number; adImageAnalyses: number };
}

export function useResponderStatus(accountId?: string) {
  const { activeAccountId } = useAccount();
  const routedAccountId = accountId ?? activeAccountId;
  return useQuery<ResponderStatus>({
    queryKey: ['responder-status', routedAccountId],
    queryFn: () => accountId
      ? api.getForAccount('/api/messages/responder', accountId)
      : api.get('/api/messages/responder'),
    refetchInterval: 10000,
  });
}

export function useResponderControl(accountId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      accountId
        ? api.postForAccount('/api/messages/responder', accountId, body)
        : api.post('/api/messages/responder', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responder-status'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unified-inbox'] });
    },
  });
}

export function useSendMessage(accountId?: string) {
  const queryClient = useQueryClient();
  const { activeAccountId } = useAccount();
  const routedAccountId = accountId ?? activeAccountId;
  return useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: string; message: string }) =>
      accountId
        ? api.postForAccount(`/api/messages/${conversationId}`, accountId, { message })
        : api.post(`/api/messages/${conversationId}`, { message }),
    onMutate: async ({ conversationId, message }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversation', routedAccountId, conversationId] });

      const previous = queryClient.getQueryData<ConversationDetail>(['conversation', routedAccountId, conversationId]);

      // Optimistically add the message
      if (previous) {
        queryClient.setQueryData<ConversationDetail>(['conversation', routedAccountId, conversationId], {
          ...previous,
          messages: [
            ...previous.messages,
            {
              messageId: `optimistic-${Date.now()}`,
              textShort: message,
              boundness: 'OUTBOUND',
              type: 'MESSAGE',
              receivedDate: new Date().toISOString(),
              attachments: [],
            },
          ],
        });
      }

      return { previous };
    },
    onError: (_err, { conversationId }, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['conversation', routedAccountId, conversationId], context.previous);
      }
    },
    onSettled: (_data, _err, { conversationId }) => {
      // Refetch to get the real server state
      queryClient.invalidateQueries({ queryKey: ['conversation', routedAccountId, conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unified-inbox'] });
    },
  });
}
