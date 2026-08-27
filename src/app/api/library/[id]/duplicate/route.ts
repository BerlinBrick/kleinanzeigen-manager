import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { duplicateLibraryAd } from '@/lib/library/store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const ad = duplicateLibraryAd(user.userWorkspace, id);
    return ad
      ? NextResponse.json(ad, { status: 201 })
      : NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
  } catch (error) {
    return handleApiError(error);
  }
}
