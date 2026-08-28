import { afterEach, describe, expect, it, vi } from 'vitest';
import { countOnlineAds, fetchKaAdsWithCookies, hasRequiredAuthCookies } from '../management-api';

afterEach(() => vi.restoreAllMocks());

describe('management API browser-session validation', () => {
  it('counts only ads currently reported online', () => {
    const base = { id: 1, title: 'Test', price: '1 €', category: '', viewCount: 0, watchCount: 0, replies: 0, imageCount: 1 };
    expect(countOnlineAds([
      { ...base, state: 'active' },
      { ...base, id: 2, state: 'ACTIVE' },
      { ...base, id: 3, state: 'paused' },
    ])).toBe(2);
  });

  it('requires both Kleinanzeigen auth cookies', () => {
    expect(hasRequiredAuthCookies('access_token=a; refresh_token=b; other=c')).toBe(true);
    expect(hasRequiredAuthCookies('access_token=a; other=c')).toBe(false);
    expect(hasRequiredAuthCookies('refresh_token=b')).toBe(false);
  });

  it('validates an in-memory cookie export without persisting it first', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        ads: [{ id: 3496141302, title: 'Legosteine 200 Stück' }],
        paging: { last: 1 },
      }),
    } as Response);

    const ads = await fetchKaAdsWithCookies('access_token=a; refresh_token=b');

    expect(ads).toHaveLength(1);
    expect(ads[0].id).toBe(3496141302);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('m-meine-anzeigen-verwalten.json'),
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: 'access_token=a; refresh_token=b' }) }),
    );
  });
});
