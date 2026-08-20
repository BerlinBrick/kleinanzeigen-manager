import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { readConfig, writeConfig, isEnvPlaceholder } from '@/lib/yaml/config';
import { SESSION_FILE } from '@/lib/ka/management-api';

/**
 * Multi-account model.
 *
 * ONE application user can manage MULTIPLE Kleinanzeigen accounts. Each account
 * is an ISOLATED workspace (its own config.yaml login/session, browser profile
 * at .temp/browser-profile, ads/ and downloaded-ads/) — reusing the exact
 * isolation the app already had per app-user.
 *
 * The DEFAULT account maps to the app user's existing workspace root (no files
 * are moved — full backward compatibility). Additional accounts live under
 * <userWorkspace>/accounts/<accountId>/.
 *
 * The account registry is stored at <userWorkspace>/accounts.yaml.
 */

export type LoginStatus = 'connected' | 'disconnected' | 'no_credentials';

export interface Account {
  id: string;
  display_name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  last_sync: string | null;
  /** Default automatic-republish interval (days) applied to this account's ads. */
  republish_default_days: number;
}

interface AccountsFile {
  accounts: Account[];
}

function accountsFilePath(userWorkspace: string): string {
  return path.join(userWorkspace, 'accounts.yaml');
}

/** Sub-workspace directory for an account (default account uses the user root). */
export function accountWorkspace(userWorkspace: string, account: Account): string {
  if (account.is_default) return userWorkspace;
  return path.join(userWorkspace, 'accounts', account.id);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Read the KA login username stored in a workspace's config.yaml (best effort). */
function readLoginUsername(workspace: string): string {
  try {
    const cfg = readConfig(workspace);
    const login = (cfg.login as Record<string, string>) ?? {};
    const u = (login.username ?? '').trim();
    return isEnvPlaceholder(u) ? '' : u;
  } catch {
    return '';
  }
}

function readAccountsFile(userWorkspace: string): AccountsFile | null {
  const fp = accountsFilePath(userWorkspace);
  if (!fs.existsSync(fp)) return null;
  try {
    const data = yaml.load(fs.readFileSync(fp, 'utf-8')) as AccountsFile;
    if (data && Array.isArray(data.accounts)) return data;
  } catch { /* corrupt file — rebuild below */ }
  return null;
}

export function saveAccounts(userWorkspace: string, accounts: Account[]): void {
  const fp = accountsFilePath(userWorkspace);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, yaml.dump({ accounts } satisfies AccountsFile, { sortKeys: false, noCompatMode: true }), 'utf-8');
}

/**
 * Load the account registry for an app user. Bootstraps a DEFAULT account on
 * first use, mapping the existing workspace root (backward compatibility — no
 * files moved).
 */
export function loadAccounts(userWorkspace: string): Account[] {
  const existing = readAccountsFile(userWorkspace);
  if (existing && existing.accounts.length > 0) return existing.accounts;

  // Bootstrap: derive a display name from the legacy config.yaml login if present.
  const username = readLoginUsername(userWorkspace);
  const now = nowIso();
  const defaultAccount: Account = {
    id: 'default',
    display_name: username || 'Konto 1',
    is_default: true,
    created_at: now,
    updated_at: now,
    last_sync: null,
    republish_default_days: 30,
  };
  saveAccounts(userWorkspace, [defaultAccount]);
  return [defaultAccount];
}

export function getAccountById(userWorkspace: string, accountId: string | null | undefined): Account | null {
  const accounts = loadAccounts(userWorkspace);
  if (!accountId) return null;
  return accounts.find((a) => a.id === accountId) ?? null;
}

/**
 * Resolve the account to operate on. Falls back to the default account when the
 * requested id is missing/unknown, so account/session routing always resolves
 * to a concrete, isolated workspace.
 */
export function resolveAccount(
  userWorkspace: string,
  accountId: string | null | undefined,
): { account: Account; workspace: string } {
  const accounts = loadAccounts(userWorkspace);
  const account =
    (accountId ? accounts.find((a) => a.id === accountId) : null) ??
    accounts.find((a) => a.is_default) ??
    accounts[0];
  return { account, workspace: accountWorkspace(userWorkspace, account) };
}

