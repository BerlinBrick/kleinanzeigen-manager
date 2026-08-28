import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBrowserMode, applySessionOnlyLogin } from '../runner';

describe('applyBrowserMode', () => {
  it('headless mode → headless args on the shared profile', () => {
    const merged: Record<string, unknown> = { browser: { mode: 'headless', arguments: ['--no-sandbox'] } };
    applyBrowserMode(merged, '/ws', undefined, undefined, true);
    const b = merged.browser as Record<string, unknown>;
    expect(b.arguments).toContain('--headless=new');
    expect(b.arguments).toContain('--no-sandbox');
    expect(b.user_data_dir).toBe('/ws/.temp/browser-profile');
    expect(b.use_private_window).toBe(false);
    expect(b.suppress_unsupported_flag_warning).toBe(false);
  });

  it('enforces the Docker-safe flags even when legacy config omitted them', () => {
    const merged: Record<string, unknown> = {
      browser: { mode: 'auto', arguments: [], suppress_unsupported_flag_warning: true },
    };

    applyBrowserMode(merged, '/workspace/accounts/cat-2-go', undefined, undefined, true);

    const browser = merged.browser as Record<string, unknown>;
    expect(browser.arguments).toEqual(expect.arrayContaining([
      '--no-sandbox',
      '--headless=new',
      '--user-data-dir=/workspace/accounts/cat-2-go/.temp/browser-profile',
    ]));
    expect(browser.suppress_unsupported_flag_warning).toBe(false);
  });

  it('keeps browser profiles isolated per selected account workspace', () => {
    const first: Record<string, unknown> = { browser: { mode: 'auto', arguments: [] } };
    const second: Record<string, unknown> = { browser: { mode: 'auto', arguments: [] } };

    applyBrowserMode(first, '/workspace', undefined, undefined, true);
    applyBrowserMode(second, '/workspace/accounts/cat-2-go', undefined, undefined, true);

    expect((first.browser as Record<string, unknown>).user_data_dir).toBe('/workspace/.temp/browser-profile');
    expect((second.browser as Record<string, unknown>).user_data_dir).toBe('/workspace/accounts/cat-2-go/.temp/browser-profile');
    expect((first.browser as Record<string, unknown>).user_data_dir)
      .not.toBe((second.browser as Record<string, unknown>).user_data_dir);
  });
});

describe('applySessionOnlyLogin', () => {
  const workspaces: string[] = [];
  afterEach(() => {
    for (const workspace of workspaces.splice(0)) fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('replaces empty legacy login values when the selected account has a session', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'session-only-login-'));
    workspaces.push(workspace);
    fs.mkdirSync(path.join(workspace, '.temp'));
    fs.writeFileSync(path.join(workspace, '.temp', 'login-session.json'), '{"cookies":[]}');
    const merged = { login: { username: '', password: '' } };

    applySessionOnlyLogin(merged, workspace);

    expect(merged.login.username).toBeTruthy();
    expect(merged.login.password).toBeTruthy();
    expect(merged.login.username).not.toContain('@gmx.de');
  });

  it('does not fall back to configured global credentials', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'session-only-login-'));
    workspaces.push(workspace);
    fs.mkdirSync(path.join(workspace, '.temp'));
    fs.writeFileSync(path.join(workspace, '.temp', 'login-session.json'), '{"cookies":[]}');
    const merged = { login: { username: 'global@example.test', password: 'global-secret' } };

    applySessionOnlyLogin(merged, workspace);

    expect(merged.login).toEqual({
      username: 'session-only@invalid.local',
      password: 'session-only',
    });
  });

  it('refuses session-only mode without the selected account session', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'session-only-login-'));
    workspaces.push(workspace);
    expect(() => applySessionOnlyLogin({ login: {} }, workspace)).toThrow('Session fehlt');
  });
});
