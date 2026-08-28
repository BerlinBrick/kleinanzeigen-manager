'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge, Button, Spinner, EmptyState, useToast } from '@/components/ui';
import { useAccount } from '@/contexts/AccountContext';
import { useConversation, useSendMessage } from '@/hooks/useMessages';
import type { Conversation } from '@/types/message';
import styles from './page.module.scss';

interface InboxConversation extends Conversation {
  account_id: string;
  account_name: string;
}

interface InboxResponse {
  conversations: InboxConversation[];
  numUnreadMessages: number;
  total: number;
  errors: Array<{ account_id: string; account_name: string; error: string }>;
}

function counterpart(c: Conversation): string {
  return c.role === 'Seller' ? c.buyerName : c.sellerName;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export default function InboxPage() {
  const { accounts } = useAccount();
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<InboxConversation | null>(null);

  const { data, isLoading } = useQuery<InboxResponse>({
    queryKey: ['inbox'],
    queryFn: () => api.get('/api/inbox'),
    refetchInterval: 30_000,
  });

  const conversations = useMemo(() => {
    let list = data?.conversations ?? [];
    if (filterAccount !== 'all') list = list.filter((c) => c.account_id === filterAccount);
    if (unreadOnly) list = list.filter((c) => c.unread);
    return list;
  }, [data, filterAccount, unreadOnly]);

  return (
    <div className={styles.page} data-testid="inbox-page">
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Zentrales Postfach</h2>
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            data-testid="inbox-account-filter"
          >
            <option value="all">Alle Konten</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
          <button
            className={`${styles.chip} ${unreadOnly ? styles.chipActive : ''}`}
            onClick={() => setUnreadOnly((v) => !v)}
            data-testid="inbox-unread-filter"
          >
            Nur ungelesen
          </button>
        </div>
      </div>

      {data?.errors && data.errors.length > 0 && (
        <div className={styles.errorBanner} data-testid="inbox-errors">
          {data.errors.map((e) => (
            <span key={e.account_id}>„{e.account_name}&quot;: {e.error}</span>
          ))}
        </div>
      )}

      <div className={`${styles.layout} ${selected ? styles.layoutDetailOpen : ''}`}>
        <div className={styles.list} data-testid="inbox-list">
          {isLoading ? (
            <div className={styles.center}><Spinner size="lg" /></div>
          ) : conversations.length === 0 ? (
            <EmptyState
              title="Keine Konversationen"
              message="Verbundene Konten zeigen hier alle Nachrichten. Melde ein Konto an, um Nachrichten zu laden."
            />
          ) : (
            conversations.map((c) => (
              <button
                key={`${c.account_id}-${c.id}`}
                className={`${styles.convRow} ${selected?.id === c.id ? styles.convRowActive : ''} ${c.unread ? styles.convUnread : ''}`}
                onClick={() => setSelected(c)}
                data-testid={`inbox-conversation-${c.id}`}
              >
                <div className={styles.convTop}>
                  <span className={styles.convName}>{counterpart(c)}</span>
                  <span className={styles.convTime}>{formatTime(c.receivedDate)}</span>
                </div>
                <div className={styles.convAd}>{c.adTitle ?? 'Anzeige'}</div>
                <div className={styles.convPreview}>{c.textShortTrimmed}</div>
                <div className={styles.convFooter}>
                  <Badge variant="info">{c.account_name}</Badge>
                  {c.unread && <Badge variant="danger">{c.unreadMessagesCount || 'neu'}</Badge>}
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <ConversationDetail conversation={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function ConversationDetail({
  conversation,
  onClose,
}: {
  conversation: InboxConversation;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reply, setReply] = useState('');

  // Pin detail reads and replies to the thread's origin account explicitly;
  // never depend on asynchronous global account selection/localStorage.
  const { data: detail, isLoading } = useConversation(conversation.id, conversation.account_id);
  const sendMessage = useSendMessage(conversation.account_id);

  const handleSend = async () => {
    if (!reply.trim()) return;
    try {
      await sendMessage.mutateAsync({ conversationId: conversation.id, message: reply.trim() });
      setReply('');
      toast('success', `Antwort über „${conversation.account_name}" gesendet`);
    } catch {
      toast('error', 'Senden fehlgeschlagen — ist das Konto angemeldet?');
    }
  };

  return (
    <div className={styles.detail} data-testid="inbox-detail">
      <div className={styles.detailHeader}>
        <button className={styles.backBtn} onClick={onClose} data-testid="inbox-detail-back">←</button>
        <div>
          <div className={styles.detailName}>{counterpart(conversation)}</div>
          <div className={styles.detailAd}>{conversation.adTitle ?? 'Anzeige'}</div>
        </div>
      </div>

      <div className={styles.receivedVia} data-testid="inbox-detail-account">
        Empfangen über: <strong>{conversation.account_name}</strong>
      </div>

      <div className={styles.messages}>
        {isLoading ? (
          <div className={styles.center}><Spinner /></div>
        ) : detail?.messages?.length ? (
          detail.messages.map((m) => (
            <div
              key={m.messageId}
              className={`${styles.bubble} ${m.boundness === 'OUTBOUND' ? styles.bubbleOut : styles.bubbleIn}`}
            >
              {m.textShort}
            </div>
          ))
        ) : (
          <p className={styles.noMessages}>Keine Nachrichten geladen (Konto ggf. nicht angemeldet).</p>
        )}
      </div>

      <div className={styles.replyBar}>
        <textarea
          className={styles.replyInput}
          placeholder={`Antwort über „${conversation.account_name}"…`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          data-testid="inbox-reply-input"
        />
        <Button
          variant="primary"
          loading={sendMessage.isPending}
          onClick={handleSend}
          data-testid="inbox-reply-send"
        >
          Senden
        </Button>
      </div>
    </div>
  );
}
