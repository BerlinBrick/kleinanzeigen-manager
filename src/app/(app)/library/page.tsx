'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { Button, EmptyState, Input, Spinner, Textarea, useToast, showConfirm } from '@/components/ui';
import type { LibraryAd, LibraryAdInput, LibraryAdStatus } from '@/types/library';
import { LibraryCategoryAttributes, LibraryCategoryPicker, validateLibraryAttributes } from '@/components/library/LibraryCategoryPicker';
import { prepareLibraryImage } from '@/lib/images/library-upload-client';
import { SHIPPING_SIZES } from '@/lib/shipping';
import type { Job, JobStatus } from '@/types/bot';
import styles from './library.module.scss';

const STATUS_LABELS: Record<LibraryAdStatus, string> = {
  draft: 'Entwurf', ready: 'Bereit', online: 'Online',
};

const EMPTY_FORM: LibraryAdInput = {
  title: '', description: '', price: 0, price_type: 'NEGOTIABLE', category: '', location_override: null,
  shipping_type: 'PICKUP', shipping_costs: null, shipping_options: [], attributes: {}, status: 'draft', account_id: null,
};

interface AccountOption { id: string; display_name: string }

export default function LibraryPage() {
  const { toast } = useToast();
  const [ads, setAds] = useState<LibraryAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | LibraryAdStatus>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [editing, setEditing] = useState<LibraryAd | 'new' | null>(null);
  const [publishJobs, setPublishJobs] = useState<Record<string, { status: JobStatus; error?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ ads: LibraryAd[] }>('/api/library');
      setAds(data.ads);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de');
    return ads.filter((ad) =>
      (status === 'all' || ad.status === status)
      && (!term || [ad.title, ad.description, ad.category, ad.location_override ?? ''].some((value) => value.toLocaleLowerCase('de').includes(term)))
    );
  }, [ads, search, status]);

  const remove = useCallback(async (ad: LibraryAd) => {
    if (!await showConfirm('Vorlage löschen', `Soll „${ad.title}“ wirklich gelöscht werden?`, 'Löschen', 'Abbrechen')) return;
    await api.delete(`/api/library/${ad.id}`);
    toast('success', 'Vorlage gelöscht');
    await load();
  }, [load, toast]);

  const duplicate = useCallback(async (ad: LibraryAd) => {
    await api.post(`/api/library/${ad.id}/duplicate`);
    toast('success', 'Vorlage dupliziert');
    await load();
  }, [load, toast]);

  const publish = useCallback(async (ad: LibraryAd) => {
    try {
      const preflight = await api.post<{ ready: true; account_name: string; title: string; image_count: number }>(`/api/library/${ad.id}/publish`, { confirm: false });
      const confirmed = await showConfirm(
        'Anzeige jetzt veröffentlichen',
        `„${preflight.title}“ wird mit ${preflight.image_count} Bild(ern) über das Konto „${preflight.account_name}“ öffentlich auf Kleinanzeigen eingestellt. Fortfahren?`,
        'Jetzt öffentlich veröffentlichen',
        'Abbrechen',
      );
      if (!confirmed) return;
      const started = await api.post<{ job: Job }>(`/api/library/${ad.id}/publish`, { confirm: true });
      setPublishJobs((current) => ({ ...current, [ad.id]: { status: started.job.status } }));
      toast('success', 'Posting-Job gestartet');

      const poll = async () => {
        const result = await api.get<{ job: Job | null; ad: LibraryAd; error?: string }>(`/api/library/${ad.id}/publish`);
        if (!result.job) return;
        setPublishJobs((current) => ({ ...current, [ad.id]: { status: result.job!.status, error: result.error } }));
        if (['queued', 'running', 'waiting_for_user', 'mfa_required'].includes(result.job.status)) {
          window.setTimeout(() => void poll(), 2000);
        } else if (result.ad.status === 'online') {
          toast('success', `Anzeige veröffentlicht: ID ${result.ad.kleinanzeigen_id}`);
          await load();
        } else if (result.error) {
          toast('error', result.error);
        }
      };
      window.setTimeout(() => void poll(), 1000);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Veröffentlichung konnte nicht vorbereitet werden.');
    }
  }, [load, toast]);

  if (editing) {
    return (
      <LibraryForm
        ad={editing === 'new' ? undefined : editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h2>Anzeigen-Bibliothek</h2>
          <p>Fertige Anzeigen vorbereiten und dauerhaft für eine spätere Veröffentlichung speichern.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>+ Neue Vorlage</Button>
      </div>

      <div className={styles.toolbar}>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vorlagen durchsuchen…" aria-label="Vorlagen durchsuchen" />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Status filtern">
          <option value="all">Alle Status</option>
          <option value="draft">Entwurf</option>
          <option value="ready">Bereit</option>
          <option value="online">Online</option>
        </select>
        <div className={styles.viewToggle}>
          <button className={view === 'grid' ? styles.active : ''} onClick={() => setView('grid')}>Karten</button>
          <button className={view === 'list' ? styles.active : ''} onClick={() => setView('list')}>Liste</button>
        </div>
      </div>

      {loading ? <div className={styles.loading}><Spinner size="lg" /></div> : filtered.length === 0 ? (
        <EmptyState title="Keine Vorlagen gefunden" message={ads.length ? 'Passe Suche oder Filter an.' : 'Lege deine erste vorbereitete Anzeige an.'} action={!ads.length ? <Button variant="primary" onClick={() => setEditing('new')}>Erste Vorlage erstellen</Button> : undefined} />
      ) : (
        <div className={view === 'grid' ? styles.grid : styles.list}>
          {filtered.map((ad) => (
            <LibraryCard key={ad.id} ad={ad} list={view === 'list'} publishState={publishJobs[ad.id]} onEdit={() => setEditing(ad)} onDuplicate={() => void duplicate(ad)} onDelete={() => void remove(ad)} onPublish={() => void publish(ad)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ ad, list, publishState, onEdit, onDuplicate, onDelete, onPublish }: {
  ad: LibraryAd; list: boolean; publishState?: { status: JobStatus; error?: string }; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onPublish: () => void;
}) {
  return (
    <article className={`${styles.card} ${list ? styles.cardList : ''}`}>
      <div className={styles.imageWrap}>
        {ad.images[0]
          ? <img src={`/api/library/${ad.id}/images/${encodeURIComponent(ad.images[0])}`} alt="" />
          : <span>Kein Bild</span>}
        {ad.images.length > 1 && <small>{ad.images.length} Bilder</small>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}><span className={`${styles.status} ${styles[ad.status]}`}>{STATUS_LABELS[ad.status]}</span><strong>{ad.price.toLocaleString('de-DE')} €</strong></div>
        <h3>{ad.title}</h3>
        <p>{ad.description}</p>
        <div className={styles.meta}><span>{ad.category}</span><span>{ad.location_override || 'Standort vom Konto'}</span><span>{ad.shipping_type === 'SHIPPING' ? `Versand ${ad.shipping_costs?.toLocaleString('de-DE') ?? '0'} €` : 'Nur Abholung'}</span><span>Geändert {new Date(ad.updated_at).toLocaleDateString('de-DE')}</span></div>
        {publishState && <div className={styles.jobState}>Posting-Job: {publishState.status}{publishState.error ? ` · ${publishState.error}` : ''}</div>}
        {ad.kleinanzeigen_id && <a className={styles.onlineLink} href={ad.kleinanzeigen_url ?? '#'} target="_blank" rel="noreferrer">Kleinanzeigen-ID {ad.kleinanzeigen_id} öffnen</a>}
        <div className={styles.actions}>
          <Button size="sm" variant="primary" onClick={onPublish} disabled={publishState?.status === 'queued' || publishState?.status === 'running'}>Jetzt veröffentlichen</Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>Bearbeiten</Button>
          <Button size="sm" variant="secondary" onClick={onDuplicate}>Duplizieren</Button>
          <Button size="sm" variant="danger" onClick={onDelete}>Löschen</Button>
        </div>
      </div>
    </article>
  );
}

function LibraryForm({ ad, onCancel, onSaved }: { ad?: LibraryAd; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [form, setForm] = useState<LibraryAdInput>(ad ? {
    title: ad.title, description: ad.description, price: ad.price, price_type: ad.price_type,
    category: ad.category, location_override: ad.location_override, shipping_type: ad.shipping_type,
    shipping_costs: ad.shipping_costs, shipping_options: ad.shipping_options, attributes: ad.attributes, status: ad.status, account_id: ad.account_id,
  } : EMPTY_FORM);
  const [images, setImages] = useState(ad?.images ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    api.get<{ accounts: AccountOption[] }>('/api/accounts').then((result) => setAccounts(result.accounts ?? [])).catch(() => {});
  }, []);

  const set = <K extends keyof LibraryAdInput>(key: K, value: LibraryAdInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!form.category) {
      toast('error', 'Bitte eine konkrete Endkategorie auswählen');
      return;
    }
    if (!await validateLibraryAttributes(form.category, form.attributes ?? {})) {
      toast('error', 'Bitte alle Pflichtmerkmale der Kategorie ausfüllen');
      return;
    }
    setSaving(true);
    try {
      const saved = ad
        ? await api.put<LibraryAd>(`/api/library/${ad.id}`, form)
        : await api.post<LibraryAd>('/api/library', form);
      if (files.length) {
        let uploadedImages = saved.images;
        const rejected: string[] = [];
        for (const file of files) {
          try {
            const prepared = await prepareLibraryImage(file);
            const body = new FormData();
            body.append('files', prepared);
            const uploaded = await api.upload<{ images: string[]; rejected: { reason: string }[] }>(`/api/library/${saved.id}/images`, body);
            uploadedImages = uploaded.images;
            rejected.push(...uploaded.rejected.map((item) => item.reason));
          } catch (error) {
            rejected.push(error instanceof Error ? error.message : `${file.name} konnte nicht hochgeladen werden`);
          }
        }
        setImages(uploadedImages);
        if (rejected.length) toast('error', rejected.join(', '));
      }
      toast('success', ad ? 'Vorlage gespeichert' : 'Vorlage erstellt');
      await onSaved();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const deleteImage = async (filename: string) => {
    if (!ad) return;
    const result = await api.delete<{ images: string[] }>(`/api/library/${ad.id}/images/${encodeURIComponent(filename)}`);
    setImages(result.images);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.formHeader}><div><h2>{ad ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2><p>Alle Angaben werden lokal und dauerhaft gespeichert.</p></div><Button type="button" variant="secondary" onClick={onCancel}>Zurück</Button></div>
      <div className={styles.formGrid}>
        <Input label="Titel" value={form.title} onChange={(e) => set('title', e.target.value)} required maxLength={65} />
        <label><span>Preisart *</span><select required value={form.price_type} onChange={(e) => { const value = e.target.value as LibraryAdInput['price_type']; set('price_type', value); if (value === 'GIVE_AWAY') set('price', 0); }}><option value="FIXED">Festpreis</option><option value="NEGOTIABLE">VB</option><option value="GIVE_AWAY">Zu verschenken</option></select></label>
        <Input label="Preis (€)" type="number" min="0" step="0.01" value={String(form.price)} onChange={(e) => set('price', Number(e.target.value))} required disabled={form.price_type === 'GIVE_AWAY'} />
        <Input label="Standort-Override (optional)" value={form.location_override ?? ''} onChange={(e) => set('location_override', e.target.value || null)} hint="Leer lassen, um den Standort des zugeordneten Kontos zu verwenden." />
        <label><span>Versandoption *</span><select required value={form.shipping_type} onChange={(e) => { const value = e.target.value as LibraryAdInput['shipping_type']; set('shipping_type', value); if (value === 'PICKUP') { set('shipping_costs', null); set('shipping_options', []); } }}><option value="PICKUP">Nur Abholung</option><option value="SHIPPING">Versand möglich</option></select></label>
        {form.shipping_type === 'SHIPPING' && <Input label="Versandkosten (€)" type="number" min="0" step="0.01" value={form.shipping_costs == null ? '' : String(form.shipping_costs)} onChange={(e) => set('shipping_costs', e.target.value === '' ? null : Number(e.target.value))} required error={showErrors && form.shipping_costs == null ? 'Pflichtfeld' : undefined} />}
        {form.shipping_type === 'SHIPPING' && <div className={styles.shippingOptions}><span>Paketoptionen *</span>{SHIPPING_SIZES.map((size) => <fieldset key={size.id}><legend>{size.label}</legend>{size.carriers.map((carrier) => <label key={carrier.value}><input type="checkbox" checked={(form.shipping_options ?? []).includes(carrier.value)} onChange={(event) => set('shipping_options', event.target.checked ? [...(form.shipping_options ?? []), carrier.value] : (form.shipping_options ?? []).filter((value) => value !== carrier.value))} /> <span>{carrier.name} · {carrier.price}</span></label>)}</fieldset>)}{showErrors && !(form.shipping_options ?? []).length && <small>Bitte mindestens eine Versandoption auswählen.</small>}</div>}
        <label><span>Status</span><select value={form.status} onChange={(e) => set('status', e.target.value as LibraryAdStatus)}><option value="draft">Entwurf</option><option value="ready">Bereit</option><option value="online">Online</option></select></label>
        <label><span>Kleinanzeigen-Konto (optional)</span><select value={form.account_id ?? ''} onChange={(e) => set('account_id', e.target.value || null)}><option value="">Nicht zugeordnet</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name}</option>)}</select></label>
        <div className={styles.categoryField}><LibraryCategoryPicker value={form.category} onChange={(category) => { set('category', category); set('attributes', {}); }} error={showErrors && !form.category ? 'Bitte eine Endkategorie auswählen' : undefined} /></div>
        <LibraryCategoryAttributes category={form.category} values={form.attributes ?? {}} onChange={(attributes) => set('attributes', attributes)} showErrors={showErrors} />
      </div>
      <Textarea label="Beschreibung" value={form.description} onChange={(e) => set('description', e.target.value)} rows={9} required maxLength={4000} />
      <div className={styles.imagesSection}>
        <label><span>Bilder</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
        {!!files.length && <small>{files.length} neue Datei(en) werden beim Speichern hochgeladen.</small>}
        {!!images.length && <div className={styles.imageGrid}>{images.map((image) => <div key={image}><img src={`/api/library/${ad?.id}/images/${encodeURIComponent(image)}`} alt="Vorlagenbild" /><button type="button" onClick={() => void deleteImage(image)}>×</button></div>)}</div>}
      </div>
      <div className={styles.formActions}><Button type="button" variant="secondary" onClick={onCancel}>Abbrechen</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Speichert…' : 'Vorlage speichern'}</Button></div>
    </form>
  );
}
