/** Рендерери сторінок. Кожен повертає HTML одного розвороту A4 landscape. */

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const list = (items, cls = '') => items?.length
  ? `<ul class="${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';

const inner = (svg = '') => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const page = (cls, inner, num, title) => `
<section class="page ${cls}">
  ${inner}
  ${num ? `<footer class="pfoot"><span>${esc(title ?? '')}</span><span>${num}</span></footer>` : ''}
</section>`;

/* ── Службові ─────────────────────────────────────────────────────────── */

export function cover({ brief, tokens }) {
  const c = tokens.color.primary[0]?.hex ?? '#1d3b2a';
  return page('cover', `
    <div class="cover-bg" style="background:${c}"></div>
    <div class="cover-in">
      <div class="cover-mark">${brief.company?.name ?? ''}</div>
      <h1>Брендбук</h1>
      <div class="cover-meta">
        <span>${esc(brief.company?.industry ?? '')}</span>
        <span>${new Date().getFullYear()} · версія 1.0</span>
      </div>
    </div>`);
}

export function contents({ groups, pageMap }) {
  const rows = groups.map(([g, items]) => `
    <div class="toc-g">
      <h3>${esc(g)}</h3>
      ${items.map(s => `<div class="toc-r"><span>${esc(s.title)}</span><i></i><b>${pageMap[s.id] ?? ''}</b></div>`).join('')}
    </div>`).join('');
  return page('toc', `<h2>Зміст</h2><div class="toc-cols">${rows}</div>`, null);
}

/* ── Типова текстова секція ───────────────────────────────────────────── */

export function textPage({ section, content, num }) {
  const c = content ?? {};
  return page('text', `
    <header class="ph"><span class="pkicker">${esc(section.group)}</span>
      <h2>${esc(c.title ?? section.title)}</h2>
      ${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
    </header>
    <div class="cols">
      <div class="col-main">
        ${(c.body ?? [section.description]).map(p => `<p>${esc(p)}</p>`).join('')}
      </div>
      <aside class="col-side">
        ${c.rules?.length ? `<h4>Правила</h4>${list(c.rules, 'rules')}` : ''}
        ${c.dos?.length ? `<h4 class="ok">Можна</h4>${list(c.dos, 'dos')}` : ''}
        ${c.donts?.length ? `<h4 class="no">Не можна</h4>${list(c.donts, 'donts')}` : ''}
      </aside>
    </div>`, num, c.title ?? section.title);
}

/* ── Колір ────────────────────────────────────────────────────────────── */

export function colorPage({ tokens, content, num }) {
  const swatch = (c) => `
    <div class="sw">
      <div class="sw-c" style="background:${c.hex}"></div>
      <div class="sw-i">
        <b>${esc(c.name)}</b>
        <code>${c.hex.toUpperCase()}</code>
        <code>RGB ${c.rgb}</code>
        <code>CMYK ${c.cmyk}</code>
        <span class="sw-role">${esc(c.role ?? '')}</span>
      </div>
    </div>`;
  return page('color', `
    <header class="ph"><span class="pkicker">колір</span><h2>Палітра</h2>
      <p class="lead">${tokens.color.primary.length} фірмових ${tokens.color.primary.length === 1 ? 'колір' : 'кольори'} та ${tokens.color.neutral.length} нейтральних. Коди наведено для екрана й для друку.</p>
    </header>
    <div class="sws">${tokens.color.primary.map(swatch).join('')}</div>
    <div class="sws sws-n">${tokens.color.neutral.map(swatch).join('')}</div>
    <p class="src">Джерело палітри: ${tokens.color.source}</p>`, num, 'Палітра');
}

export function contrastPage({ tokens, num }) {
  const row = (m) => `
    <tr>
      <td><span class="dot" style="background:${m.hex}"></span>${esc(m.name)}</td>
      <td><code>${m.hex.toUpperCase()}</code></td>
      <td class="lv-${m.onWhite.level}">${m.onWhite.ratio} · ${m.onWhite.level}</td>
      <td class="lv-${m.onBlack.level}">${m.onBlack.ratio} · ${m.onBlack.level}</td>
    </tr>`;
  return page('table', `
    <header class="ph"><span class="pkicker">колір</span><h2>Контраст і доступність</h2>
      <p class="lead">Коефіцієнти за WCAG 2.1. AA — мінімум для основного тексту, AAA — для дрібного.</p>
    </header>
    <table class="tbl">
      <thead><tr><th>Колір</th><th>HEX</th><th>На білому</th><th>На темному</th></tr></thead>
      <tbody>${tokens.color.matrix.map(row).join('')}</tbody>
    </table>`, num, 'Контраст');
}

/* ── Типографіка ──────────────────────────────────────────────────────── */

export function typePage({ tokens, content, num }) {
  const rows = tokens.type.scale.map(s => `
    <div class="ts-r">
      <div class="ts-m"><b>${s.name}</b><code>${s.pt}pt / ${s.px}px</code>
        <code>lh ${s.lineHeight} · ls ${s.letterSpacing}</code></div>
      <div class="ts-s" style="font-size:${s.pt}pt;line-height:${s.lineHeight};letter-spacing:${s.letterSpacing}">
        Швидка бура лисиця</div>
    </div>`).join('');
  return page('type', `
    <header class="ph"><span class="pkicker">типографіка</span><h2>Типографічна шкала</h2>
      <p class="lead">${esc(content?.lead ?? `Модульна шкала з коефіцієнтом ${tokens.type.ratio}, база ${tokens.type.basePt}pt.`)}</p>
    </header>
    <div class="ts">${rows}</div>`, num, 'Типографічна шкала');
}

/* ── Логотип: охоронне поле й мінімальні розміри ──────────────────────── */

export function clearspacePage({ tokens, content, num }) {
  const brand = tokens.color.primary[0]?.hex ?? '#1d3b2a';
  return page('diagram', `
    <header class="ph"><span class="pkicker">логотип</span><h2>Охоронне поле</h2>
      <p class="lead">${esc(content?.lead ?? 'Вільний простір навколо знака задається у власних одиницях x — висоті знака. Так правило працює на будь-якому розмірі.')}</p>
    </header>
    <div class="dia">
      <svg viewBox="0 0 520 300" class="dia-svg">
        <rect x="40" y="40" width="440" height="220" fill="none" stroke="${brand}"
              stroke-width="1.5" stroke-dasharray="6 5" opacity=".55"/>
        ${tokens.logo?.svg
          ? `<g transform="translate(140,110)"><svg width="240" height="80" viewBox="0 0 ${240} ${80}"
               preserveAspectRatio="xMidYMid meet">${inner(tokens.logo.svg)}</svg></g>`
          : `<rect x="140" y="110" width="240" height="80" fill="${brand}" opacity=".12"/>
             <text x="260" y="158" text-anchor="middle" font-size="26" font-weight="700"
                   fill="${brand}" font-family="Helvetica">ЛОГОТИП</text>`}
        ${[[90, 150, 140, 150], [380, 150, 430, 150], [260, 75, 260, 110], [260, 190, 260, 225]]
          .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="${brand}" stroke-width="1.2" marker-start="url(#a)" marker-end="url(#a)"/>`).join('')}
        <defs><marker id="a" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0 3.5 L7 1 L7 6 Z" fill="${brand}"/></marker></defs>
        ${[[115, 143], [405, 143], [268, 96], [268, 212]].map(([x, y]) =>
          `<text x="${x}" y="${y}" font-size="15" font-weight="700" fill="${brand}" font-family="Helvetica">x</text>`).join('')}
      </svg>
      <aside class="col-side">
        <h4>Правила</h4>
        <ul class="rules">
          <li>x — висота знака. Поле не менше 1x з кожного боку.</li>
          <li>У поле не заходять текст, інші знаки, краї макета, фото.</li>
          <li>На дрібних носіях поле не зменшується — зменшується знак.</li>
        </ul>
        ${content?.donts?.length ? `<h4 class="no">Не можна</h4>${list(content.donts, 'donts')}` : ''}
      </aside>
    </div>`, num, 'Охоронне поле');
}

