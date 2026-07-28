import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../lib/env.js';
import { tokensToCss } from '../tokens/build.js';
import { cover, contents, renderSection, assumptionsPage } from './pages.js';

const GROUP_TITLES = {
  meta: 'Службові сторінки', strategy: 'Стратегія', verbal: 'Вербальна ідентичність',
  logo: 'Логотип', color: 'Колір', typography: 'Типографіка', graphics: 'Графічна мова',
  motion: 'Рух і звук', applications: 'Носії', digital: 'Digital', governance: 'Правила'
};

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; }
body {
  font-family: Inter, -apple-system, Helvetica, Arial, sans-serif;
  color: var(--neutral-1); font-size: var(--fs-body); line-height: 1.55;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  position: relative; width: 297mm; height: 210mm; padding: 18mm 20mm 14mm;
  page-break-after: always; overflow: hidden; background: #fff;
}
.page:last-child { page-break-after: auto; }

.ph { border-bottom: 1px solid rgba(0,0,0,.12); padding-bottom: 6mm; margin-bottom: 8mm; }
.pkicker { font-size: var(--fs-caption); letter-spacing:.14em; text-transform: uppercase;
           color: var(--brand-1); font-weight: 700; }
h1 { font-size: var(--fs-h1); line-height:1.05; margin:0; letter-spacing:-.02em; }
h2 { font-size: var(--fs-h2); line-height:1.1; margin:.5mm 0 0; letter-spacing:-.015em; }
h3 { font-size: var(--fs-h4); margin:0 0 3mm; }
h4 { font-size: var(--fs-small); margin:6mm 0 2mm; text-transform:uppercase;
     letter-spacing:.08em; color:#555; }
h4.ok { color:#1a7f3c; } h4.no { color:#a32020; }
p { margin: 0 0 3.5mm; max-width: 62ch; }
.lead { font-size: var(--fs-h4); line-height:1.4; color:#333; margin-top:3mm; max-width:78ch; }

.cols { display:grid; grid-template-columns: 1.75fr 1fr; gap: 14mm; }
.col-side { border-left:1px solid rgba(0,0,0,.1); padding-left: 8mm; }
ul { margin:0; padding-left: 4.5mm; }
li { margin-bottom: 1.8mm; font-size: var(--fs-small); }
.donts li::marker { color:#a32020; } .dos li::marker { color:#1a7f3c; }
.rules li::marker { color: var(--brand-1); }

.pfoot { position:absolute; left:20mm; right:20mm; bottom:8mm; display:flex;
  justify-content:space-between; font-size: var(--fs-caption); color:#8a8a8a;
  border-top:1px solid rgba(0,0,0,.08); padding-top:2.5mm; }

/* обкладинка */
.cover { padding:0; color:#fff; }
.cover-bg { position:absolute; inset:0; }
.cover-in { position:relative; height:100%; padding:20mm; display:flex;
  flex-direction:column; justify-content:space-between; }
.cover-mark { font-size: var(--fs-h3); font-weight:700; letter-spacing:-.01em; }
.cover h1 { font-size: 46pt; margin:0; }
.cover-meta { display:flex; justify-content:space-between; font-size: var(--fs-small); opacity:.8; }

/* зміст */
.toc-cols { columns:2; column-gap:14mm; }
.toc-g { break-inside: avoid; margin-bottom:6mm; }
.toc-g h3 { color: var(--brand-1); font-size: var(--fs-small); text-transform:uppercase;
  letter-spacing:.1em; margin-bottom:2mm; }
.toc-r { display:flex; align-items:baseline; gap:2mm; font-size: var(--fs-small); margin-bottom:1.2mm; }
.toc-r i { flex:1; border-bottom:1px dotted rgba(0,0,0,.25); }
.toc-r b { font-variant-numeric: tabular-nums; font-weight:600; }

/* палітра */
.sws { display:grid; grid-template-columns: repeat(4, 1fr); gap:6mm; }
.sws-n { margin-top:6mm; grid-template-columns: repeat(4, 1fr); }
.sw-c { height:34mm; border-radius:2mm; border:1px solid rgba(0,0,0,.08); }
.sws-n .sw-c { height:16mm; }
.sw-i { padding-top:2.5mm; display:flex; flex-direction:column; gap:.6mm; }
.sw-i b { font-size: var(--fs-small); }
.sw-i code { font-size: var(--fs-caption); color:#555; font-family: ui-monospace, monospace; }
.sw-role { font-size: var(--fs-caption); color:#888; margin-top:1mm; }
.src { margin-top:6mm; font-size: var(--fs-caption); color:#888; }

/* таблиці */
.tbl { width:100%; border-collapse: collapse; font-size: var(--fs-small); }
.tbl th { text-align:left; font-size: var(--fs-caption); text-transform:uppercase;
  letter-spacing:.08em; color:#666; border-bottom:1.5px solid rgba(0,0,0,.2); padding:2.5mm 2mm; }
.tbl td { padding:2.5mm 2mm; border-bottom:1px solid rgba(0,0,0,.08); vertical-align:top; }
.tbl code { font-family: ui-monospace, monospace; font-size: var(--fs-caption); }
.tbl .dim { color:#777; font-size: var(--fs-caption); }
.dot { display:inline-block; width:3.5mm; height:3.5mm; border-radius:50%;
  margin-right:2mm; vertical-align:-.4mm; border:1px solid rgba(0,0,0,.12); }
.lv-AAA { color:#137a35; font-weight:600; } .lv-AA { color:#2a7d2a; }
.lv-AA-large { color:#9a6b00; } .lv-fail { color:#a32020; }

/* типографічна шкала */
.ts-r { display:grid; grid-template-columns: 38mm 1fr; gap:6mm; align-items:baseline;
  padding:2.5mm 0; border-bottom:1px solid rgba(0,0,0,.07); }
.ts-m { display:flex; flex-direction:column; }
.ts-m b { font-size: var(--fs-small); }
.ts-m code { font-size: var(--fs-caption); color:#777; font-family: ui-monospace, monospace; }
.ts-s { white-space:nowrap; overflow:hidden; }

/* діаграми */
.dia { display:grid; grid-template-columns: 1.75fr 1fr; gap:14mm; }
.dia-svg { width:100%; height:auto; }
.minrow { display:flex; gap:6mm; align-items:flex-end; margin-bottom:4mm; }
.minbox { display:flex; flex-direction:column; gap:1.5mm; }
.minbox code { font-size: var(--fs-caption); color:#777; }

/* заглушка */
.ph-box { margin-top:6mm; border:1.5px dashed rgba(0,0,0,.22); border-radius:2mm;
  padding:10mm; display:flex; flex-direction:column; gap:1.5mm; background:#fafaf8; }
.ph-box b { font-size: var(--fs-small); }
.ph-box span { font-size: var(--fs-caption); color:#777; }
`;

export function buildHtml({ brief, strategy, tokens, sections, content }) {
  // нумерація: обкладинка й зміст без номера
  const pageMap = {};
  sections.forEach((s, i) => { pageMap[s.id] = i + 3; });

  const groups = Object.entries(
    sections.reduce((acc, s) => {
      (acc[GROUP_TITLES[s.group] ?? s.group] ??= []).push(s);
      return acc;
    }, {})
  );

  const body = [
    cover({ brief, tokens }),
    contents({ groups, pageMap }),
    ...sections.map((s, i) => renderSection(s, {
      section: s, content: content[s.id], tokens, brief, strategy, num: i + 3
    })),
    assumptionsPage({ brief, num: sections.length + 3 })
  ].join('\n');

  return `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<title>Брендбук — ${brief.company?.name ?? ''}</title>
<style>${tokensToCss(tokens)}${CSS}</style></head><body>${body}</body></html>`;
}

export async function renderPdf(html, outPdf) {
  const { chromium } = await import('playwright');
  const outDir = resolve(ROOT, 'output');
  mkdirSync(outDir, { recursive: true });
  const htmlPath = resolve(outDir, 'brandbook.html');
  writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outPdf, format: 'A4', landscape: true, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  return { htmlPath, pdfPath: outPdf };
}
