import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { LibraryAd, LibraryAdInput, LibraryAdStatus, LibraryPriceType, LibraryShippingType } from '@/types/library';

const DATA_DIR = '.data';
const DB_FILE = 'ad-library.sqlite';
const IMAGE_DIR = 'ad-library-images';

interface LibraryRow {
  id: string;
  title: string;
  description: string;
  price: number;
  price_type: LibraryPriceType;
  category: string;
  location: string;
  shipping_type: LibraryShippingType;
  shipping_costs: number | null;
  shipping_options: string;
  attributes: string;
  images: string;
  status: LibraryAdStatus;
  account_id: string | null;
  publish_job_id: string | null;
  publish_started_at: string | null;
  publish_baseline_ids: string;
  kleinanzeigen_id: number | null;
  kleinanzeigen_url: string | null;
  created_at: string;
  updated_at: string;
}

function openDatabase(workspace: string): DatabaseSync {
  const dir = path.join(workspace, DATA_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, DB_FILE));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS library_ads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'online')),
      account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS library_ads_status_idx ON library_ads(status);
    CREATE INDEX IF NOT EXISTS library_ads_updated_idx ON library_ads(updated_at DESC);
  `);
  const columns = new Set((db.prepare('PRAGMA table_info(library_ads)').all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has('price_type')) db.exec("ALTER TABLE library_ads ADD COLUMN price_type TEXT NOT NULL DEFAULT 'NEGOTIABLE'");
  if (!columns.has('shipping_type')) db.exec("ALTER TABLE library_ads ADD COLUMN shipping_type TEXT NOT NULL DEFAULT 'PICKUP'");
  if (!columns.has('shipping_costs')) db.exec('ALTER TABLE library_ads ADD COLUMN shipping_costs REAL');
  if (!columns.has('attributes')) db.exec("ALTER TABLE library_ads ADD COLUMN attributes TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has('shipping_options')) db.exec("ALTER TABLE library_ads ADD COLUMN shipping_options TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has('publish_job_id')) db.exec('ALTER TABLE library_ads ADD COLUMN publish_job_id TEXT');
  if (!columns.has('publish_started_at')) db.exec('ALTER TABLE library_ads ADD COLUMN publish_started_at TEXT');
  if (!columns.has('publish_baseline_ids')) db.exec("ALTER TABLE library_ads ADD COLUMN publish_baseline_ids TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has('kleinanzeigen_id')) db.exec('ALTER TABLE library_ads ADD COLUMN kleinanzeigen_id INTEGER');
  if (!columns.has('kleinanzeigen_url')) db.exec('ALTER TABLE library_ads ADD COLUMN kleinanzeigen_url TEXT');
  return db;
}

function fromRow(row: LibraryRow): LibraryAd {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(row.images) as unknown;
    if (Array.isArray(parsed)) images = parsed.filter((item): item is string => typeof item === 'string');
  } catch { /* invalid legacy value → empty list */ }
  let attributes: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.attributes || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      attributes = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch { /* invalid legacy value → empty object */ }
  let shippingOptions: string[] = [];
  try {
    const parsed = JSON.parse(row.shipping_options || '[]') as unknown;
    if (Array.isArray(parsed)) shippingOptions = parsed.filter((item): item is string => typeof item === 'string');
  } catch { /* invalid legacy value → empty list */ }
  const { location, ...rest } = row;
  let publishBaselineIds: number[] = [];
  try {
    const parsed = JSON.parse(row.publish_baseline_ids || '[]') as unknown;
    if (Array.isArray(parsed)) publishBaselineIds = parsed.filter((item): item is number => typeof item === 'number' && Number.isInteger(item));
  } catch { /* invalid legacy value → empty list */ }
  return { ...rest, images, attributes, shipping_options: shippingOptions, publish_baseline_ids: publishBaselineIds, location_override: location || null };
}

export function libraryImagesDir(workspace: string, id: string): string {
  return path.join(workspace, DATA_DIR, IMAGE_DIR, id);
}

export function listLibraryAds(
  workspace: string,
  options: { search?: string; status?: LibraryAdStatus } = {},
): LibraryAd[] {
  const db = openDatabase(workspace);
  try {
    const clauses: string[] = [];
    const params: Record<string, string> = {};
    if (options.search) {
      clauses.push('(title LIKE :search OR description LIKE :search OR category LIKE :search OR location LIKE :search)');
      params.search = `%${options.search}%`;
    }
    if (options.status) {
      clauses.push('status = :status');
      params.status = options.status;
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM library_ads${where} ORDER BY updated_at DESC`).all(params) as unknown as LibraryRow[];
    return rows.map(fromRow);
  } finally {
    db.close();
  }
}

export function getLibraryAd(workspace: string, id: string): LibraryAd | null {
  const db = openDatabase(workspace);
  try {
    const row = db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow | undefined;
    return row ? fromRow(row) : null;
  } finally {
    db.close();
  }
}

