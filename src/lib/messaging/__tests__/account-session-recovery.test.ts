import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSession, stopSession } from '../gateway';

function accessToken(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('messaging account-session recovery', () => {
  let workspace: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (workspace) {
      stopSession(workspace);
      fs.rmSync(workspace, { recursive: true, force: true });
      workspace = undefined;
    }
  });

  it('accepts Management API session cookies without a persisted userId', async () => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-account-session-'));
    const sessionFile = path.join(workspace, '.temp', 'login-session.json');
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({
      cookies: `access_token=${accessToken(Math.floor(Date.now() / 1000) + 3600)}; refresh_token=keep`,
      savedAt: Date.now(),
    }));

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ userId: '101' }),
    } as Response);

    const session = await ensureSession(workspace, { cookieOnly: true });

    expect(session.status).toBe('ready');
    expect(session.userId).toBe(101);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.kleinanzeigen.de/m-mein-profil.json',
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: expect.stringContaining('refresh_token=keep') }) }),
    );
  });
});
