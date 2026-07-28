import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../lib/env.js';
import { chatJson } from '../lib/openrouter.js';

const SECTIONS = JSON.parse(readFileSync(resolve(ROOT, 'data/brandbook-sections.json'), 'utf8'));

/** Секції, обрані брифом: явний перелік або пресет, мінус виключення. */
export function selectSections(brief) {
  const { preset = 'standard', sections, excludeSections = [] } = brief.scope ?? {};
  const chosen = sections?.length
    ? SECTIONS.sections.filter(s => sections.includes(s.id))
    : SECTIONS.sections.filter(s => s.presets.includes(preset));
  return chosen.filter(s => !excludeSections.includes(s.id));
}

/* ── Крок 2: STRATEGY ─────────────────────────────────────────────────── */

const STRATEGY_SYSTEM = `Ти — стратег бренду. З брифу склади стратегічний фундамент брендбуку.

Це найвпливовіший крок: твій вихід стає входом для ВСІХ подальших промптів
генерації візуалу. Абстракції тут дають "просто красиво" замість "схоже на цей бренд".

Вимоги:
- positioning — один абзац, який можна процитувати дослівно
- essence — 2-4 слова
- personality — 5-7 прикметників
- visualDirection — конкретні візуальні наслідки характеру: які форми, яке світло,
  яка щільність, які фактури. Це піде прямо в промпти генерації зображень.
- photoDirection — сюжети, світло, кадрування, типажі людей для фотостилю
- avoid — чого НЕ має бути у візуалі (з брифу + твої висновки)
- tovRules — правила голосу так, щоб їх можна було віддати копірайтеру як інструкцію

Спирайся на бриф. Не суперечь фактам із нього. Пиши українською.
Поверни ТІЛЬКИ JSON:
{
  "essence": "", "positioning": "", "mission": "", "vision": "",
  "values": [{"name":"","behaviour":""}],
  "personality": [], "archetype": "",
  "audiences": [{"name":"","insight":"","message":""}],
  "differentiation": "", "reasonsToBelieve": [],
  "visualDirection": {"forms":"","light":"","density":"","textures":"","colorLogic":""},
  "photoDirection": {"subjects":"","light":"","framing":"","people":""},
  "avoid": [],
  "tovRules": {"axes":{"formality":0,"warmth":0,"humor":0,"expertise":0},
               "principles":[], "doSay":[], "dontSay":[]}
}`;

export async function buildStrategy(brief, opts = {}) {
  const { data, meta } = await chatJson({
    tier: 'strategic',
    temperature: 0.4,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: STRATEGY_SYSTEM },
      { role: 'user', content: `БРИФ:\n${JSON.stringify(brief, null, 2)}` }
    ],
    ...opts
  });
  return { strategy: data, meta };
}

/* ── Крок 4: контент секцій ───────────────────────────────────────────── */

const CONTENT_SYSTEM = `Ти пишеш сторінки брендбуку. Для кожної заданої секції поверни вміст.

ГОЛОВНЕ: сторінка брендбуку — це ПРАВИЛО, а не опис. Критерій якості:
сторонній дизайнер, маючи лише цю сторінку, відтворить рішення без автора.

- rules: вимірювані правила. "Відступ 2x від висоти знака", "не менше 24 px",
  "довжина рядка 60-75 символів". НЕ "достатньо повітря", НЕ "гармонійно".
- dos / donts: конкретні дії, а не абстракції. donts особливо цінні.
- body: 2-4 абзаци по 1-3 речення. Без води й без реклами самого бренду.
- lead: одне речення — суть сторінки.

Спирайся на стратегію і бриф, не суперечь їм. Українською.
Поверни ТІЛЬКИ JSON: масив об'єктів
[{"id":"", "title":"", "lead":"", "body":[""], "rules":[""], "dos":[""], "donts":[""]}]
Поле id — точно як у вхідному списку. Порожні масиви допустимі, якщо недоречні.

УВАГА до JSON: усередині рядкових значень використовуй лише «ялинки» або „лапки".
Прямі лапки " в тексті ламають JSON — не вставляй їх навіть у прикладах.`;

const BATCH = 8;

export async function buildContent(brief, strategy, sections, opts = {}) {
  const need = sections.filter(s => s.production.includes('text') || s.rule || s.critical);
  const out = {};
  const failed = [];
  let spent = 0;

  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    const list = batch.map(s => `- ${s.id} — ${s.title}: ${s.description}`).join('\n');

    try {
      const { data, meta } = await chatJson({
        tier: 'content',
        temperature: 0.35,
        maxTokens: 10000,
        messages: [
          { role: 'system', content: CONTENT_SYSTEM },
          {
            role: 'user', content:
              `СТРАТЕГІЯ:\n${JSON.stringify(strategy)}\n\n` +
              `КОМПАНІЯ: ${brief.company?.name} — ${brief.company?.industry}\n` +
              `ПРОДУКТ: ${brief.product?.what}\n\n` +
              `СЕКЦІЇ ДЛЯ НАПИСАННЯ:\n${list}`
          }
        ],
        ...opts
      });
      spent += meta.costUsd;
      for (const item of (Array.isArray(data) ? data : data.sections ?? [])) {
        if (item?.id) out[item.id] = item;
      }
    } catch (e) {
      // один зіпсований батч не має валити всю збірку
      failed.push(...batch.map(s => s.id));
      console.warn(`\n  ⚠ батч ${batch[0].id}… не вдався: ${e.message.slice(0, 90)}`);
    }
    process.stdout.write(`\r  контент: ${Math.min(i + BATCH, need.length)}/${need.length}`);
  }
  process.stdout.write('\n');
  return { content: out, spentUsd: spent, failed };
}
