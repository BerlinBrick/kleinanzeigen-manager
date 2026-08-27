/**
 * Cookie configuration for auth tokens.
 *
 * Secure flag logic:
 *   - Local/LAN (HTTP, default): COOKIE_SECURE unset or =false → secure: false
 *   - Public/HTTPS:              COOKIE_SECURE=true             → secure: true
 */

import type { NextRequest } from 'next/server';

const IS_SECURE = process.env.COOKIE_SECURE === 'true';

/** Use Secure cookies automatically behind HTTPS proxies such as Codespaces. */
export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  return IS_SECURE || forwardedProto === 'https' || host.endsWith('.app.github.dev');
}

// Long-lived refresh token — httpOnly, only sent to the refresh endpoint
export const REFRESH_COOKIE = 'kb_refresh_token';
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_SECURE,
  sameSite: 'strict' as const,
  path: '/api/auth/refresh',
};
export const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Short-lived access token mirror — httpOnly, sent to all /api routes (including <img> requests)
export const ACCESS_COOKIE = 'kb_token';
export const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_SECURE,
  sameSite: 'strict' as const,
  path: '/api',
  maxAge: 15 * 60,
};