export function minSizePage({ tokens, content, num }) {
  const brand = tokens.color.primary[0]?.hex ?? '#1d3b2a';
  const sizes = [
    ['Друк, повна версія', '30 мм'], ['Друк, лише знак', '12 мм'],
    ['Екран, повна версія', '120 px'], ['Екран, лише знак', '32 px'],
    ['Вишивка', '45 мм'], ['Гравіювання', '20 мм']
  ];
  return page('diagram', `
    <header class="ph"><span class="pkicker">логотип</span><h2>Мінімальні розміри</h2>
      <p class="lead">${esc(content?.lead ?? 'Нижче цих значень знак втрачає читабельність. Для друку й екрана значення різні.')}</p>
    </header>
    <div class="cols">
      <div class="col-main">
        <table class="tbl">
          <thead><tr><th>Носій</th><th>Мінімум</th></tr></thead>
          <tbody>${sizes.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</tbody>
        </table>
      </div>
      <aside class="col-side">
        <div class="minrow">
          ${[64, 40, 24].map(w => `<div class="minbox">
            ${tokens.logo?.svg
              ? `<div style="width:${w}px">${tokens.logo.svg}</div>`
              : `<div style="width:${w}px;height:${Math.round(w * 0.34)}px;background:${brand}"></div>`}
            <code>${w}px</code></div>`).join('')}
        </div>
        <h4>Правила</h4>
        <ul class="rules">
          <li>Значення міряються по ширині повного лок-апа.</li>
          <li>Якщо місця менше — береться версія «лише знак».</li>
        </ul>
      </aside>
    </div>`, num, 'Мінімальні розміри');
}

