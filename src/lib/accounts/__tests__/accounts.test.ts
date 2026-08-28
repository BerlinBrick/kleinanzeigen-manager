import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  accountWorkspace,
  computeLoginStatus,
  createAccount,
  loadAccounts,
  resolveAccount,
  setAccountCredentials,
} from '@/lib/accounts/accounts';
import { saveSessionCookies } from '@/lib/ka/management-api';

describe('isolated Kleinanzeigen accounts', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-'));
    fs.writeFileSync(path.join(workspace, 'config.yaml'), 'login:\n  username: first@example.com\n  password: first-secret\n');
  });

  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

  it('keeps default and second sessions and browser profiles persistent and separate', () => {
    const [first] = loadAccounts(workspace);
    const second = createAccount(workspace, 'Konto Zwei');
    const firstWorkspace = accountWorkspace(workspace, first);
    const secondWorkspace = accountWorkspace(workspace, second);

    setAccountCredentials(secondWorkspace, 'second@example.com', 'second-secret');
    saveSessionCookies(firstWorkspace, 'first=session');
    saveSessionCookies(secondWorkspace, 'second=session');
    fs.mkdirSync(path.join(firstWorkspace, '.temp', 'browser-profile'), { recursive: true });
    fs.mkdirSync(path.join(secondWorkspace, '.temp', 'browser-profile'), { recursive: true });
    fs.writeFileSync(path.join(firstWorkspace, '.temp', 'browser-profile', 'owner'), 'first');
    fs.writeFileSync(path.join(secondWorkspace, '.temp', 'browser-profile', 'owner'), 'second');

    expect(resolveAccount(workspace, first.id).workspace).toBe(workspace);
    expect(resolveAccount(workspace, second.id).workspace).toBe(secondWorkspace);
    expect(computeLoginStatus(firstWorkspace)).toBe('connected');
    expect(computeLoginStatus(secondWorkspace)).toBe('connected');
    expect(fs.readFileSync(path.join(firstWorkspace, '.temp', 'login-session.json'), 'utf8')).toContain('first=session');
    expect(fs.readFileSync(path.join(secondWorkspace, '.temp', 'login-session.json'), 'utf8')).toContain('second=session');
    expect(fs.readFileSync(path.join(firstWorkspace, '.temp', 'browser-profile', 'owner'), 'utf8')).toBe('first');
    expect(fs.readFileSync(path.join(secondWorkspace, '.temp', 'browser-profile', 'owner'), 'utf8')).toBe('second');
  });
});
