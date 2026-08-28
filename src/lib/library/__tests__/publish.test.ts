import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryAd, getLibraryAd, libraryImagesDir } from '@/lib/library/store';
import { buildLibraryPublishPlan, prepareLibraryDraft, reconcilePublishedLibraryAd } from '@/lib/library/publish';
import { readAd } from '@/lib/yaml/ads';
import { accountWorkspace, createAccount } from '@/lib/accounts/accounts';
import { writeConfig } from '@/lib/yaml/config';
import { applyBrowserMode, applySessionOnlyLogin } from '@/lib/bot/runner';

describe('library publish bridge', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'library-publish-'));
    fs.writeFileSync(path.join(workspace, 'config.yaml'), `ad_defaults:\n  contact:\n    name: Test User\n    zipcode: "10115"\n    location: Berlin\n`);
    fs.mkdirSync(path.join(workspace, '.temp'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.temp', 'login-session.json'), JSON.stringify({ cookies: 'session=valid' }));
  });
  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

  it('maps a ready library ad into the existing bot YAML format', () => {
    const ad = createLibraryAd(workspace, {
      title: 'Vorbereitete Anzeige', description: 'Eine vollständige Beschreibung für das Posting.',
      price: 25, price_type: 'NEGOTIABLE', category: '297/288', location_override: null,
      shipping_type: 'SHIPPING', shipping_costs: 6.19, shipping_options: ['DHL_2'],
      attributes: {}, status: 'ready',
    });
    const imageDir = libraryImagesDir(workspace, ad.id);
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'bild.jpg'), 'image');
    const withImage = { ...ad, images: ['bild.jpg'] };

    const plan = buildLibraryPublishPlan(workspace, withImage, 'default');
    expect(plan.ready).toBe(true);
    expect(plan.adData).toMatchObject({
      title: ad.title, description: ad.description, price: 25, price_type: 'NEGOTIABLE',
      category: '297/288', shipping_type: 'SHIPPING', shipping_options: ['DHL_2'],
      shipping_costs: 6.19, contact: { name: 'Test User', zipcode: '10115', location: 'Berlin' },
    });
    const file = prepareLibraryDraft(workspace, withImage, plan);
    expect(readAd(file)._library_id).toBe(ad.id);
    expect(fs.existsSync(path.join(path.dirname(file), 'bild.jpg'))).toBe(true);
  });

  it('routes one publish to the selected account without binding the template', () => {
    const second = createAccount(workspace, 'Konto Zwei');
    const secondWorkspace = accountWorkspace(workspace, second);
    fs.mkdirSync(path.join(secondWorkspace, '.temp'), { recursive: true });
    fs.writeFileSync(path.join(secondWorkspace, '.temp', 'login-session.json'), JSON.stringify({ cookies: 'second=valid' }));
    writeConfig(secondWorkspace, {
      login: { username: '', password: '' },
      ad_defaults: { contact: { name: 'Zwei', zipcode: '10115', location: 'Berlin' } },
    });
    const ad = createLibraryAd(workspace, {
      title: 'Vorbereitete Anzeige', description: 'Eine vollständige Beschreibung für das Posting.',
      price: 25, price_type: 'NEGOTIABLE', category: '297/288', location_override: null,
      shipping_type: 'PICKUP', shipping_options: [], attributes: {}, status: 'ready',
    });
    fs.mkdirSync(libraryImagesDir(workspace, ad.id), { recursive: true });
    fs.writeFileSync(path.join(libraryImagesDir(workspace, ad.id), 'photo.jpg'), 'image');

    const plan = buildLibraryPublishPlan(workspace, { ...ad, images: ['photo.jpg'] }, second.id);

    expect(plan.ready).toBe(true);
    expect(plan.accountId).toBe(second.id);
    expect(plan.workspace).toBe(secondWorkspace);
    expect(plan.workspace).not.toBe(workspace);
    expect(getLibraryAd(workspace, ad.id)?.published_account_id).toBeNull();

    const runnerConfig: Record<string, unknown> = {
      login: { username: '', password: '' },
      browser: { mode: 'auto', arguments: [] },
    };
    applyBrowserMode(runnerConfig, plan.workspace!, undefined, undefined, true);
    applySessionOnlyLogin(runnerConfig, plan.workspace!);
    expect((runnerConfig.browser as Record<string, unknown>).user_data_dir)
      .toBe(path.join(secondWorkspace, '.temp', 'browser-profile'));
    expect(runnerConfig.login).toEqual({
      username: 'session-only@invalid.local',
      password: 'session-only',
    });
  });

  it('blocks missing sessions, images and account contact fields', () => {
    fs.rmSync(path.join(workspace, '.temp', 'login-session.json'));
    fs.writeFileSync(path.join(workspace, 'config.yaml'), 'ad_defaults:\n  contact: {}\n');
    const ad = createLibraryAd(workspace, {
      title: 'Unvollständige Anzeige', description: 'Eine ausreichend lange Beschreibung.',
      price: 10, price_type: 'FIXED', category: '297/288', location_override: null,
      shipping_type: 'PICKUP', shipping_options: [], attributes: {}, status: 'ready',
    });
    const plan = buildLibraryPublishPlan(workspace, ad, 'default');
    expect(plan.ready).toBe(false);
    expect(plan.errors.join(' ')).toContain('Session');
    expect(plan.errors.join(' ')).toContain('Bild');
    expect(plan.errors.join(' ')).toContain('Kontaktname');
    expect(plan.errors.join(' ')).toContain('Postleitzahl');
    expect(plan.errors.join(' ')).toContain('Standort');
  });

  it('blocks an already published template even when its status is changed back to ready', () => {
    const ad = createLibraryAd(workspace, {
      title: 'Legosteine 200 Stück', description: 'Bereits veröffentlichte und geschützte Vorlage.',
      price: 31, price_type: 'NEGOTIABLE', category: '297/288', location_override: null,
      shipping_type: 'PICKUP', shipping_options: [], attributes: {}, status: 'ready',
    });
    const published = { ...ad, kleinanzeigen_id: 3496141302 };

    const plan = buildLibraryPublishPlan(workspace, published, 'default');

    expect(plan.ready).toBe(false);
    expect(plan.errors.join(' ')).toContain('3496141302');
  });

  it('reconciles only a new management ad with matching title and price', () => {
    const template = {
      title: 'Legosteine 200 Stück', price: 31, price_type: 'NEGOTIABLE' as const,
      publish_started_at: '2026-08-27T10:57:42.863Z', publish_baseline_ids: [10, 11, 12],
    };
    const result = reconcilePublishedLibraryAd(template, [
      { id: 10, title: template.title, price: '31 €', category: '', viewCount: 0, watchCount: 0, replies: 0, imageCount: 1, state: 'ACTIVE' },
      { id: 13, title: '  LEGOSTEINE   200 Stück ', price: '31,00 € VB', category: '', viewCount: 0, watchCount: 0, replies: 0, imageCount: 1, state: 'ACTIVE', creationDate: '2026-08-27T10:59:00.000Z' },
    ]);
    expect(result.ad?.id).toBe(13);
    expect(result.ambiguous).toBe(false);
  });

  it('does not infer success from an old or price-mismatched ad', () => {
    const result = reconcilePublishedLibraryAd({
      title: 'Legosteine', price: 31, price_type: 'FIXED',
      publish_started_at: '2026-08-27T10:57:42.863Z', publish_baseline_ids: [],
    }, [
      { id: 13, title: 'Legosteine', price: '32 €', category: '', viewCount: 0, watchCount: 0, replies: 0, imageCount: 1, state: 'ACTIVE' },
      { id: 14, title: 'Legosteine', price: '31 €', category: '', viewCount: 0, watchCount: 0, replies: 0, imageCount: 1, state: 'ACTIVE', creationDate: '2026-08-27T10:00:00.000Z' },
    ]);
    expect(result).toEqual({ ad: null, ambiguous: false });
  });
});
