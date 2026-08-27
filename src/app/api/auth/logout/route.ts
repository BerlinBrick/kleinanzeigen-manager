import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS, ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS, isSecureRequest } from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const secure = isSecureRequest(request);
  response.cookies.set(REFRESH_COOKIE, '', { ...REFRESH_COOKIE_OPTIONS, secure, maxAge: 0 });
  response.cookies.set(ACCESS_COOKIE, '', { ...ACCESS_COOKIE_OPTIONS, secure, maxAge: 0 });
  return response;
}
