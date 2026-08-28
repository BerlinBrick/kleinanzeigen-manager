'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatView } from '@/components/messages/ChatView';
import { useAccount } from '@/contexts/AccountContext';
import { useUnifiedInbox } from '@/hooks/useMessages';
import type { AccountConversation } from '@/types/message';
import styles from '@/components/messages/Messages.module.scss';

function conversationKey(conversation: AccountConversation): string {
  return `${conversation.account_id}:${conversation.id}`;
}

export default function MessagesPage() {
  const { accounts } = useAccount();
  const { data, isLoading, error } = useUnifiedInbox();
  const [accountFilter, setAccountFilter] = useState('all');
  const [selected, setSelected] = useState<AccountConversation | null>(null);

  const conversations = useMemo(() => {
    const all = data?.conversations ?? [];
    return accountFilter === 'all' ? all : all.filter((conversation) => conversation.account_id === accountFilter);
  }, [accountFilter, data?.conversations]);

  useEffect(() => {
    if (selected && accountFilter !== 'all' && selected.account_id !== accountFilter) setSelected(null);
  }, [accountFilter, selected]);

  const unread = conversations.reduce((sum, conversation) => sum + (conversation.unreadMessagesCount ?? 0), 0);

  if (isLoading) {
    return <div className={styles.statusCenter}><Spinner size="lg" /><p className={styles.statusText}>Nachrichten aller Konten werden geladen…</p></div>;
  }
  if (error) {
    return <div className={styles.statusCenterRow}><EmptyState title="Nachrichten nicht verfügbar" message={(error as Error).message} /></div>;
  }

  return (
    <div className={`${styles.container} ${selected ? styles.containerChatOpen : ''}`} data-testid="unified-messages">
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div><span className={styles.listTitle}>Nachrichten</span><span className={styles.listCount}>{conversations.length}</span></div>
          {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
        </div>
        <div className={styles.accountFilter}>
          <label htmlFor="messages-account-filter">Konto</label>
          <select id="messages-account-filter" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} data-testid="messages-account-filter">
            <option value="all">Alle Accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name}</option>)}
          </select>
        </div>
        {!!data?.errors.length && (
          <div className={styles.inboxErrors} data-testid="messages-account-errors">
            {data.errors.map((item) => <span key={item.account_id}>{item.account_name}: {item.error}</span>)}
          </div>
        )}
        {conversations.length === 0 ? (
          <EmptyState title="Keine Nachrichten" message={accountFilter === 'all' ? 'In den verbundenen Konten sind keine Konversationen vorhanden.' : 'Für dieses Konto sind keine Konversationen vorhanden.'} />
        ) : (
          <ConversationList conversations={conversations} selectedKey={selected ? conversationKey(selected) : null} onSelect={setSelected} />
        )}
      </div>
      <div className={styles.chatPanel}>
        {selected ? (
          <ChatView conversationId={selected.id} accountId={selected.account_id} accountName={selected.account_name} onBack={() => setSelected(null)} />
        ) : (
          <div className={styles.chatEmpty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
            <span>Wähle eine Konversation aus</span>
          </div>
        )}
      </div>
    </div>
  );
}
