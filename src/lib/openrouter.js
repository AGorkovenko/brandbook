import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { env, ROOT } from './env.js';

const CACHE = resolve(ROOT, '.cache');
const POLICY = JSON.parse(readFileSync(resolve(ROOT, 'data/model-policy.json'), 'utf8'));

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);

function cached(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
function store(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

/** Прайс моделей із /models, кешується на добу — щоб не хардкодити ціни. */
async function pricing() {
  const file = resolve(CACHE, 'models.json');
  const hit = cached(file);
  if (hit && Date.now() - hit.at < 864e5) return hit.map;

  const res = await fetch(`${env('OPENROUTER_BASE_URL')}/models`);
  const map = {};
  for (const m of (await res.json()).data) {
    map[m.id] = {
      prompt: +m.pricing.prompt,
      completion: +m.pricing.completion,
      imageOutput: +(m.pricing.image_output ?? 0)
    };
  }
  store(file, { at: Date.now(), map });
  return map;
}

function costOf(price, usage) {
  if (!price || !usage) return 0;
  return (usage.prompt_tokens ?? 0) * price.prompt
       + (usage.completion_tokens ?? 0) * price.completion;
}

/** Сумарні витрати сесії — щоб бачити ціну прогону й тримати budgetLimitUsd. */
export const spend = { usd: 0, calls: 0, cachedCalls: 0 };

function record(entry) {
  spend.usd += entry.costUsd;
  spend.calls += 1;
  mkdirSync(resolve(ROOT, 'output'), { recursive: true });
  appendFileSync(resolve(ROOT, 'output/costs.jsonl'), JSON.stringify(entry) + '\n');
}

/** Модель для завдання за model-policy.json. */
export function modelFor(tier) {
  const t = POLICY.textTiers[tier];
  if (!t) throw new Error(`Невідомий текстовий tier: ${tier}`);
  return t;
}

/**
 * Виклик чату. Кешується за (модель + повідомлення + параметри):
 * повторний прогін того самого кроку безкоштовний.
 */
export async function chat({
  tier = 'content', model, messages, temperature = 0.3,
  maxTokens = 8000, jsonMode = false, noCache = false, budgetUsd = null
}) {
  const spec = model ? { model, fallback: null } : modelFor(tier);
  const body = {
    model: spec.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(spec.fallback ? { models: [spec.model, spec.fallback], route: 'fallback' } : {})
  };

  const key = sha(JSON.stringify(body));
  const file = resolve(CACHE, 'text', `${key}.json`);
  if (!noCache) {
    const hit = cached(file);
    if (hit) { spend.cachedCalls += 1; return { ...hit, cached: true }; }
  }

  if (budgetUsd !== null && spend.usd >= budgetUsd) {
    throw new Error(`Досягнуто стелю витрат $${budgetUsd} (витрачено $${spend.usd.toFixed(4)}).`);
  }

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${env('OPENROUTER_BASE_URL')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/AGorkovenko/brandbook',
          'X-Title': 'brandbook generator'
        },
        body: JSON.stringify(body)
      });

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));

      const text = json.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('Порожня відповідь моделі');

      const price = (await pricing())[json.model ?? spec.model];
      const out = {
        text,
        model: json.model ?? spec.model,
        usage: json.usage ?? null,
        costUsd: costOf(price, json.usage)
      };
      record({ at: new Date().toISOString(), kind: 'text', ...out, text: undefined });
      return { ...store(file, out), cached: false };

    } catch (e) {
      lastErr = e;
      if (attempt < 4) await new Promise(r => setTimeout(r, 800 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`OpenRouter не відповів після 4 спроб: ${lastErr.message}`);
}

/** Витягує JSON з відповіді, навіть якщо модель загорнула його в ``` огорожу. */
export function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[{[]/);
  if (start === -1) throw new Error('У відповіді немає JSON');
  return JSON.parse(raw.slice(start, raw.lastIndexOf(raw[start] === '{' ? '}' : ']') + 1));
}
