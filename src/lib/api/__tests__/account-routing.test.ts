import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../client';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('explicit account routing', () => {
  it('pins a reply request to the thread account instead of the active account', async () => {
    localStorage.setItem('token', 'app-token');
    localStorage.setItem('active_account_id', 'other-account');
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    await api.postForAccount('/api/messages/thread-1', 'origin-account', { message: 'test' });

    expect(fetchMock).toHaveBeenCalledWith('/api/messages/thread-1', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer app-token',
        'x-account-id': 'origin-account',
      }),
    }));
  });
});
