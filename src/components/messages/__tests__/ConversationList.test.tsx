import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationList } from '../ConversationList';
import type { AccountConversation } from '@/types/message';

describe('multi-account conversation list', () => {
  it('renders the listing thumbnail and originating account', () => {
    const conversation = {
      id: 'thread-1',
      account_id: 'cat-2-go',
      account_name: 'Cat-2-Go',
      role: 'Seller',
      buyerName: 'Buyer',
      adTitle: 'Testanzeige',
      adImage: 'https://img.kleinanzeigen.de/example.jpg?rule=$_1.JPG',
      adStatus: 'ACTIVE',
      receivedDate: '2026-08-28T08:00:00.000Z',
      unread: false,
      unreadMessagesCount: 0,
      boundness: 'INBOUND',
      textShortTrimmed: 'Hallo',
    } as AccountConversation;

    const html = renderToStaticMarkup(
      <ConversationList conversations={[conversation]} selectedKey={null} onSelect={() => {}} />,
    );

    expect(html).toContain('Cat-2-Go');
    expect(html).toContain('/api/messages/image?url=');
    expect(html).toContain('Testanzeige');
  });
});

