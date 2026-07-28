import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

let loaded = null;

/** Читає .env без зовнішніх залежностей. Реальні змінні оточення мають пріоритет. */
export function env(key, fallback = undefined) {
  if (process.env[key]) return process.env[key];

  if (!loaded) {
    loaded = {};
    const path = resolve(ROOT, '.env');
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m) loaded[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const val = loaded[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Немає ${key}. Скопіюйте .env.example у .env і заповніть.`);
  }
  return val;
}
