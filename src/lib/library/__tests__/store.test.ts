import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLibraryAd,
  deleteLibraryAd,
  duplicateLibraryAd,
  getLibraryAd,
  libraryImagesDir,
  listLibraryAds,
  markLibraryAdOnline,
  setLibraryPublishJob,
  setLibraryAdImages,
  updateLibraryAd,
} from '@/lib/library/store';

describe('ad library store', () => {
  let workspace: string;

  beforeEach(() => { workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-library-')); });
  afterEach(() => { fs.rmSync(workspace, { recursive: true, force: true }); });

  const input = {
    title: 'Vintage Schreibtischlampe',
    description: 'Sehr gut erhaltene Lampe aus Metall.',
    price: 35,
    price_type: 'NEGOTIABLE' as const,
    category: 'Haus & Garten',
    location_override: null,
    shipping_type: 'SHIPPING' as const,
    shipping_costs: 4.99,
    shipping_options: ['DHL_2'],
    attributes: { condition_s: 'gut' },
    status: 'ready' as const,
  };

  it('creates, reads, filters, updates and deletes an ad', () => {
    const created = createLibraryAd(workspace, input);
    expect(created.id).toBeTruthy();
    expect(created.images).toEqual([]);
    expect(created.location_override).toBeNull();
    expect(created.shipping_costs).toBe(4.99);
    expect(created.shipping_options).toEqual(['DHL_2']);
    expect(created.attributes).toEqual({ condition_s: 'gut' });
    expect(listLibraryAds(workspace)).toHaveLength(1);
    expect(listLibraryAds(workspace, { search: 'lampe', status: 'ready' })).toHaveLength(1);

    const updated = updateLibraryAd(workspace, created.id, { ...input, title: 'Neue Schreibtischlampe', status: 'draft' });
    expect(updated?.title).toBe('Neue Schreibtischlampe');
    expect(updated?.status).toBe('draft');
    expect('account_id' in (getLibraryAd(workspace, created.id) ?? {})).toBe(false);

    expect(deleteLibraryAd(workspace, created.id)).toBe(true);
    expect(getLibraryAd(workspace, created.id)).toBeNull();
  });

  it('stores publish account metadata separately from the reusable template', () => {
    const created = createLibraryAd(workspace, input);
    const pending = setLibraryPublishJob(workspace, created.id, 'job-1', [10], '2026-08-28T10:00:00.000Z', 'cat-2-go', 'Cat-2-Go');
    expect(pending?.publish_account_id).toBe('cat-2-go');
    expect(pending?.published_account_id).toBeNull();

    const published = markLibraryAdOnline(workspace, created.id, 123456, 'https://example.test/123456', 'cat-2-go', 'Cat-2-Go');
    expect(published?.kleinanzeigen_id).toBe(123456);
    expect(published?.published_account_id).toBe('cat-2-go');
    expect(published?.published_account_name).toBe('Cat-2-Go');
    expect(published?.publish_account_id).toBeNull();
    expect('account_id' in (published ?? {})).toBe(false);
  });

  it('duplicates metadata and persistent images as a draft', () => {
    const created = createLibraryAd(workspace, input);
    const imageDir = libraryImagesDir(workspace, created.id);
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'photo.jpg'), 'image-data');
    setLibraryAdImages(workspace, created.id, ['photo.jpg']);
    setLibraryPublishJob(workspace, created.id, 'source-job', [10, 11], '2026-08-28T10:00:00.000Z', 'default', 'Konto 1');
    markLibraryAdOnline(workspace, created.id, 3496141302, 'https://example.test/3496141302', 'default', 'Konto 1');

    const duplicate = duplicateLibraryAd(workspace, created.id);
    expect(duplicate?.title).toContain('(Kopie)');
    expect(duplicate?.status).toBe('draft');
    expect(duplicate?.images).toEqual(['photo.jpg']);
    expect(duplicate).toMatchObject({
      kleinanzeigen_id: null,
      kleinanzeigen_url: null,
      publish_job_id: null,
      publish_started_at: null,
      publish_baseline_ids: [],
      publish_account_id: null,
      published_account_id: null,
    });
    expect(fs.readFileSync(path.join(libraryImagesDir(workspace, duplicate!.id), 'photo.jpg'), 'utf8')).toBe('image-data');
  });

  it('keeps different workspaces isolated', () => {
    createLibraryAd(workspace, input);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-library-other-'));
    try { expect(listLibraryAds(other)).toEqual([]); } finally { fs.rmSync(other, { recursive: true, force: true }); }
  });

  it('migrates records created by the first library schema', () => {
    const dataDir = path.join(workspace, '.data');
    fs.mkdirSync(dataDir, { recursive: true });
    const db = new DatabaseSync(path.join(dataDir, 'ad-library.sqlite'));
    db.exec(`CREATE TABLE library_ads (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, price REAL NOT NULL,
      category TEXT NOT NULL, location TEXT NOT NULL, images TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft', account_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.prepare('INSERT INTO library_ads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('legacy-id', 'Alte Vorlage', 'Eine bereits gespeicherte Beschreibung', 10, 'Alte Kategorie', 'Hamburg', '[]', 'draft', null, '2026-01-01', '2026-01-01');
    db.close();

    const migrated = getLibraryAd(workspace, 'legacy-id');
    expect(migrated?.title).toBe('Alte Vorlage');
    expect(migrated?.location_override).toBe('Hamburg');
    expect(migrated?.price_type).toBe('NEGOTIABLE');
    expect(migrated?.shipping_type).toBe('PICKUP');
    expect(migrated?.shipping_options).toEqual([]);
    expect(migrated?.attributes).toEqual({});
  });
});
