import fs from 'fs';
import path from 'path';
import type { LibraryAd } from '@/types/library';
import { getAccountById, accountWorkspace } from '@/lib/accounts/accounts';
import { validateLibraryCategory } from '@/lib/library/category-validation';
import { libraryImagesDir } from '@/lib/library/store';
import { findAdFiles, readAd, writeAd } from '@/lib/yaml/ads';
import { readMergedConfig } from '@/lib/yaml/config';
import { loadSessionCookies } from '@/lib/ka/management-api';
import type { KaManageAd } from '@/lib/ka/management-api';

export interface LibraryPublishPlan {
  ready: boolean;
  errors: string[];
  accountId: string | null;
  accountName: string | null;
  workspace: string | null;
  adData: Record<string, unknown> | null;
}

export function buildLibraryPublishPlan(userWorkspace: string, ad: LibraryAd, accountId?: string | null): LibraryPublishPlan {
  const errors: string[] = [];
  const account = accountId ? getAccountById(userWorkspace, accountId) : null;
  if (!account) errors.push('Bitte ein gültiges Kleinanzeigen-Konto für diese Veröffentlichung auswählen.');
  const workspace = account ? accountWorkspace(userWorkspace, account) : null;

  if (ad.status !== 'ready') errors.push('Die Vorlage muss den Status „Bereit“ haben.');
  if (ad.kleinanzeigen_id != null) errors.push(`Diese Vorlage wurde bereits als Kleinanzeigen-ID ${ad.kleinanzeigen_id} veröffentlicht und wird nicht erneut veröffentlicht.`);
  if (!ad.title.trim()) errors.push('Titel fehlt.');
  if (!ad.description.trim()) errors.push('Beschreibung fehlt.');
  if (!ad.images.length) errors.push('Mindestens ein Bild ist erforderlich.');
  const categoryError = validateLibraryCategory(ad.category, ad.attributes);
  if (categoryError) errors.push(categoryError);
  if (ad.shipping_type === 'SHIPPING' && !ad.shipping_options.length) errors.push('Mindestens eine Paketoption ist für Versand erforderlich.');

  let contact: Record<string, string> = {};
  if (workspace) {
    if (!loadSessionCookies(workspace)) errors.push('Für das ausgewählte Konto fehlt eine aktive Kleinanzeigen-Session.');
    const defaults = (readMergedConfig(workspace).ad_defaults as Record<string, unknown> | undefined)?.contact as Record<string, string> | undefined;
    contact = {
      name: defaults?.name?.trim() ?? '',
      zipcode: defaults?.zipcode?.trim() ?? '',
      location: ad.location_override?.trim() || defaults?.location?.trim() || '',
      street: defaults?.street?.trim() ?? '',
      phone: defaults?.phone?.trim() ?? '',
    };
    if (!contact.name) errors.push('Im ausgewählten Konto fehlt der Kontaktname.');
    if (!contact.zipcode) errors.push('Im ausgewählten Konto fehlt die Postleitzahl.');
    if (!contact.location) errors.push('Im ausgewählten Konto fehlt der Standort.');

    const foreignDrafts = findAdFiles(workspace).filter((file) => {
      const candidate = readAd(file);
      return candidate.id == null && candidate.active !== false && candidate._library_id !== ad.id;
    });
    if (foreignDrafts.length) errors.push(`Im Konto liegen ${foreignDrafts.length} weitere aktive Entwürfe. Veröffentlichung ist blockiert, damit diese nicht unbeabsichtigt mitgesendet werden.`);
  }

  const sourceDir = libraryImagesDir(userWorkspace, ad.id);
  for (const image of ad.images) {
    if (!fs.existsSync(path.join(sourceDir, image))) errors.push(`Bilddatei fehlt: ${image}`);
  }

  const adData: Record<string, unknown> = {
    _library_id: ad.id,
    active: true,
    type: 'OFFER',
    title: ad.title,
    description: ad.description,
    category: ad.category,
    price: ad.price_type === 'GIVE_AWAY' ? 0 : ad.price,
    price_type: ad.price_type,
    shipping_type: ad.shipping_type,
    shipping_options: ad.shipping_type === 'SHIPPING' ? ad.shipping_options : [],
    ...(ad.shipping_type === 'SHIPPING' && ad.shipping_costs != null ? { shipping_costs: ad.shipping_costs } : {}),
    sell_directly: false,
    images: ad.images,
    contact,
    special_attributes: ad.attributes,
  };

  return { ready: errors.length === 0, errors, accountId: account?.id ?? null, accountName: account?.display_name ?? null, workspace, adData };
}

export function libraryPublishDir(workspace: string, libraryId: string): string {
  return path.join(workspace, 'ads', `ad_library_${libraryId}`);
}

export function prepareLibraryDraft(userWorkspace: string, ad: LibraryAd, plan: LibraryPublishPlan): string {
  if (!plan.ready || !plan.workspace || !plan.adData) throw new Error(plan.errors[0] ?? 'Vorlage ist nicht veröffentlichungsbereit.');
  const targetDir = libraryPublishDir(plan.workspace, ad.id);
  if (fs.existsSync(targetDir)) throw new Error('Für diese Vorlage existiert bereits ein vorbereiteter Posting-Entwurf.');
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    for (const image of ad.images) fs.copyFileSync(path.join(libraryImagesDir(userWorkspace, ad.id), image), path.join(targetDir, image));
    const file = path.join(targetDir, `ad_library_${ad.id}.yaml`);
    writeAd(file, plan.adData);
    return file;
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}

export function cleanupFailedLibraryDraft(workspace: string, libraryId: string): void {
  const dir = libraryPublishDir(workspace, libraryId);
  try {
    const yaml = path.join(dir, `ad_library_${libraryId}.yaml`);
    const ad = fs.existsSync(yaml) ? readAd(yaml) : null;
    if (!ad || ad.id == null) fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* keep ambiguous data */ }
}

export function findPublishedLibraryAd(workspace: string, libraryId: string, title: string, category: string): { id: number; file: string } | null {
  for (const file of findAdFiles(workspace)) {
    const candidate = readAd(file);
    if (typeof candidate.id !== 'number') continue;
    if (candidate._library_id === libraryId || (candidate.title === title && candidate.category === category)) return { id: candidate.id, file };
  }
  return null;
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function numericPrice(value: string): number | null {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function reconcilePublishedLibraryAd(
  ad: Pick<LibraryAd, 'title' | 'price' | 'price_type' | 'publish_started_at' | 'publish_baseline_ids'>,
  onlineAds: KaManageAd[],
): { ad: KaManageAd | null; ambiguous: boolean } {
  const baseline = new Set(ad.publish_baseline_ids);
  const expectedPrice = ad.price_type === 'GIVE_AWAY' ? 0 : ad.price;
  const startedAt = ad.publish_started_at ? Date.parse(ad.publish_started_at) : null;
  const candidates = onlineAds.filter((candidate) => {
    if (baseline.has(candidate.id) || normalizedTitle(candidate.title) !== normalizedTitle(ad.title)) return false;
    const price = numericPrice(candidate.price);
    if (price == null || Math.abs(price - expectedPrice) > 0.01) return false;
    const candidateTime = Date.parse(candidate.creationDate || candidate.activationDate || '');
    return startedAt == null || !Number.isFinite(candidateTime) || candidateTime >= startedAt - 5 * 60_000;
  });
  return { ad: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1 };
}