/* ── Заглушка для секцій, що потребують генерації зображень ───────────── */

export function pendingPage({ section, content, num }) {
  const kinds = section.production.join(', ');
  return page('pending', `
    <header class="ph"><span class="pkicker">${esc(section.group)}</span>
      <h2>${esc(content?.title ?? section.title)}</h2>
      ${content?.lead ? `<p class="lead">${esc(content.lead)}</p>` : ''}
    </header>
    <div class="cols">
      <div class="col-main">
        ${(content?.body ?? [section.description]).map(p => `<p>${esc(p)}</p>`).join('')}
        <div class="ph-box">
          <b>Візуал ще не згенеровано</b>
          <span>Тип виробництва: ${esc(kinds)}</span>
        </div>
      </div>
      <aside class="col-side">
        ${content?.rules?.length ? `<h4>Правила</h4>${list(content.rules, 'rules')}` : ''}
        ${content?.donts?.length ? `<h4 class="no">Не можна</h4>${list(content.donts, 'donts')}` : ''}
      </aside>
    </div>`, num, content?.title ?? section.title);
}

/* ── Припущення ───────────────────────────────────────────────────────── */

export function assumptionsPage({ brief, num }) {
  const a = (brief.meta?.assumptions ?? []).filter(x => !x.confirmed);
  if (!a.length) return '';
  return page('text', `
    <header class="ph"><span class="pkicker">службове</span><h2>Припущення, що потребують підтвердження</h2>
      <p class="lead">Ці значення виведені системою з наданих матеріалів, а не задані замовником. Їх треба підтвердити або виправити.</p>
    </header>
    <table class="tbl">
      <thead><tr><th>Поле</th><th>Припущено</th><th>На основі чого</th></tr></thead>
      <tbody>${a.map(x => `<tr><td><code>${esc(x.field)}</code></td><td>${esc(String(x.assumed))}</td><td class="dim">${esc(x.why)}</td></tr>`).join('')}</tbody>
    </table>`, num, 'Припущення');
}

/** Маршрутизація секції до рендерера. */
export const RENDERERS = {
  'color.primary': colorPage,
  'color.codes': colorPage,
  'color.contrast': contrastPage,
  'type.scale': typePage,
  'logo.clearspace': clearspacePage,
  'logo.min-size': minSizePage
};

export function renderSection(section, ctx) {
  const fn = RENDERERS[section.id];
  if (fn) return fn(ctx);
  const visual = section.production.some(p =>
    ['image-gen', 'composite', 'video-gen', 'image-asset'].includes(p));
  return visual ? pendingPage(ctx) : textPage(ctx);
}
