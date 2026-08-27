import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { getLibraryAd, libraryImagesDir, setLibraryAdImages } from '@/lib/library/store';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
};

type Context = { params: Promise<{ id: string; filename: string }> };

async function resolveImage(request: NextRequest, context: Context) {
  const user = await getCurrentUser(request);
  const { id, filename } = await context.params;
  const ad = getLibraryAd(user.userWorkspace, id);
  if (!ad || path.basename(filename) !== filename || !ad.images.includes(filename)) return null;
  return { ad, filename, file: path.join(libraryImagesDir(user.userWorkspace, id), filename), workspace: user.userWorkspace };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const result = await resolveImage(request, context);
    if (!result || !fs.existsSync(result.file)) return NextResponse.json({ detail: 'Bild nicht gefunden' }, { status: 404 });
    return new NextResponse(fs.readFileSync(result.file), {
      headers: {
        'Content-Type': CONTENT_TYPES[path.extname(result.filename).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const result = await resolveImage(request, context);
    if (!result) return NextResponse.json({ detail: 'Bild nicht gefunden' }, { status: 404 });
    try { fs.unlinkSync(result.file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const updated = setLibraryAdImages(result.workspace, result.ad.id, result.ad.images.filter((name) => name !== result.filename));
    return NextResponse.json({ images: updated?.images ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
