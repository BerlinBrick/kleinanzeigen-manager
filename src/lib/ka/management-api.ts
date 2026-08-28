import fs from 'fs';
import path from 'path';

export const KA_MANAGE_URL = 'https://www.kleinanzeigen.de/m-meine-anzeigen-verwalten.json';
export const SESSION_FILE = '.temp/login-session.json';

export interface KaManageAd {
  id: number;
  title: string;
  price: string;
  category: string;
  viewCount: number;
  watchCount: number;
  replies: number;
  imageCount: number;
  state: string;
  activationDate?: string;
  endDate?: string;
  adImage?: { url: string };
  seoUrl?: string;
  adPriceType?: string;
  l1CategoryName?: string;
  l2CategoryName?: string;
  creationDate?: string;
  adLifeTimeInSeconds?: number;
  isWantedAdType?: boolean;
}

export class KaManageApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly location?: string) {
    super(message);
    this.name = 'KaManageApiError';
  }
}

interface KaPaging {
  pageNum: number;
  pageSize: number;
  numFound: number;
  last: number;
}

interface KaManageResponse {
  ads?: KaManageAd[];
  paging?: KaPaging;
}

export function loadSessionCookies(workspace: string): string | null {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(workspace, SESSION_FILE), 'utf-8'),
    ) as { cookies?: unknown };
    return typeof data.cookies === 'string' && data.cookies ? data.cookies : null;
  } catch {
    return null;
  }
}

export function saveSessionCookies(workspace: string, cookies: string): void {
  const file = path.join(workspace, SESSION_FILE);
  let userId: number | undefined;
  try {
    const previous = JSON.parse(fs.readFileSync(file, 'utf-8')) as { userId?: unknown };
    if (typeof previous.userId === 'number') userId = previous.userId;
  } catch {
    // The session may not exist yet.
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ cookies, ...(userId === undefined ? {} : { userId }), savedAt: Date.now() }),
    { mode: 0o600 },
  );
}

/** A browser cookie export is only a login candidate when both KA auth tokens are present. */
export function hasRequiredAuthCookies(cookies: string): boolean {
  const names = new Set(cookies.split(';').map((part) => part.trim().split('=', 1)[0]));
  return names.has('access_token') && names.has('refresh_token');
}

async function fetchPage(cookies: string, page: number): Promise<KaManageResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${KA_MANAGE_URL}?sort=DEFAULT&pageNum=${page}`, {
      headers: {
        Cookie: cookies,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!res.ok) {
      const location = res.headers.get('location') ?? undefined;
      throw new KaManageApiError(
        res.status,
        `Kleinanzeigen API HTTP ${res.status}${location ? ` -> ${location}` : ''}`,
        location,
      );
    }
    const data = await res.json() as unknown;
    if (!data || typeof data !== 'object') throw new KaManageApiError(502, 'Ungültige Antwort der Kleinanzeigen API');
    return data as KaManageResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchKaAds(workspace: string): Promise<KaManageAd[]> {
  let cookies = loadSessionCookies(workspace);
  if (!cookies) return [];

  try {
    return await fetchKaAdsWithCookies(cookies);
  } catch (error) {
    if (!(error instanceof KaManageApiError) || (error.status !== 401 && error.status !== 403)) throw error;

    // Recover only through this account's isolated workspace/profile. The
    // messaging session lifecycle already implements refresh-token recovery
    // without deleting persisted cookies or falling back to another account.
    const { ensureSession, stopSession } = await import('@/lib/messaging/gateway');
    stopSession(workspace);
    await ensureSession(workspace);
    cookies = loadSessionCookies(workspace);
    if (!cookies) throw error;

    // A single retry prevents loops when Kleinanzeigen rejects the refreshed
    // session as well. All persisted recovery material remains untouched.
    return fetchKaAdsWithCookies(cookies);
  }
}

/** Count only listings that Kleinanzeigen currently reports as online. */
export function countOnlineAds(ads: KaManageAd[]): number {
  return ads.filter((ad) => ad.state?.toLowerCase() === 'active').length;
}

/** Validate/use an in-memory browser cookie export before it is persisted. */
export async function fetchKaAdsWithCookies(cookies: string): Promise<KaManageAd[]> {
  const first = await fetchPage(cookies, 1);
  const firstAds = first.ads ?? [];
  if (firstAds.length === 0) return [];

  const totalPages = first.paging?.last ?? 1;
  if (totalPages === 1) return firstAds;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(cookies, i + 2)),
  );

  return [
    ...firstAds,
    ...remaining.flatMap(r => r.ads ?? []),
  ];
}
