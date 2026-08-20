import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  getAccountById,
  accountWorkspace,
  clearAccountSession,
  computeLoginStatus,
} from '@/lib/accounts/accounts';

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

/** POST: disconnect an account — kill its live session and clear cookies/profile (keeps credentials). */
export async function POST(request: NextRequest, context: RouteContext) {
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
    try {
      const { stopSession } = await import('@/lib/messaging/gateway');
      stopSession(ws);
    } catch { /* no session */ }
    clearAccountSession(ws);

    return NextResponse.json({ status: 'ok', login_status: computeLoginStatus(ws) });
  } catch (error) {
    return handleApiError(error);
  }
}
