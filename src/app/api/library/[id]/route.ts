import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { deleteLibraryAd, getLibraryAd, updateLibraryAd } from '@/lib/library/store';
import { libraryAdSchema } from '@/validation/schemas';
import { validateLibraryCategory } from '@/lib/library/category-validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    const ad = getLibraryAd(user.userWorkspace, id);
    return ad
      ? NextResponse.json(ad)
      : NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    const parsed = libraryAdSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ detail: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' }, { status: 400 });
    }
    const categoryError = validateLibraryCategory(parsed.data.category, parsed.data.attributes);
    if (categoryError) return NextResponse.json({ detail: categoryError }, { status: 400 });
    const ad = updateLibraryAd(user.userWorkspace, id, parsed.data);
    return ad
      ? NextResponse.json(ad)
      : NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    return deleteLibraryAd(user.userWorkspace, id)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
  } catch (error) {
    return handleApiError(error);
  }
}
