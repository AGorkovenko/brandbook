import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../lib/env.js';

const SCHEMA = JSON.parse(readFileSync(resolve(ROOT, 'data/brief.schema.json'), 'utf8'));
const SECTIONS = JSON.parse(readFileSync(resolve(ROOT, 'data/brandbook-sections.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const compiled = ajv.compile(SCHEMA);

/** Мінімум, без якого пайплайн не стартує. Див. docs/03-brief.md */
const REQUIRED_PATHS = [
  ['company.name', b => b.company?.name],
  ['company.industry', b => b.company?.industry],
  ['product.what', b => b.product?.what],
  ['audience[0]', b => b.audience?.length],
  ['scope.preset', b => b.scope?.preset]
];

export function validateBrief(brief) {
  const errors = [];
  const warnings = [];

  const copy = { ...brief };
  delete copy.$schema;

  if (!compiled(copy)) {
    for (const e of compiled.errors) {
      errors.push(`${e.instancePath || '/'} ${e.message}`);
    }
  }

  for (const [path, get] of REQUIRED_PATHS) {
    if (!get(copy)) errors.push(`бракує обов'язкового поля: ${path}`);
  }

  // Секції зі scope мусять існувати в реєстрі — інакше пайплайн тихо їх пропустить
  const ids = new Set(SECTIONS.sections.map(s => s.id));
  for (const field of ['sections', 'excludeSections']) {
    for (const id of copy.scope?.[field] ?? []) {
      if (!ids.has(id)) errors.push(`scope.${field}: невідома секція "${id}"`);
    }
  }

  // Те, що не блокує запуск, але зіпсує результат
  if (copy.visual?.hasLogo === false) {
    warnings.push('visual.hasLogo = false — знак AI не генерує, повний брендбук неможливий');
  }
  if (!copy.brand?.personality?.length && !copy.brand?.archetype) {
    warnings.push('немає brand.personality та archetype — характер виводитиметься LLM у припущення');
  }
  if (!copy.references?.links?.length) {
    warnings.push('немає референсів — візуальний напрямок будуватиметься лише з тексту брифу');
  }
  for (const [i, l] of (copy.references?.links ?? []).entries()) {
    if (!l.why) warnings.push(`references.links[${i}] без пояснення "why" — референс майже марний`);
  }
  const unconfirmed = (copy.meta?.assumptions ?? []).filter(a => !a.confirmed);
  if (unconfirmed.length) {
    warnings.push(`${unconfirmed.length} непідтверджених припущень — вони друкуються в брендбуку окремим блоком`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