function newAccountId(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const suffix = crypto.randomBytes(3).toString('hex');
  const base = slug ? `${slug}_${suffix}` : `konto_${suffix}`;
  return base;
}

/** Create a new, empty, isolated Kleinanzeigen account (sub-workspace). */
export function createAccount(userWorkspace: string, displayName: string): Account {
  const accounts = loadAccounts(userWorkspace);
  const name = displayName.trim() || `Konto ${accounts.length + 1}`;
  let id = newAccountId(name);
  while (accounts.some((a) => a.id === id) || id === 'default') {
    id = newAccountId(name);
  }
  const now = nowIso();
  const account: Account = {
    id,
    display_name: name,
    is_default: false,
    created_at: now,
    updated_at: now,
    last_sync: null,
    republish_default_days: 30,
  };

  // Provision the isolated workspace (same layout the bot expects per workspace).
  const ws = accountWorkspace(userWorkspace, account);
  fs.mkdirSync(path.join(ws, 'ads'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'downloaded-ads'), { recursive: true });
  // Seed a config.yaml with an (empty) login block so readMergedConfig treats
  // this account's login as isolated and never inherits another account's creds.
  if (!fs.existsSync(path.join(ws, 'config.yaml'))) {
    writeConfig(ws, { login: { username: '', password: '' } });
  }

  saveAccounts(userWorkspace, [...accounts, account]);
  return account;
}

export function updateAccount(
  userWorkspace: string,
  accountId: string,
  updates: Partial<Pick<Account, 'display_name' | 'last_sync' | 'republish_default_days'>>,
): Account | null {
  const accounts = loadAccounts(userWorkspace);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;
  if (updates.display_name !== undefined) account.display_name = updates.display_name.trim() || account.display_name;
  if (updates.last_sync !== undefined) account.last_sync = updates.last_sync;
  if (updates.republish_default_days !== undefined) account.republish_default_days = updates.republish_default_days;
  account.updated_at = nowIso();
  saveAccounts(userWorkspace, accounts);
  return account;
}

/**
 * Remove an account and its isolated workspace. The default account cannot be
 * removed (it maps to the app user's root workspace / legacy data).
 */
export function removeAccount(userWorkspace: string, accountId: string): boolean {
  const accounts = loadAccounts(userWorkspace);
  const account = accounts.find((a) => a.id === accountId);
  if (!account || account.is_default) return false;
  const ws = accountWorkspace(userWorkspace, account);
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch { /* best effort */ }
  saveAccounts(userWorkspace, accounts.filter((a) => a.id !== accountId));
  return true;
}

/** Whether an account has usable KA credentials configured. */
export function hasCredentials(workspace: string): boolean {
  try {
    const cfg = readConfig(workspace);
    const login = (cfg.login as Record<string, string>) ?? {};
    const u = (login.username ?? '').trim();
    const p = (login.password ?? '').trim();
    return Boolean(u && p);
  } catch {
    return false;
  }
}

/** Whether a persisted KA session (cookies) exists for this account. */
export function hasSession(workspace: string): boolean {
  return fs.existsSync(path.join(workspace, SESSION_FILE));
}

export function computeLoginStatus(workspace: string): LoginStatus {
  if (hasSession(workspace)) return 'connected';
  if (hasCredentials(workspace)) return 'disconnected';
  return 'no_credentials';
}

/**
 * Set (or clear) an account's Kleinanzeigen login credentials directly in its
 * isolated config.yaml. Unlike /api/system/config this NEVER syncs to the app
 * login (users.yaml) — each KA account is independent from the app account.
 */
export function setAccountCredentials(workspace: string, username: string, password: string): void {
  const cfg = readConfig(workspace);
  const existingLogin = (cfg.login as Record<string, string>) ?? {};
  cfg.login = {
    ...existingLogin,
    username: username.trim(),
    // Empty password keeps the existing one (so a rename/edit doesn't wipe it).
    password: password ? password : existingLogin.password ?? '',
  };
  writeConfig(workspace, cfg);
}

/** Clear an account's live session (cookies + browser profile), keeping credentials. */
export function clearAccountSession(workspace: string): void {
  try { fs.rmSync(path.join(workspace, SESSION_FILE), { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(path.join(workspace, '.temp', 'browser-profile'), { recursive: true, force: true }); } catch { /* ignore */ }
}
