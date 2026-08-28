import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  fetchKaAds,
  KaManageApiError,
  loadSessionCookies,
  type KaManageAd,
} from '@/lib/ka/management-api';
import type { AdListItem, PriceType } from '@/types/ad';
import { accountWorkspace, loadAccounts } from '@/lib/accounts/accounts';

function parsePrice(value: string): number | undefined {
  const normalized = value.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function toListItem(ad: KaManageAd, accountId?: string, accountName?: string): AdListItem {
  return {
    account_id: accountId,
    account_name: accountName,
    id: ad.id,
    title: ad.title,
    price: parsePrice(ad.price),
    price_type: ad.adPriceType as PriceType | undefined,
    active: ad.state === 'active',
    type: ad.isWantedAdType ? 'WANTED' : 'OFFER',
    category: ad.category,
    images: ad.imageCount,
    first_image: ad.adImage?.url ?? null,
    created_on: toIsoDate(ad.creationDate ?? ad.activationDate),
    repost_count: 0,
    price_reduction_count: 0,
    has_description: true,
    is_changed: false,
    is_orphaned: false,
    is_archived: false,
    file: '',
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (request.nextUrl.searchParams.get('scope') === 'all') {
    const accounts = loadAccounts(user.userWorkspace);
    const results = await Promise.all(accounts.map(async (account) => {
      const workspace = accountWorkspace(user.userWorkspace, account);
      if (!loadSessionCookies(workspace)) {
        return { account_id: account.id, account_name: account.display_name, loggedIn: false, successful: false, ads: [] as AdListItem[], error: 'Keine gespeicherte Kleinanzeigen-Session vorhanden' };
      }
      try {
        const ads = await fetchKaAds(workspace);
        return { account_id: account.id, account_name: account.display_name, loggedIn: true, successful: true, ads: ads.map((ad) => toListItem(ad, account.id, account.display_name)), error: null };
      } catch (error) {
        return {
          account_id: account.id,
          account_name: account.display_name,
          loggedIn: false,
          successful: false,
          ads: [] as AdListItem[],
          error: error instanceof Error ? error.message : 'Kleinanzeigen API nicht erreichbar',
        };
      }
    }));
    const ads = results.flatMap((result) => result.ads);
    const failedAccounts = results.filter((result) => !result.successful);
    return NextResponse.json({
      loggedIn: results.some((result) => result.successful),
      ads,
      total: ads.length,
      error: failedAccounts.length === 0
        ? null
        : failedAccounts.length === results.length
          ? 'Online-Anzeigen konnten für kein Konto geladen werden'
          : 'Online-Anzeigen konnten für mindestens ein Konto nicht geladen werden',
      accounts: results.map(({ ads: _ads, successful: _successful, ...result }) => result),
    });
  }
  if (!loadSessionCookies(user.workspace)) {
    return NextResponse.json({
      loggedIn: false,
      ads: [],
      total: 0,
      error: 'Keine gespeicherte Kleinanzeigen-Session vorhanden',
    }, { status: 401 });
  }

  try {
    const ads = await fetchKaAds(user.workspace);
    return NextResponse.json({
      loggedIn: true,
      ads: ads.map((ad) => toListItem(ad)),
      total: ads.length,
      error: null,
    });
  } catch (error) {
    const isLoginRedirect = error instanceof KaManageApiError
      && Boolean(error.location?.includes('m-einloggen-sso.html'));
    const detail = error instanceof Error ? error.message : 'Kleinanzeigen API nicht erreichbar';
    return NextResponse.json({
      loggedIn: !isLoginRedirect,
      ads: [],
      total: 0,
      error: detail,
    }, { status: isLoginRedirect ? 401 : 502 });
  }
}