export function createLibraryAd(workspace: string, input: LibraryAdInput): LibraryAd {
  const db = openDatabase(workspace);
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO library_ads
      (id, title, description, price, price_type, category, location, shipping_type, shipping_costs, shipping_options, attributes, images, status, account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`)
      .run(id, input.title, input.description, input.price, input.price_type, input.category, input.location_override ?? '', input.shipping_type, input.shipping_costs ?? null, JSON.stringify(input.shipping_options ?? []), JSON.stringify(input.attributes ?? {}), input.status, input.account_id ?? null, now, now);
    return fromRow(db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow);
  } finally {
    db.close();
  }
}

export function updateLibraryAd(workspace: string, id: string, input: LibraryAdInput): LibraryAd | null {
  const db = openDatabase(workspace);
  try {
    const result = db.prepare(`UPDATE library_ads SET
      title = ?, description = ?, price = ?, price_type = ?, category = ?, location = ?,
      shipping_type = ?, shipping_costs = ?, shipping_options = ?, attributes = ?, status = ?, account_id = ?, updated_at = ? WHERE id = ?`)
      .run(input.title, input.description, input.price, input.price_type, input.category, input.location_override ?? '', input.shipping_type, input.shipping_costs ?? null, JSON.stringify(input.shipping_options ?? []), JSON.stringify(input.attributes ?? {}), input.status, input.account_id ?? null, new Date().toISOString(), id);
    if (result.changes === 0) return null;
    return fromRow(db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow);
  } finally {
    db.close();
  }
}

export function setLibraryAdImages(workspace: string, id: string, images: string[]): LibraryAd | null {
  const db = openDatabase(workspace);
  try {
    const result = db.prepare('UPDATE library_ads SET images = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(images), new Date().toISOString(), id);
    if (result.changes === 0) return null;
    return fromRow(db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow);
  } finally {
    db.close();
  }
}

export function duplicateLibraryAd(workspace: string, id: string): LibraryAd | null {
  const source = getLibraryAd(workspace, id);
  if (!source) return null;
  const duplicate = createLibraryAd(workspace, {
    title: `${source.title} (Kopie)`,
    description: source.description,
    price: source.price,
    price_type: source.price_type,
    category: source.category,
    location_override: source.location_override,
    shipping_type: source.shipping_type,
    shipping_costs: source.shipping_costs,
    shipping_options: source.shipping_options,
    attributes: source.attributes,
    status: 'draft',
    account_id: source.account_id,
  });
  if (source.images.length) {
    const sourceDir = libraryImagesDir(workspace, source.id);
    const targetDir = libraryImagesDir(workspace, duplicate.id);
    fs.mkdirSync(targetDir, { recursive: true });
    const copied: string[] = [];
    for (const image of source.images) {
      const sourceFile = path.join(sourceDir, image);
      if (!fs.existsSync(sourceFile)) continue;
      fs.copyFileSync(sourceFile, path.join(targetDir, image));
      copied.push(image);
    }
    return setLibraryAdImages(workspace, duplicate.id, copied) ?? duplicate;
  }
  return duplicate;
}

export function setLibraryPublishJob(
  workspace: string,
  id: string,
  jobId: string | null,
  baselineIds: number[] = [],
  startedAt: string | null = jobId ? new Date().toISOString() : null,
): LibraryAd | null {
  const db = openDatabase(workspace);
  try {
    const result = db.prepare('UPDATE library_ads SET publish_job_id = ?, publish_started_at = ?, publish_baseline_ids = ?, updated_at = ? WHERE id = ?')
      .run(jobId, startedAt, JSON.stringify(baselineIds), new Date().toISOString(), id);
    if (result.changes === 0) return null;
    return fromRow(db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow);
  } finally { db.close(); }
}

export function markLibraryAdOnline(workspace: string, id: string, kleinanzeigenId: number, url: string): LibraryAd | null {
  const db = openDatabase(workspace);
  try {
    const result = db.prepare("UPDATE library_ads SET status = 'online', kleinanzeigen_id = ?, kleinanzeigen_url = ?, updated_at = ? WHERE id = ?")
      .run(kleinanzeigenId, url, new Date().toISOString(), id);
    if (result.changes === 0) return null;
    return fromRow(db.prepare('SELECT * FROM library_ads WHERE id = ?').get(id) as unknown as LibraryRow);
  } finally { db.close(); }
}

export function deleteLibraryAd(workspace: string, id: string): boolean {
  const db = openDatabase(workspace);
  try {
    const result = db.prepare('DELETE FROM library_ads WHERE id = ?').run(id);
    if (result.changes === 0) return false;
  } finally {
    db.close();
  }
  fs.rmSync(libraryImagesDir(workspace, id), { recursive: true, force: true });
  return true;
}
