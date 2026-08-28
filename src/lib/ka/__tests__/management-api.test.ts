import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countOnlineAds, fetchKaAds, fetchKaAdsWithCookies, hasRequiredAuthCookies } from '../management-api';

const gatewayMocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  stopSession: vi.fn(),
}));

vi.mock('@/lib/messaging/gateway', () => gatewayMocks);

afterEach(() => {
  vi.restoreAllMocks();
  gatewayMocks.ensureSession.mockReset();
  gatewayMocks.stopSession.mockReset();
});

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

  it('refreshes the same account workspace once on 403 and preserves its session file', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'manage-refresh-'));
    const sessionFile = path.join(workspace, '.temp', 'login-session.json');
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({ cookies: 'access_token=old; refresh_token=keep' }));
    gatewayMocks.ensureSession.mockImplementation(async (receivedWorkspace: string) => {
      expect(receivedWorkspace).toBe(workspace);
      fs.writeFileSync(sessionFile, JSON.stringify({ cookies: 'access_token=fresh; refresh_token=keep' }));
    });
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 403, headers: new Headers(), signal: null } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ads: [{ id: 1, state: 'active' }], paging: { last: 1 } }),
      } as Response);

    try {
      const ads = await fetchKaAds(workspace);

      expect(ads).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(gatewayMocks.stopSession).toHaveBeenCalledWith(workspace);
      expect(gatewayMocks.ensureSession).toHaveBeenCalledWith(workspace);
      expect(fs.existsSync(sessionFile)).toBe(true);
      expect(fs.readFileSync(sessionFile, 'utf8')).toContain('refresh_token=keep');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
