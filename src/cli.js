#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT } from './lib/env.js';
import { validateBrief } from './brief/validate.js';
import { extractBrief } from './brief/extract.js';
import { spend } from './lib/openrouter.js';

const [cmd, ...rest] = process.argv.slice(2);

const flag = (name, def = null) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? def : (rest[i + 1]?.startsWith('--') ? true : rest[i + 1]);
};
const positional = rest.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

const red = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;

function printReport({ ok, errors, warnings }) {
  for (const e of errors) console.log(`  ${red('✗')} ${e}`);
  for (const w of warnings) console.log(`  ${yellow('!')} ${w}`);
  console.log(ok
    ? `  ${green('✓')} бриф валідний${warnings.length ? dim(`, ${warnings.length} застережень`) : ''}`
    : `  ${red(`${errors.length} помилок`)}`);
  return ok;
}

const HELP = `
brandbook — генератор брендбуків

  brief:validate [шлях]              перевірити бриф за схемою
      за замовчуванням input/brief/brief.json

  brief:extract                      скласти чернетку брифу з матеріалів
      --from <дир>    директорія з матеріалами (типово input/brief)
      --url  <url>    сторінка компанії, можна кілька разів
      --out  <файл>   куди писати (типово input/brief/brief.json)
      --budget <usd>  стеля витрат на прогін
      --no-cache      не брати з кешу

  build                              зібрати брендбук у PDF
      --brief  <файл>   типово input/brief/brief.json
      --out    <файл>   типово output/brandbook.pdf
      --budget <usd>    стеля витрат на прогін

Повний шлях:
  1. покласти матеріали компанії в input/brief/ (txt, md)
  2. покласти логотип у векторі в input/logo/ (svg)
  3. node src/cli.js brief:extract --url https://сайт-компанії
  4. перевірити input/brief/brief.json, виправити припущення
  5. node src/cli.js build
`;

switch (cmd) {
  case 'brief:validate': {
    const path = resolve(ROOT, positional[0] ?? 'input/brief/brief.json');
    console.log(dim(`бриф: ${path}`));
    const brief = JSON.parse(readFileSync(path, 'utf8'));
    process.exit(printReport(validateBrief(brief)) ? 0 : 1);
  }

  case 'brief:extract': {
    const dir = resolve(ROOT, flag('from', 'input/brief'));
    const out = resolve(ROOT, flag('out', 'input/brief/brief.json'));
    const urls = rest.reduce((acc, a, i) =>
      a === '--url' ? [...acc, rest[i + 1]] : acc, []);
    const budget = flag('budget') ? Number(flag('budget')) : null;

    console.log(dim(`матеріали: ${dir}${urls.length ? ` + ${urls.length} URL` : ''}`));
    const { brief, report } = await extractBrief({
      dir, urls, budgetUsd: budget, noCache: flag('no-cache') === true
    });

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(brief, null, 2));
    console.log(dim(`записано: ${out}`));

    const assumptions = brief.meta?.assumptions?.length ?? 0;
    if (assumptions) console.log(dim(`припущень: ${assumptions} (підлягають підтвердженню)`));
    printReport(report);
    console.log(dim(`витрачено: $${spend.usd.toFixed(4)}`));
    break;
  }

  case 'build': {
    const { buildTokens, writeTokens } = await import('./tokens/build.js');
    const { buildStrategy, buildContent, selectSections } = await import('./content/build.js');
    const { buildHtml, renderPdf } = await import('./render/build.js');

    const briefPath = resolve(ROOT, flag('brief', 'input/brief/brief.json'));
    const budget = flag('budget') ? Number(flag('budget')) : null;
    const outPdf = resolve(ROOT, flag('out', 'output/brandbook.pdf'));

    console.log(dim(`бриф: ${briefPath}`));
    const brief = JSON.parse(readFileSync(briefPath, 'utf8'));

    const rep = validateBrief(brief);
    if (!printReport(rep)) {
      console.log(red('\nБриф не пройшов валідацію — виправте помилки й повторіть.'));
      process.exit(1);
    }

    const sections = selectSections(brief);
    console.log(`\n[1/5] секцій обрано: ${sections.length} (пресет ${brief.scope?.preset ?? 'standard'})`);

    console.log('[2/5] токени з логотипа й брифу…');
    const tokens = writeTokens(buildTokens(brief));
    for (const w of tokens.warnings) console.log(`  ${yellow('!')} ${w}`);
    console.log(`  палітра: ${tokens.color.primary.map(c => c.hex).join(' ')} ${dim(`(${tokens.color.source})`)}`);

    console.log('[3/5] стратегія…');
    const { strategy, meta } = await buildStrategy(brief, { budgetUsd: budget });
    writeFileSync(resolve(ROOT, 'output/strategy.json'), JSON.stringify(strategy, null, 2));
    console.log(`  ${meta.cached ? dim('з кешу') : `$${meta.costUsd.toFixed(4)}`} · «${strategy.essence}»`);

    console.log('[4/5] контент сторінок…');
    const { content } = await buildContent(brief, strategy, sections, { budgetUsd: budget });
    writeFileSync(resolve(ROOT, 'output/content.json'), JSON.stringify(content, null, 2));

    console.log('[5/5] верстка й PDF…');
    const html = buildHtml({ brief, strategy, tokens, sections, content });
    const { pdfPath } = await renderPdf(html, outPdf);

    console.log(`\n${green('✓')} ${pdfPath}`);
    console.log(dim(`  сторінок ~${sections.length + 3} · витрачено $${spend.usd.toFixed(4)}`));
    break;
  }

  default:
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
}
