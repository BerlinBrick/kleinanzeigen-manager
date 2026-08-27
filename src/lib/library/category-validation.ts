import fs from 'fs';
import path from 'path';
import { resolveAttributes, shortKey, type CategoryEntry, type SharedAttributeDef } from '@/lib/ads/category-attributes';

interface CategoryWithName extends CategoryEntry { category_name: string }
interface CategoryData {
  categories: Record<string, CategoryWithName>;
  shared_attributes: Record<string, SharedAttributeDef>;
}

let cache: CategoryData | null = null;

function loadData(): CategoryData {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'category_attributes.json'), 'utf8')) as CategoryData;
  }
  return cache;
}

export function validateLibraryCategory(category: string, values: Record<string, string>): string | null {
  const data = loadData();
  const entry = data.categories[category];
  if (!entry) return 'Unbekannte Kategorie';
  const prefix = `${entry.category_name} > `;
  if (Object.values(data.categories).some((candidate) => candidate.category_name.startsWith(prefix))) {
    return 'Bitte eine konkrete Endkategorie auswählen';
  }
  const missing = resolveAttributes(entry, data.shared_attributes, category)
    .filter((attribute) => attribute.type !== 'boolean')
    .some((attribute) => !values[shortKey(attribute.key)] || (attribute.yearKey && !values[shortKey(attribute.yearKey)]));
  return missing ? 'Bitte alle Pflichtmerkmale der Kategorie ausfüllen' : null;
}
