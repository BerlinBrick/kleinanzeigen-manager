import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { loadAccounts, accountWorkspace, hasSession } from '@/lib/accounts/accounts';
import type { Conversation } from '@/types/message';

interface InboxConversation extends Conversation {
  account_id: string;
  account_name: string;
}

/**
 * Unified inbox across ALL connected Kleinanzeigen accounts.
 *
 * Every conversation retains its account association (account_id + account_name)
 * so a reply can always be routed back through the ORIGINATING account's session
 * (the frontend sends x-account-id = conversation.account_id when replying).
 *
 * One account failing (session expired, not logged in) never breaks the others.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const filterAccount = params.get('account'); // optional: scope to one account
    const size = Math.min(parseInt(params.get('size') ?? '50', 10) || 50, 100);

    const accounts = loadAccounts(user.userWorkspace).filter(
      (a) => !filterAccount || a.id === filterAccount,
    );

    const { listConversations } = await import('@/lib/messaging/gateway');

    const all: InboxConversation[] = [];
    const errors: Array<{ account_id: string; account_name: string; error: string }> = [];
    let totalUnread = 0;

    await Promise.all(
      accounts.map(async (account) => {
        const ws = accountWorkspace(user.userWorkspace, account);
        // Only query accounts with a persisted session — avoids launching browsers
        // for disconnected accounts during a passive inbox load.
        if (!hasSession(ws)) return;
        try {
          const data = await Promise.race([
            listConversations(ws, 0, size),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          const resp = data as { conversations?: Conversation[]; numUnreadMessages?: number };
          totalUnread += resp.numUnreadMessages ?? 0;
          for (const c of resp.conversations ?? []) {
            all.push({ ...c, account_id: account.id, account_name: account.display_name });
          }
        } catch (e) {
          errors.push({
            account_id: account.id,
            account_name: account.display_name,
            error: (e as Error).message,
          });
        }
      }),
    );

    all.sort((a, b) => Date.parse(b.receivedDate ?? '') - Date.parse(a.receivedDate ?? ''));

    return NextResponse.json({
      conversations: all,
      numUnreadMessages: totalUnread,
      total: all.length,
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
