import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { ROOT } from '../lib/env.js';
import { chat, parseJson, spend } from '../lib/openrouter.js';
import { validateBrief } from './validate.js';

const SCHEMA = readFileSync(resolve(ROOT, 'data/brief.schema.json'), 'utf8');
const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json']);

/** Збирає текстові матеріали клієнта з директорії та URL. */
export function collectSources(dir, urls = []) {
  const parts = [];

  if (dir) {
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        if (name.startsWith('.')) continue;
        const p = resolve(d, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!TEXT_EXT.has(extname(name).toLowerCase())) continue;
        if (basename(name).startsWith('brief.json')) continue;   // не годуємо власним виходом
        parts.push({ name, text: readFileSync(p, 'utf8').slice(0, 40000) });
      }
    };
    walk(dir);
  }
  return { parts, urls };
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'brandbook-generator' } });
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 30000);
}

const SYSTEM = `Ти — стратег бренду. Твоє завдання: з наданих матеріалів компанії скласти бриф у форматі JSON строго за схемою.

ГОЛОВНЕ ПРАВИЛО — розрізняй два типи полів:

1. ФАКТИЧНІ (назва, галузь, продукт, ціновий сегмент, канали, географія, конкуренти,
   наявні тексти, статус ТМ). Їх НЕ ВИГАДУЮТЬ. Якщо в матеріалах немає — пропусти поле.
   Вигадана назва продукту або неіснуючий конкурент отруює весь брендбук.

2. ІНТЕРПРЕТАЦІЙНІ (brand.personality, archetype, essence, toneAxes, аудиторії,
   differentiation). Їх ВИВОДЯТЬ з матеріалів — це і є твоя робота. Але кожне таке
   виведення обов'язково додається в meta.assumptions.

meta.assumptions: для КОЖНОГО домисленого значення — окремий запис
{ field, assumed, why, confirmed: false }. Поле why пояснює, з чого саме ти це вивів.
Ці припущення друкуються в брендбуку окремим блоком і показуються замовнику
на підтвердження, тому формулюй їх чесно.

Інше:
- meta.mode = "extracted"
- verbal.documentLanguage = "uk", якщо не сказано інше
- значення полів — українською, крім URL і кодів
- visual.avoid і market.notLike критично важливі: вони стають негативною частиною
  промптів генерації. Витягуй усе, чого компанія уникає.
- references.links без пояснення "why" майже марні — заповнюй why завжди
- scope.preset: обери standard, якщо з матеріалів не випливає інше

Поверни ТІЛЬКИ валідний JSON без пояснень і без markdown-огорожі.`;

export async function extractBrief({ dir, urls = [], budgetUsd = null, noCache = false }) {
  const { parts } = collectSources(dir, urls);
  const pages = [];
  for (const url of urls) {
    try { pages.push({ name: url, text: await fetchPage(url) }); }
    catch (e) { console.warn(`  ⚠ не вдалося прочитати ${url}: ${e.message}`); }
  }

  const all = [...parts, ...pages];
  if (!all.length) throw new Error('Немає матеріалів: порожня директорія і жодного URL');

  const materials = all
    .map(p => `### Джерело: ${p.name}\n${p.text}`)
    .join('\n\n');

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `СХЕМА БРИФУ:\n${SCHEMA}\n\nМАТЕРІАЛИ КОМПАНІЇ:\n${materials}` }
  ];

  let brief, report;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await chat({
      tier: 'strategic', messages, temperature: 0.2,
      maxTokens: 12000, budgetUsd, noCache: noCache || attempt > 1
    });
    console.log(`  модель ${res.model}${res.cached ? ' (з кешу)' : `, $${res.costUsd.toFixed(4)}`}`);

    try { brief = parseJson(res.text); }
    catch (e) {
      if (attempt === 2) throw new Error(`Модель не повернула валідний JSON: ${e.message}`);
      messages.push({ role: 'assistant', content: res.text.slice(0, 500) });
      messages.push({ role: 'user', content: `Це не валідний JSON (${e.message}). Поверни ТІЛЬКИ JSON-об'єкт.` });
      continue;
    }

    report = validateBrief(brief);
    if (report.ok || attempt === 2) break;

    // друга спроба з переліком помилок — дешевше, ніж ручне лагодження
    messages.push({ role: 'assistant', content: JSON.stringify(brief) });
    messages.push({
      role: 'user',
      content: `Бриф не пройшов валідацію:\n${report.errors.map(e => '- ' + e).join('\n')}\n\nВиправ і поверни повний JSON.`
    });
  }

  return { brief, report, spentUsd: spend.usd };
}
