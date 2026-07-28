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

Приклади:
  node src/cli.js brief:validate data/brief.example.json
  node src/cli.js brief:extract --from input/brief --url https://example.com
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

  default:
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
}
