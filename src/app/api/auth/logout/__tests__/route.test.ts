import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { REFRESH_COOKIE, ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST } from '../route';

describe('POST /api/auth/logout', () => {
  const request = () => new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });

  it('returns 200 with { ok: true }', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it('clears the REFRESH_COOKIE with maxAge: 0', async () => {
    const response = await POST(request());
    const cookie = response.cookies.get(REFRESH_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('clears the ACCESS_COOKIE with maxAge: 0', async () => {
    const response = await POST(request());
    const cookie = response.cookies.get(ACCESS_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('preserves the REFRESH_COOKIE path scope when clearing', async () => {
    const response = await POST(request());
    const cookie = response.cookies.get(REFRESH_COOKIE);
    expect(cookie?.path).toBe('/api/auth/refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
  });

  it('preserves the ACCESS_COOKIE path scope when clearing', async () => {
    const response = await POST(request());
    const cookie = response.cookies.get(ACCESS_COOKIE);
    expect(cookie?.path).toBe('/api');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
  });

  it('uses Secure cookies for Codespaces', async () => {
    const response = await POST(new NextRequest(
      'http://localhost/api/auth/logout',
      { method: 'POST', headers: { host: 'example-3000.app.github.dev' } },
    ));
    expect(response.cookies.get(REFRESH_COOKIE)?.secure).toBe(true);
    expect(response.cookies.get(ACCESS_COOKIE)?.secure).toBe(true);
  });
});
