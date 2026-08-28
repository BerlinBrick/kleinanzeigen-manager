import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  loadAccounts,
  accountWorkspace,
  computeLoginStatus,
  hasSession,
} from '@/lib/accounts/accounts';
import { findAdFiles, readAd } from '@/lib/yaml/ads';
import path from 'path';
import { countOnlineAds, fetchKaAds } from '@/lib/ka/management-api';

interface RecentAd {
  account_id: string;
  account_name: string;
  title: string;
  id: number | null;
  active: boolean;
  created_on: string | null;
  updated_on: string | null;
}

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

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }

    const accounts = loadAccounts(user.userWorkspace);
    const recent: RecentAd[] = [];

    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const ws = accountWorkspace(user.userWorkspace, account);
        let ad_count = 0;
        let active_ads = 0;
        let automations = 0;
        let login_status = 'disconnected';
        let unread: number | null = null;
        try {
          login_status = computeLoginStatus(ws);
          // Account cards/totals reflect Kleinanzeigen itself. Local YAML files
          // remain useful only for automation/recent-ad metadata below.
          const onlineAds = hasSession(ws) ? await fetchKaAds(ws) : [];
          ad_count = countOnlineAds(onlineAds);
          active_ads = ad_count;
          const files = findAdFiles(ws);
          for (const fp of files) {
            let ad: Record<string, unknown> = {};
            try { ad = readAd(fp); } catch { continue; }
            const active = ad.active !== false;
            if (ad.republication_interval != null) automations += 1;
            recent.push({
              account_id: account.id,
              account_name: account.display_name,
              title: (ad.title as string) ?? path.basename(fp, '.yaml'),
              id: (ad.id as number) ?? null,
              active,
              created_on: (ad.created_on as string) ?? null,
              updated_on: (ad.updated_on as string) ?? null,
            });
          }
          unread = await accountUnread(ws);
        } catch { /* isolate per-account failures */ }

        return {
          id: account.id,
          display_name: account.display_name,
          is_default: account.is_default,
          login_status,
          ad_count,
          active_ads,
          automations,
          unread,
          last_sync: account.last_sync,
        };
      }),
    );

    recent.sort((a, b) => {
      const ta = Date.parse(a.updated_on ?? a.created_on ?? '') || 0;
      const tb = Date.parse(b.updated_on ?? b.created_on ?? '') || 0;
      return tb - ta;
    });

    const totals = {
      accounts: accounts.length,
      connected: perAccount.filter((a) => a.login_status === 'connected').length,
      active_ads: perAccount.reduce((s, a) => s + a.active_ads, 0),
      unread: perAccount.reduce((s, a) => s + (a.unread ?? 0), 0),
      automations: perAccount.reduce((s, a) => s + a.automations, 0),
    };

    return NextResponse.json({
      totals,
      accounts: perAccount,
      recent_ads: recent.slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
