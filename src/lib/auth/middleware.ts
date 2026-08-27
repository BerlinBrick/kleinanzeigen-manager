import { type NextRequest } from 'next/server';
import { ApiError } from '@/lib/security/validation';
import { decodeJwt } from '@/lib/auth/jwt';
import { loadUsers, ensureJwtSecret, getUserWorkspace } from '@/lib/yaml/users';
import { resolveAccount } from '@/lib/accounts/accounts';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  display_name: string;
  /**
   * Account-scoped workspace: the isolated workspace of the CURRENTLY selected
   * Kleinanzeigen account (from the `x-account-id` request header). Every KA
   * operation (login/publish/messages/jobs) runs against this workspace, so it
   * can never accidentally use another account's session.
   */
  workspace: string;
  /** The app user's root workspace (shared, account-independent — e.g. templates). */
  userWorkspace: string;
  /** The resolved Kleinanzeigen account id for this request. */
  accountId: string;
}

/**
 * Extract Bearer token from request, decode JWT, load user from users.yaml,
 * and verify token_version matches. Returns authenticated user with workspace path.
 */
export async function getCurrentUser(request: NextRequest): Promise<AuthUser> {
  const data = loadUsers();
  if (!data || !data.users?.length) {
    throw new ApiError(401, 'Setup required. No users configured.');
  }

  const authHeader = request.headers.get('authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  token ??= request.cookies.get(ACCESS_COOKIE)?.value ?? null;

  if (!token) {
    throw new ApiError(
      401,
      'Authentication required. Provide Authorization: Bearer <token>',
    );
  }

  const secret = ensureJwtSecret(data);
  const payload = decodeJwt(token, secret);

  const userId = payload.sub;
  const user = data.users.find((u) => u.id === userId);
  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  // payload.tv may be absent on tokens issued before token_version was introduced
  if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
    throw new ApiError(401, 'Token invalidated');
  }

  const userWorkspace = getUserWorkspace(userId);
  // Resolve the selected Kleinanzeigen account (x-account-id header) to its
  // isolated workspace. Falls back to the default account when absent/unknown.
  const requestedAccountId = request.headers.get('x-account-id');
  const { account, workspace } = resolveAccount(userWorkspace, requestedAccountId);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    display_name: user.display_name ?? '',
    workspace,
    userWorkspace,
    accountId: account.id,
  };
}

/**
 * Throw 403 if user is not an admin.
 */
export function requireAdmin(user: AuthUser): void {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Admin access required');
  }
}
