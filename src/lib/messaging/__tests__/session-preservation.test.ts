import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { invalidateSessionAfterAuthFailure } from '../gateway';

describe('messaging auth failure preservation', () => {
  let workspace: string | undefined;

  afterEach(() => {
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('never deletes the persisted account session on auth failure', () => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-session-'));
    const sessionFile = path.join(workspace, '.temp', 'login-session.json');
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({ cookies: 'refresh_token=keep-me' }));

    invalidateSessionAfterAuthFailure(workspace, 'HTTP 401');

    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.readFileSync(sessionFile, 'utf8')).toContain('refresh_token=keep-me');
  });
});
