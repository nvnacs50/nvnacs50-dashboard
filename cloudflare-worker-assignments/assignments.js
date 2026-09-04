// Карта задача → темплейт за организацията nvnacs50.
//
// Извлечена е от описанията на 422 съществуващи студентски repo-та, не от
// интуиция: GitHub Classroom записва името на темплейта в описанието на всяко
// генерирано repo. Три от редовете изглеждат грешни, но не са — съществуват
// дублирани темплейти с по-логични имена, които обаче никога не са били
// използвани (readability, sort, volume). Виж спецификацията, раздел 6.
//
// Мигрираните темплейти с кратки имена (hello, speller, filter-less, ...,
// описание "Migrated from GitHub Classroom") НЕ се ползват.

export const ORG = 'nvnacs50';
export const TEMPLATE_PREFIX = 'nvnacs50-classroom-fall2025-';

export const ASSIGNMENTS = [
  { slug: 'hello',        title: 'Hello',                      templateSuffix: 'hello-2023-fall-hello-1' },
  { slug: 'mario-less',   title: 'Mario (less comfortable)',   templateSuffix: 'mario-less-2023-fall-mario-less' },
  { slug: 'mario-more',   title: 'Mario (more comfortable)',   templateSuffix: 'mario-more-2023-fall-mario-more' },
  { slug: 'cash',         title: 'Cash',                       templateSuffix: 'cash-2023-fall-cash' },
  { slug: 'credit',       title: 'Credit',                     templateSuffix: 'credit-2023-fall-credit' },
  { slug: 'scrabble',     title: 'Scrabble',                   templateSuffix: 'scrabble-scrabble-template' },
  { slug: 'readability',  title: 'Readability',                templateSuffix: 'test-2023-fall-readability' },
  { slug: 'caesar',       title: 'Caesar',                     templateSuffix: 'caesar-2023-fall-caesar' },
  { slug: 'substitution', title: 'Substitution',               templateSuffix: 'substitution-2023-fall-substitution' },
  { slug: 'sort',         title: 'Sort',                       templateSuffix: 'sort-nvnacs50-classroom-fall2025-sort-sort-template' },
  { slug: 'plurality',    title: 'Plurality',                  templateSuffix: 'plurality-2023-fall-plurality' },
  { slug: 'runoff',       title: 'Runoff',                     templateSuffix: 'runoff-2023-fall-runoff' },
  { slug: 'tideman',      title: 'Tideman',                    templateSuffix: 'tideman-2023-fall-tideman' },
  { slug: 'volume',       title: 'Volume',                     templateSuffix: 'volume-nvnacs50-classroom-fall2025-volume' },
  { slug: 'filter-less',  title: 'Filter (less comfortable)',  templateSuffix: 'filter-less-2023-fall-filter-less' },
  { slug: 'filter-more',  title: 'Filter (more comfortable)',  templateSuffix: 'filter-more-2023-fall-filter-more' },
  { slug: 'recover',      title: 'Recover',                    templateSuffix: 'recover-2023-fall-recover' },
  { slug: 'inheritance',  title: 'Inheritance',                templateSuffix: 'inheritance-inheritance-template' },
  { slug: 'speller',      title: 'Speller',                    templateSuffix: 'speller-2023-fall-speller' }
];

const BY_SLUG = new Map(ASSIGNMENTS.map(a => [a.slug, a]));

export function resolveAssignment(slug) {
  if (typeof slug !== 'string' || slug === '') return null;
  const found = BY_SLUG.get(slug);
  if (!found) return null;
  return {
    slug: found.slug,
    title: found.title,
    template: TEMPLATE_PREFIX + found.templateSuffix
  };
}

export function studentRepoName(slug, login) {
  return `${slug}-${login}`;
}

export function listAssignments() {
  return ASSIGNMENTS.map(({ slug, title }) => ({ slug, title }));
}
