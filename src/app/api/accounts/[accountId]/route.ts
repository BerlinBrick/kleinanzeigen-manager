import { handleApiError } from '@/lib/api/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import {
  getAccountById,
  updateAccount,
  removeAccount,
  accountWorkspace,
  clearAccountSession,
} from '@/lib/accounts/accounts';

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const updates: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') updates.display_name = body.display_name;
    if (typeof body.republish_default_days === 'number') {
      updates.republish_default_days = Math.max(1, Math.round(body.republish_default_days));
    }

    const updated = updateAccount(user.userWorkspace, accountId, updates);
    return NextResponse.json({ account: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
    }

    const { accountId } = await context.params;
    const account = getAccountById(user.userWorkspace, accountId);
    if (!account) {
      return NextResponse.json({ detail: 'Konto nicht gefunden' }, { status: 404 });
    }
    if (account.is_default) {
      return NextResponse.json(
        { detail: 'Das Standardkonto kann nicht entfernt werden.' },
        { status: 400 },
      );
    }

    // Kill any live messaging session for this workspace before deleting files.
    const ws = accountWorkspace(user.userWorkspace, account);
    try {
      const { stopSession } = await import('@/lib/messaging/gateway');
      stopSession(ws);
    } catch { /* no session */ }
    clearAccountSession(ws);

    removeAccount(user.userWorkspace, accountId);
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    return handleApiError(error);
  }
}

export { PATCH as PUT };
