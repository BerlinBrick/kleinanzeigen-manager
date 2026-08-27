import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { getLibraryAd, libraryImagesDir, setLibraryAdImages } from '@/lib/library/store';
import { ALLOWED_IMAGE_EXTENSIONS, isValidImage, MAX_UPLOAD_SIZE } from '@/lib/images/upload';
import { MAX_AD_IMAGES } from '@/lib/images/formats';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const ad = getLibraryAd(user.userWorkspace, id);
    if (!ad) return NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });

    const uploads = (await request.formData()).getAll('files');
    if (!uploads.length) return NextResponse.json({ detail: 'Keine Bilder ausgewählt' }, { status: 400 });

    const imageDir = libraryImagesDir(user.userWorkspace, id);
    fs.mkdirSync(imageDir, { recursive: true });
    const images = [...ad.images];
    const rejected: { name: string; reason: string }[] = [];

    for (const upload of uploads) {
      if (!(upload instanceof File)) continue;
      if (images.length >= MAX_AD_IMAGES) {
        rejected.push({ name: upload.name, reason: `Maximal ${MAX_AD_IMAGES} Bilder` });
        continue;
      }
      const ext = path.extname(upload.name).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        rejected.push({ name: upload.name, reason: 'Nicht unterstütztes Bildformat' });
        continue;
      }
      const content = Buffer.from(await upload.arrayBuffer());
      if (content.length > MAX_UPLOAD_SIZE) {
        rejected.push({ name: upload.name, reason: `Maximal ${MAX_UPLOAD_SIZE / 1024 / 1024} MB` });
        continue;
      }
      if (!isValidImage(content)) {
        rejected.push({ name: upload.name, reason: 'Ungültige Bilddaten' });
        continue;
      }
      const filename = `${randomUUID()}${ext}`;
      fs.writeFileSync(path.join(imageDir, filename), content);
      images.push(filename);
    }

    const updated = setLibraryAdImages(user.userWorkspace, id, images);
    return NextResponse.json({ images: updated?.images ?? images, rejected });
  } catch (error) {
    return handleApiError(error);
  }
}
