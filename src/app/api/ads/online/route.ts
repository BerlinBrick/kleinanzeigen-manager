import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  fetchKaAds,
  KaManageApiError,
  loadSessionCookies,
  type KaManageAd,
} from '@/lib/ka/management-api';
import type { AdListItem, PriceType } from '@/types/ad';

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

function toListItem(ad: KaManageAd): AdListItem {
  return {
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
      ads: ads.map(toListItem),
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
