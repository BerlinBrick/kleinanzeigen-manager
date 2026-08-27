import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createLibraryAd, listLibraryAds } from '@/lib/library/store';
import { libraryAdSchema } from '@/validation/schemas';
import type { LibraryAdStatus } from '@/types/library';
import { validateLibraryCategory } from '@/lib/library/category-validation';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const search = request.nextUrl.searchParams.get('q')?.trim() || undefined;
    const rawStatus = request.nextUrl.searchParams.get('status');
    const status = rawStatus && ['draft', 'ready', 'online'].includes(rawStatus)
      ? rawStatus as LibraryAdStatus
      : undefined;
    const ads = listLibraryAds(user.userWorkspace, { search, status });
    return NextResponse.json({ ads, total: ads.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const parsed = libraryAdSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ detail: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' }, { status: 400 });
    }
    const categoryError = validateLibraryCategory(parsed.data.category, parsed.data.attributes);
    if (categoryError) return NextResponse.json({ detail: categoryError }, { status: 400 });
    return NextResponse.json(createLibraryAd(user.userWorkspace, parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
