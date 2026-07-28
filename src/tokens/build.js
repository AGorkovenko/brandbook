import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { ROOT } from '../lib/env.js';

/* ── Колір ────────────────────────────────────────────────────────────── */

const hex = (s) => {
  const m = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + h.toLowerCase();
};
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** Відносна яскравість за WCAG 2.1 */
function luminance(h) {
  const [r, g, b] = rgb(h).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}
const wcag = (c) => c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : c >= 3 ? 'AA-large' : 'fail';

function toCmyk(h) {
  const [r, g, b] = rgb(h).map(v => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k]
    .map(v => Math.round(v * 100));
}

/** Витягує кольори з SVG логотипа — детерміновано, без AI. */
export function colorsFromSvg(dir) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => extname(f).toLowerCase() === '.svg');
  const counts = new Map();

  for (const f of files) {
    const svg = readFileSync(resolve(dir, f), 'utf8');
    for (const m of svg.matchAll(/(?:fill|stop-color|stroke)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6})/g)) {
      const h = hex(m[1]);
      if (!h) continue;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  }
  // білий і чорний — службові, не бренд-кольори
  return [...counts.entries()]
    .filter(([h]) => !['#ffffff', '#000000'].includes(h))
    .sort((a, b) => b[1] - a[1])
    .map(([h]) => h);
}

const ROLE_NAMES = ['основний', 'акцентний', 'додатковий', 'допоміжний'];

function buildPalette(brief, logoColors) {
  const source = logoColors.length ? 'логотип' : 'дефолт';
  const base = logoColors.length ? logoColors.slice(0, 4)
    : ['#1d3b2a', '#c9a227', '#4a5d52'];        // нейтральний старт, якщо логотипа немає

  const primary = base.map((h, i) => ({
    name: ROLE_NAMES[i] ?? `колір ${i + 1}`,
    hex: h,
    rgb: rgb(h).join(', '),
    cmyk: toCmyk(h).join(', '),
    role: i === 0 ? 'основний фон і великі площини'
        : i === 1 ? 'акцент, заклики до дії'
        : 'підтримка, дрібні елементи'
  }));

  const neutral = [
    { name: 'чорний текст', hex: '#141414' },
    { name: 'сірий', hex: '#767676' },
    { name: 'світлий фон', hex: '#f4f2ed' },
    { name: 'білий', hex: '#ffffff' }
  ].map(c => ({ ...c, rgb: rgb(c.hex).join(', '), cmyk: toCmyk(c.hex).join(', '), role: 'нейтральний' }));

  // матриця контрасту: кожен колір проти світлого й темного тексту
  const matrix = [...primary, ...neutral].map(c => ({
    hex: c.hex,
    name: c.name,
    onWhite: { ratio: contrast(c.hex, '#ffffff'), level: wcag(contrast(c.hex, '#ffffff')) },
    onBlack: { ratio: contrast(c.hex, '#141414'), level: wcag(contrast(c.hex, '#141414')) }
  }));

  return { source, primary, neutral, matrix };
}

/* ── Типографіка ──────────────────────────────────────────────────────── */

function buildType(brief) {
  const ratio = 1.25;                       // мала терція — універсально для документів
  const basePt = 10.5;
  const steps = [
    ['h1', 5, 1.05, '-0.02em'], ['h2', 4, 1.1, '-0.015em'], ['h3', 3, 1.2, '-0.01em'],
    ['h4', 2, 1.3, '0'], ['body', 0, 1.55, '0'], ['small', -1, 1.45, '0.01em'],
    ['caption', -2, 1.4, '0.02em']
  ];
  return {
    ratio,
    basePt,
    primary: { family: 'Inter, Helvetica, Arial, sans-serif', note: 'Замінити на ліцензійну гарнітуру бренду з input/fonts' },
    scale: steps.map(([name, step, lh, ls]) => ({
      name,
      pt: Math.round(basePt * ratio ** step * 10) / 10,
      px: Math.round(basePt * ratio ** step * (96 / 72) * 10) / 10,
      lineHeight: lh,
      letterSpacing: ls
    }))
  };
}

/* ── Складання ────────────────────────────────────────────────────────── */

export function buildTokens(brief, { logoDir = resolve(ROOT, 'input/logo') } = {}) {
  const logoColors = colorsFromSvg(logoDir);
  const color = buildPalette(brief, logoColors);
  const type = buildType(brief);

  const spacing = { unit: 4, scale: [4, 8, 12, 16, 24, 32, 48, 64, 96] };
  const grid = { columns: 12, gutterMm: 5, marginMm: 18, pageMm: { w: 297, h: 210 } };

  const warnings = [];
  if (!logoColors.length) {
    warnings.push('У input/logo немає SVG — палітра взята дефолтна. Покладіть логотип у векторі.');
  }
  for (const c of color.matrix.slice(0, color.primary.length)) {
    if (c.onWhite.level === 'fail' && c.onBlack.level === 'fail') {
      warnings.push(`${c.name} (${c.hex}) не дає читабельного контрасту ні на світлому, ні на темному`);
    }
  }

  return { color, type, spacing, grid, logo: readLogo(logoDir), warnings };
}

/** Інлайнить SVG логотипа, щоб діаграми показували справжній знак, а не заглушку. */
function readLogo(dir) {
  if (!existsSync(dir)) return { files: [], svg: null };
  const files = readdirSync(dir).filter(f => !f.startsWith('.'));
  const svgFile = files.find(f => extname(f).toLowerCase() === '.svg');
  if (!svgFile) return { files, svg: null };
  const raw = readFileSync(resolve(dir, svgFile), 'utf8');
  const svg = raw.slice(raw.indexOf('<svg'))
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/<\?xml[^>]*\?>/g, '');
  const vb = raw.match(/viewBox="([\d.\s-]+)"/);
  const [, , w, h] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 240, 80];
  return { files, file: svgFile, svg, ratio: w / h };
}

export function tokensToCss(t) {
  const vars = [
    ...t.color.primary.map((c, i) => `  --brand-${i + 1}: ${c.hex};`),
    ...t.color.neutral.map((c, i) => `  --neutral-${i + 1}: ${c.hex};`),
    ...t.type.scale.map(s => `  --fs-${s.name}: ${s.pt}pt;`),
    `  --grid-margin: ${t.grid.marginMm}mm;`
  ];
  return `:root {\n${vars.join('\n')}\n}\n`;
}

export function writeTokens(tokens, outDir = resolve(ROOT, 'output')) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'tokens.json'), JSON.stringify(tokens, null, 2));
  writeFileSync(resolve(outDir, 'tokens.css'), tokensToCss(tokens));
  return tokens;
}
