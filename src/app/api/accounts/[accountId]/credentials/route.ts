import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  getAccountById,
  accountWorkspace,
  setAccountCredentials,
  computeLoginStatus,
  clearAccountSession,
} from '@/lib/accounts/accounts';
import { isEnvPlaceholder, readConfig } from '@/lib/yaml/config';

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

const MASKED = '••••••••';

/** GET: return the account's KA username + whether a password is stored (never the password itself). */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }
    const { accountId } = await context.params;
    const account = getAccountById(user.userWorkspace, accountId);
    if (!account) {
      return NextResponse.json({ detail: 'Konto nicht gefunden' }, { status: 404 });
    }
    const ws = accountWorkspace(user.userWorkspace, account);
    const login = (readConfig(ws).login as Record<string, string>) ?? {};
    return NextResponse.json({
      username: isEnvPlaceholder(login.username) ? '' : login.username ?? '',
      password: login.password ? MASKED : '',
      login_status: computeLoginStatus(ws),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT: set the Kleinanzeigen login credentials for this account (isolated; never synced to app login). */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }
    const { accountId } = await context.params;
    const account = getAccountById(user.userWorkspace, accountId);
    if (!account) {
      return NextResponse.json({ detail: 'Konto nicht gefunden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' && body.password !== MASKED ? body.password : '';
    if (!username) {
      return NextResponse.json({ detail: 'Benutzername (E-Mail) ist erforderlich' }, { status: 400 });
    }

    const ws = accountWorkspace(user.userWorkspace, account);
    setAccountCredentials(ws, username, password);
    // New credentials invalidate any cached session so the next login uses them.
    if (password) clearAccountSession(ws);

    return NextResponse.json({ status: 'ok', login_status: computeLoginStatus(ws) });
  } catch (error) {
    return handleApiError(error);
  }
}
