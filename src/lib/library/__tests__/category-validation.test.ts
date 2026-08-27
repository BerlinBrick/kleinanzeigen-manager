import { describe, expect, it } from 'vitest';
import { validateLibraryCategory } from '@/lib/library/category-validation';

describe('library category validation', () => {
  it('rejects unknown and non-leaf categories', () => {
    expect(validateLibraryCategory('missing', {})).toBe('Unbekannte Kategorie');
    expect(validateLibraryCategory('210/241', {})).toBe('Bitte eine konkrete Endkategorie auswählen');
  });

  it('reports missing category-dependent attributes', () => {
    expect(validateLibraryCategory('210/216/volkswagen', {})).toBe('Bitte alle Pflichtmerkmale der Kategorie ausfüllen');
  });
});
