import { describe, it, expect } from 'vitest';
import {
  ORG,
  ASSIGNMENTS,
  resolveAssignment,
  studentRepoName,
  listAssignments
} from './assignments.js';

describe('таблица задача → темплейт', () => {
  it('съдържа точно 19 задачи', () => {
    expect(ASSIGNMENTS).toHaveLength(19);
  });

  it('няма повтарящи се slug-ове', () => {
    const slugs = ASSIGNMENTS.map(a => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // Трите капана: съществуват дублирани темплейти с по-логични имена,
  // но реално използваните са тези. Данните идват от описанията на 422 repo-та.
  it('readability сочи темплейта с "test" в името', () => {
    expect(resolveAssignment('readability').template)
      .toBe('nvnacs50-classroom-fall2025-test-2023-fall-readability');
  });

  it('sort сочи дългия дублиран темплейт', () => {
    expect(resolveAssignment('sort').template)
      .toBe('nvnacs50-classroom-fall2025-sort-nvnacs50-classroom-fall2025-sort-sort-template');
  });

  it('volume сочи дългия дублиран темплейт', () => {
    expect(resolveAssignment('volume').template)
      .toBe('nvnacs50-classroom-fall2025-volume-nvnacs50-classroom-fall2025-volume');
  });

  it('всеки темплейт е с правилния префикс', () => {
    for (const a of ASSIGNMENTS) {
      expect(resolveAssignment(a.slug).template)
        .toMatch(/^nvnacs50-classroom-fall2025-/);
    }
  });

  it('връща null за непозната задача', () => {
    expect(resolveAssignment('nope')).toBeNull();
    expect(resolveAssignment('')).toBeNull();
    expect(resolveAssignment(null)).toBeNull();
  });

  it('не приема мигрираните кратки имена като темплейт', () => {
    for (const a of ASSIGNMENTS) {
      expect(resolveAssignment(a.slug).template).not.toBe(a.slug);
    }
  });
});

describe('studentRepoName', () => {
  it('слепва slug и login без промяна на регистъра', () => {
    expect(studentRepoName('filter-less', 'Zdravkov14')).toBe('filter-less-Zdravkov14');
  });

  it('пази тирета в username-а', () => {
    expect(studentRepoName('speller', 'Erkan-Ismailov')).toBe('speller-Erkan-Ismailov');
  });
});

describe('listAssignments', () => {
  it('не издава имената на темплейтите', () => {
    for (const a of listAssignments()) {
      expect(a).not.toHaveProperty('template');
      expect(a).not.toHaveProperty('templateSuffix');
      expect(a).toHaveProperty('slug');
      expect(a).toHaveProperty('title');
    }
  });
});

describe('ORG', () => {
  it('е nvnacs50', () => {
    expect(ORG).toBe('nvnacs50');
  });
});
