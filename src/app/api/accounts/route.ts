import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  loadAccounts,
  accountWorkspace,
  computeLoginStatus,
  createAccount,
  hasSession,
} from '@/lib/accounts/accounts';
import { countOnlineAds, fetchKaAds } from '@/lib/ka/management-api';

/** Best-effort unread count — never launches a browser and never throws. */
async function accountUnread(workspace: string): Promise<number | null> {
  if (!hasSession(workspace)) return null;
  try {
    const { listConversations } = await import('@/lib/messaging/gateway');
    const data = await Promise.race([
      listConversations(workspace, 0, 1),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    return (data as { numUnreadMessages?: number }).numUnreadMessages ?? 0;
  } catch {
    return null;
  }
}

async function activeAdCount(workspace: string): Promise<number> {
  if (!hasSession(workspace)) return 0;
  return countOnlineAds(await fetchKaAds(workspace));
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }

    const accounts = loadAccounts(user.userWorkspace);
    const result = await Promise.all(
      accounts.map(async (account) => {
        const ws = accountWorkspace(user.userWorkspace, account);
        // One account failing must never break the others.
        let login_status: string;
        let ad_count = 0;
        let unread: number | null = null;
        try {
          login_status = computeLoginStatus(ws);
          ad_count = await activeAdCount(ws);
          unread = await accountUnread(ws);
        } catch {
          login_status = 'disconnected';
        }
        return {
          id: account.id,
          display_name: account.display_name,
          is_default: account.is_default,
          created_at: account.created_at,
          last_sync: account.last_sync,
          republish_default_days: account.republish_default_days,
          login_status,
          ad_count,
          unread,
        };
      }),
    );

    return NextResponse.json({ accounts: result, total: result.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!displayName) {
      return NextResponse.json({ detail: 'Anzeigename ist erforderlich' }, { status: 400 });
    }

    const account = createAccount(user.userWorkspace, displayName);
    return NextResponse.json({ account });
  } catch (error) {
    return handleApiError(error);
  }
}
