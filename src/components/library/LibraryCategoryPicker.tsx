'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input, Select } from '@/components/ui';
import { loadAttributeData, type ClientCatAttrsData } from '@/lib/ads/category-attributes-client';
import { INPUT_COMBOBOX_KEYS, resolveAttributes, shortKey, type ResolvedAttribute } from '@/lib/ads/category-attributes';
import styles from './LibraryCategoryPicker.module.scss';

interface CategoryRecord { id: string; path: string[] }

function categoryRecords(data: ClientCatAttrsData | null): CategoryRecord[] {
  if (!data) return [];
  return Object.entries(data.categories).map(([id, entry]) => ({
    id,
    path: ((entry as typeof entry & { category_name?: string }).category_name ?? id).split(' > ').map((part) => part.trim()),
  }));
}

export function LibraryCategoryPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const [data, setData] = useState<ClientCatAttrsData | null>(null);
  useEffect(() => { void loadAttributeData().then(setData); }, []);
  const records = useMemo(() => categoryRecords(data), [data]);
  const current = records.find((record) => record.id === value);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => { if (current) setSelected(current.path); }, [value, current]);

  const levels = useMemo(() => {
    const result: string[][] = [];
    for (let depth = 0; depth < 5; depth++) {
      const prefix = selected.slice(0, depth);
      const choices = [...new Set(records.filter((record) => prefix.every((part, index) => record.path[index] === part) && record.path.length > depth).map((record) => record.path[depth]))];
      if (!choices.length) break;
      result.push(choices.sort((a, b) => a.localeCompare(b, 'de')));
      if (!selected[depth]) break;
    }
    return result;
  }, [records, selected]);

  const selectLevel = (depth: number, part: string) => {
    const next = [...selected.slice(0, depth), part];
    setSelected(next);
    const exact = records.find((record) => record.path.length === next.length && next.every((item, index) => record.path[index] === item));
    const hasChildren = records.some((record) => record.path.length > next.length && next.every((item, index) => record.path[index] === item));
    onChange(exact && !hasChildren ? exact.id : '');
  };

  return (
    <div className={styles.wrapper}>
      <label>Kategorie <strong>*</strong></label>
      <div className={styles.levels}>
        {levels.map((options, depth) => (
          <Select
            key={depth}
            aria-label={`Kategorie Ebene ${depth + 1}`}
            value={selected[depth] ?? ''}
            onChange={(event) => selectLevel(depth, event.target.value)}
            options={[{ value: '', label: depth === 0 ? 'Hauptkategorie wählen' : 'Unterkategorie wählen' }, ...options.map((option) => ({ value: option, label: option }))]}
          />
        ))}
      </div>
      {value && current && <small>Ausgewählt: {current.path.join(' › ')}</small>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

export function LibraryCategoryAttributes({ category, values, onChange, showErrors }: {
  category: string; values: Record<string, string>; onChange: (values: Record<string, string>) => void; showErrors: boolean;
}) {
  const [data, setData] = useState<ClientCatAttrsData | null>(null);
  useEffect(() => { void loadAttributeData().then(setData); }, []);
  const attributes = useMemo(() => {
    if (!data || !category || !data.categories[category]) return [];
    return resolveAttributes(data.categories[category], data.shared_attributes, category);
  }, [data, category]);

  useEffect(() => {
    if (!attributes.length) return;
    const allowed = new Set(attributes.flatMap((attribute) => [shortKey(attribute.key), attribute.yearKey ? shortKey(attribute.yearKey) : '']).filter(Boolean));
    const cleaned = Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
    if (Object.keys(cleaned).length !== Object.keys(values).length) onChange(cleaned);
  }, [attributes, values, onChange]);

  if (!category || !attributes.length) return null;
  const setValue = (key: string, value: string) => onChange({ ...values, [shortKey(key)]: value });
  return (
    <section className={styles.attributes}>
      <h3>Kategorie-Merkmale</h3>
      <p>Mit * markierte Merkmale sind für diese Kategorie erforderlich.</p>
      <div className={styles.attributeGrid}>
        {attributes.map((attribute) => <AttributeField key={attribute.key} attribute={attribute} values={values} setValue={setValue} showErrors={showErrors} />)}
      </div>
    </section>
  );
}

function AttributeField({ attribute, values, setValue, showErrors }: {
  attribute: ResolvedAttribute; values: Record<string, string>; setValue: (key: string, value: string) => void; showErrors: boolean;
}) {
  const value = values[shortKey(attribute.key)] ?? '';
  if (attribute.type === 'boolean') {
    return <label className={styles.checkbox}><input type="checkbox" checked={value === 'true'} onChange={(event) => setValue(attribute.key, String(event.target.checked))} /> {attribute.label}</label>;
  }
  if (attribute.type === 'month-year') {
    const yearValue = values[shortKey(attribute.yearKey!)] ?? '';
    return <div className={styles.monthYear}><Select label={<>{attribute.label} *</>} value={value} onChange={(event) => setValue(attribute.key, event.target.value)} options={[{ value: '', label: 'Monat wählen' }, ...(attribute.options ?? []).map((option) => ({ value: option.value, label: option.text }))]} error={showErrors && !value ? 'Pflichtfeld' : undefined} /><Select label={<>Jahr *</>} value={yearValue} onChange={(event) => setValue(attribute.yearKey!, event.target.value)} options={[{ value: '', label: 'Jahr wählen' }, ...(attribute.yearOptions ?? []).map((option) => ({ value: option.value, label: option.text }))]} error={showErrors && !yearValue ? 'Pflichtfeld' : undefined} /></div>;
  }
  if (attribute.options?.length) {
    const displayText = INPUT_COMBOBOX_KEYS.has(shortKey(attribute.key));
    return <Select label={<>{attribute.label} *</>} value={value} onChange={(event) => setValue(attribute.key, event.target.value)} options={[{ value: '', label: 'Bitte wählen' }, ...attribute.options.map((option) => ({ value: displayText ? option.text : option.value, label: option.text }))]} error={showErrors && !value ? 'Pflichtfeld' : undefined} />;
  }
  return <Input label={<>{attribute.label} *</>} type="number" value={value} onChange={(event) => setValue(attribute.key, event.target.value)} error={showErrors && !value ? 'Pflichtfeld' : undefined} />;
}

export async function validateLibraryAttributes(category: string, values: Record<string, string>): Promise<boolean> {
  if (!category) return false;
  const data = await loadAttributeData();
  const entry = data.categories[category];
  if (!entry) return true;
  const attributes = resolveAttributes(entry, data.shared_attributes, category).filter((attribute) => attribute.type !== 'boolean');
  return attributes.every((attribute) => values[shortKey(attribute.key)] && (!attribute.yearKey || values[shortKey(attribute.yearKey)]));
}
