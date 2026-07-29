/* Майстерня брендбуку. Форма будується з brief.schema.json,
   тому не може розійтися зі схемою валідації. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : String(k));
  return n;
};

const REQUIRED = ['company.name', 'company.industry', 'product.what', 'scope.preset'];
const BLOCK_TITLES = {
  company: 'Компанія', product: 'Продукт', audience: 'Аудиторії', market: 'Ринок',
  brand: 'Бренд', verbal: 'Мова', visual: 'Візуальні обмеження',
  references: 'Референси', scope: 'Обсяг', legal: 'Право'
};
const LONG = new Set(['description', 'what', 'positioning', 'story', 'differentiation',
  'notLike', 'existingCopy', 'colorDirection', 'logoNotes', 'restrictions', 'notes',
  'mission', 'vision', 'peopleNotes', 'mood', 'who', 'job', 'barrier', 'trigger', 'note', 'why']);

let S = { schema: null, sections: null, brief: {}, buckets: {}, files: {} };

/* ── пошук сервера ────────────────────────────────────────────────────────
   Сторінку часто відкривають зі вбудованого сервера IDE (WebStorm тримає
   свій на 63342). Там немає ні /api/*, ні статики за абсолютними шляхами,
   тож пробуємо власний origin, а потім типові порти нашого сервера. */
let API = '';

async function findApi() {
  const candidates = [location.origin, 'http://localhost:4000', 'http://127.0.0.1:4000'];
  for (const base of candidates) {
    try {
      const r = await fetch(base + '/api/bootstrap', { signal: AbortSignal.timeout(2500) });
      if (r.ok) return { base: base === location.origin ? '' : base, data: await r.json() };
    } catch { /* пробуємо наступний */ }
  }
  return null;
}

function showOffline() {
  document.querySelector('header').hidden = true;
  document.querySelector('main').hidden = true;
  const box = $('#offline');
  box.hidden = false;
  box.innerHTML = `
    <div class="offline-card">
      <h1>Інтерфейс запускається окремою командою</h1>
      <p>Ця сторінка не працює як звичайний файл: їй потрібен локальний сервер,
         який читає й записує файли проєкту. Вбудований сервер IDE цього не вміє.</p>
      <pre>node src/cli.js ui</pre>
      <p class="muted">Далі відкрийте <a href="http://localhost:4000">http://localhost:4000</a>.
         Якщо сервер уже запущено на іншому порту — відкривайте саме його адресу.</p>
    </div>`;
}

/* ── навігація ────────────────────────────────────────────────────────── */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('is-on', x === t));
  $$('.pane').forEach(p => p.classList.toggle('is-on', p.id === 'pane-' + t.dataset.tab));
  if (t.dataset.tab === 'run') loadOutputs();
}));

const setStatus = (s) => { $('#status').textContent = s; };

/* ── шляхи ────────────────────────────────────────────────────────────── */
function setPath(obj, path, val) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i], nextIsIdx = /^\d+$/.test(parts[i + 1]);
    if (o[k] == null) o[k] = nextIsIdx ? [] : {};
    o = o[k];
  }
  o[parts.at(-1)] = val;
}
function getPath(obj, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* ── поля ─────────────────────────────────────────────────────────────── */
function field(path, key, spec, value) {
  const req = REQUIRED.includes(path);
  const label = el('label', {}, humanKey(key), req ? el('em', { class: 'req' }, ' •') : null);
  const hint = spec.description ? el('span', { class: 'hint' }, spec.description) : null;
  let input;

  if (spec.enum) {
    input = el('select', { 'data-path': path, 'data-kind': 'scalar' },
      el('option', { value: '' }, '—'),
      ...spec.enum.map(v => el('option', { value: v, selected: value === v }, v)));

  } else if (spec.type === 'boolean') {
    input = el('select', { 'data-path': path, 'data-kind': 'bool' },
      el('option', { value: '' }, '—'),
      el('option', { value: 'true', selected: value === true }, 'так'),
      el('option', { value: 'false', selected: value === false }, 'ні'));

  } else if (spec.type === 'integer' || spec.type === 'number') {
    const isAxis = spec.minimum === 0 && spec.maximum === 100;
    if (isAxis) {
      const out = el('b', {}, String(value ?? 50));
      const r = el('input', {
        type: 'range', min: 0, max: 100, value: value ?? 50,
        'data-path': path, 'data-kind': 'num',
        oninput: e => { out.textContent = e.target.value; }
      });
      input = el('div', { class: 'range-row' }, r, out);
    } else {
      input = el('input', { type: 'number', value: value ?? '', 'data-path': path, 'data-kind': 'num' });
    }

  } else if (spec.type === 'array' && spec.items?.type !== 'object') {
    input = el('textarea', {
      'data-path': path, 'data-kind': 'lines',
      placeholder: 'по одному значенню в рядку'
    }, (value ?? []).join('\n'));

  } else if (LONG.has(key) || (spec.description ?? '').length > 90) {
    input = el('textarea', { 'data-path': path, 'data-kind': 'scalar' }, value ?? '');

  } else {
    input = el('input', { type: 'text', value: value ?? '', 'data-path': path, 'data-kind': 'scalar' });
  }

  const wide = spec.type === 'array' || input.tagName === 'TEXTAREA';
  return el('div', { class: 'field' + (wide ? ' wide' : '') }, label, hint, input);
}

function humanKey(k) {
  const map = {
    name: 'Назва', legalName: 'Юридична назва', industry: 'Галузь', description: 'Опис',
    founded: 'Рік заснування', size: 'Розмір', geo: 'Ринки', website: 'Сайт', stage: 'Стадія',
    what: 'Що продаєте', offerings: 'Продукти й послуги', priceSegment: 'Ціновий сегмент',
    channels: 'Канали', physicalProduct: 'Фізичний товар', category: 'Категорія',
    competitors: 'Конкуренти', differentiation: 'Відмінність', notLike: 'На кого не бути схожими',
    mission: 'Місія', vision: 'Візія', values: 'Цінності', essence: 'Суть бренду',
    personality: 'Характер', archetype: 'Архетип', story: 'Історія',
    languages: 'Мови', documentLanguage: 'Мова документа', tagline: 'Тагляйн',
    toneAxes: 'Осі тону', formality: 'Формальність', warmth: 'Теплота', humor: 'Гумор',
    expertise: 'Експертність', doSay: 'Говоримо', dontSay: 'Не говоримо',
    existingCopy: 'Зразок текстів', localization: 'Локалізація',
    hasLogo: 'Є логотип у векторі', logoNotes: 'Про знак', mustKeep: 'Що не змінювати',
    avoid: 'Чого уникати', colorDirection: 'Побажання до кольору', likes: 'Подобається',
    dislikes: 'Не подобається', photography: 'Фотостиль', showPeople: 'Люди в кадрі',
    peopleNotes: 'Типажі', settings: 'Локації', mood: 'Настрій і світло',
    existingAssets: 'Що вже існує', links: 'Посилання', notes: 'Нотатки',
    preset: 'Пресет', sections: 'Секції', excludeSections: 'Виключити', deadline: 'Дедлайн',
    budgetLimitUsd: 'Стеля витрат, $', trademarkStatus: 'Статус ТМ', trademarkSymbol: 'Символ',
    fontLicenses: 'Ліцензії шрифтів', restrictions: 'Обмеження',
    who: 'Хто це', job: 'Яку задачу вирішує', barrier: 'Що заважає', trigger: 'Що штовхає',
    priority: 'Пріоритет', url: 'URL', why: 'Чому саме', aspect: 'Що саме подобається',
    relation: 'Стосунок', note: 'Нотатка', subjects: 'Сюжети'
  };
  return map[k] ?? k;
}

/* ── репітер: масив об'єктів ──────────────────────────────────────────── */
function repeater(path, spec, values) {
  const box = el('div', { class: 'rep' });
  const props = spec.items.properties ?? {};

  const row = (val, idx) => {
    const grid = el('div', { class: 'fgrid' },
      ...Object.entries(props).map(([k, s]) => field(`${path}[${idx}].${k}`, k, s, val?.[k])));
    const item = el('div', { class: 'rep-item' }, grid,
      el('button', { type: 'button', class: 'del', onclick: () => { item.remove(); renumber(); } }, '✕'));
    return item;
  };
  const renumber = () => {
    $$('.rep-item', box).forEach((it, i) => {
      $$('[data-path]', it).forEach(inp => {
        inp.dataset.path = inp.dataset.path.replace(/\[\d+\]/, `[${i}]`);
      });
    });
  };

  (values?.length ? values : [{}]).forEach((v, i) => box.append(row(v, i)));
  box.append(el('button', {
    type: 'button', class: 'btn add',
    onclick: () => { box.insertBefore(row({}, $$('.rep-item', box).length), box.lastChild); renumber(); }
  }, '+ додати'));

  return el('fieldset', { 'data-array': path },
    el('legend', {}, BLOCK_TITLES[path] ?? humanKey(path)),
    spec.description ? el('p', { class: 'muted', style: 'margin-bottom:12px' }, spec.description) : null,
    box);
}

/* ── форма ────────────────────────────────────────────────────────────── */
function renderForm() {
  const form = $('#form');
  form.innerHTML = '';
  const props = S.schema.properties;

  for (const [block, spec] of Object.entries(props)) {
    if (block === 'meta') continue;                       // припущення мають власний UI

    if (spec.type === 'array') {
      form.append(repeater(block, spec, getPath(S.brief, block)));
      continue;
    }

    const fs = el('fieldset', {}, el('legend', {}, BLOCK_TITLES[block] ?? block));
    if (spec.description) fs.append(el('p', { class: 'muted', style: 'margin-bottom:12px' }, spec.description));
    const grid = el('div', { class: 'fgrid' });

    for (const [key, ks] of Object.entries(spec.properties ?? {})) {
      const path = `${block}.${key}`;
      const val = getPath(S.brief, path);

      if (ks.type === 'array' && ks.items?.type === 'object') {
        fs.append(grid.children.length ? grid : null);
        fs.append(repeater(path, ks, val));
        continue;
      }
      if (ks.type === 'object' && ks.properties) {          // toneAxes, photography
        const sub = el('div', { class: 'field wide' },
          el('label', {}, humanKey(key)),
          ks.description ? el('span', { class: 'hint' }, ks.description) : null,
          el('div', { class: 'fgrid', style: 'margin-top:8px' },
            ...Object.entries(ks.properties).map(([k2, s2]) =>
              field(`${path}.${k2}`, k2, s2, getPath(S.brief, `${path}.${k2}`)))));
        grid.append(sub);
        continue;
      }
      grid.append(field(path, key, ks, val));
    }
    if (grid.children.length) fs.append(grid);
    form.append(fs);
  }
}

/* ── збір форми ───────────────────────────────────────────────────────── */
function collectForm() {
  const out = {};
  if (S.brief.meta) out.meta = structuredClone(S.brief.meta);

  for (const inp of $$('#form [data-path]')) {
    const { path, kind } = inp.dataset;
    let v = inp.value;

    if (kind === 'lines') {
      v = v.split('\n').map(s => s.trim()).filter(Boolean);
      if (!v.length) continue;
    } else if (kind === 'num') {
      if (v === '') continue;
      v = Number(v);
    } else if (kind === 'bool') {
      if (v === '') continue;
      v = v === 'true';
    } else {
      v = v.trim();
      if (!v) continue;
    }
    setPath(out, path, v);
  }

  // порожні елементи репітерів прибираємо, щоб не ламати валідацію
  for (const key of Object.keys(out)) {
    if (Array.isArray(out[key])) {
      out[key] = out[key].filter(x => x && Object.keys(x).length);
      if (!out[key].length) delete out[key];
    }
    if (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      for (const k2 of Object.keys(out[key])) {
        if (Array.isArray(out[key][k2])) {
          out[key][k2] = out[key][k2].filter(x =>
            typeof x === 'string' ? x : x && Object.keys(x).length);
          if (!out[key][k2].length) delete out[key][k2];
        }
      }
    }
  }

  // секції з вкладки 3
  const picked = $$('#sections input:checked').map(c => c.value);
  if (picked.length) setPath(out, 'scope.sections', picked);

  // підтверджені припущення
  $$('#assumptions input[type=checkbox]').forEach((c, i) => {
    if (out.meta?.assumptions?.[i]) out.meta.assumptions[i].confirmed = c.checked;
  });

  // Припущення прив'язані до конкретної компанії. Якщо назву змінили —
  // старі здогади стосуються іншого бренду й потрапили б у чужий брендбук.
  const was = S.brief.company?.name, now = out.company?.name;
  if (was && now && was !== now && out.meta) {
    delete out.meta.assumptions;
    out.meta.mode = 'manual';
  }

  return out;
}

/* ── чий бриф зараз завантажено ───────────────────────────────────────── */
function syncExtractButton() {
  const texts = (S.files.brief ?? []).length;
  const btn = $('#btn-extract');
  btn.disabled = !texts;
  btn.title = texts
    ? `Прочитає ${texts} файл(ів) з input/brief/`
    : 'Немає текстових матеріалів. Додайте .txt або .md на вкладці «Матеріали» — або вкажіть URL сайту.';
  const url = $('#site-url').value.trim();
  if (!texts && url) btn.disabled = false;
}
$('#site-url')?.addEventListener('input', () => syncExtractButton());

function renderOwner() {
  const box = $('#owner');
  box.innerHTML = '';
  const name = S.brief.company?.name;
  if (!name) {
    box.append(el('div', { class: 'owner' },
      el('span', {}, 'Новий бриф — форма порожня.'),
      el('span', { class: 'muted' }, 'Заповніть поля або складіть автоматично з матеріалів.')));
    return;
  }
  box.append(el('div', { class: 'owner' },
    el('span', {}, 'Завантажено бриф: ', el('b', {}, name)),
    el('button', {
      class: 'btn', onclick: async () => {
        if (!confirm(`Очистити бриф «${name}» і почати з нуля?\nМатеріали у input/ не постраждають.`)) return;
        await fetch(API + '/api/brief', { method: 'DELETE' });
        S.brief = {};
        renderForm(); renderAssumptions(); renderSections(); renderOwner();
        $('#report').innerHTML = ''; markClean();
        setStatus('бриф очищено');
      }
    }, 'Почати з нуля')));
}

/* ── незбережені зміни ────────────────────────────────────────────────── */
let dirty = false;
function markDirty() {
  if (dirty) return;
  dirty = true;
  $('#btn-save').textContent = 'Зберегти бриф •';
  $('#btn-save').classList.add('is-dirty');
}
function markClean() {
  dirty = false;
  $('#btn-save').textContent = 'Зберегти бриф';
  $('#btn-save').classList.remove('is-dirty');
}
document.addEventListener('input', e => { if (e.target.closest('#form, #assumptions')) markDirty(); });
document.addEventListener('change', e => { if (e.target.closest('#sections')) markDirty(); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ── припущення ───────────────────────────────────────────────────────── */
function renderAssumptions() {
  const box = $('#assumptions');
  const list = S.brief.meta?.assumptions ?? [];
  box.innerHTML = '';
  if (!list.length) return;

  const unconfirmed = list.filter(a => !a.confirmed).length;
  box.append(
    el('div', { class: 'asm-head' },
      el('h2', {}, 'Що система домислила'),
      el('span', { class: 'muted' },
        unconfirmed
          ? `${unconfirmed} непідтверджених — вони надрукуються в брендбуку окремою сторінкою`
          : 'усі підтверджено')),
    el('div', { class: 'asm' }, ...list.map(a =>
      el('div', { class: 'asm-row' },
        el('code', {}, a.field),
        el('div', {},
          el('div', {}, String(a.assumed)),
          el('div', { class: 'why' }, a.why)),
        el('label', { class: 'chk' },
          el('input', { type: 'checkbox', checked: !!a.confirmed }), 'згоден'))))
  );
}

/* ── секції ───────────────────────────────────────────────────────────── */
function renderSections() {
  const box = $('#sections');
  const groups = S.sections.groups;
  const chosen = new Set(S.brief.scope?.sections ?? []);
  const preset = S.brief.scope?.preset ?? 'standard';
  box.innerHTML = '';

  $('#presets').innerHTML = '';
  for (const [key, p] of Object.entries(S.sections.presets)) {
    $('#presets').append(el('button', {
      class: 'btn', onclick: () => applyPreset(key)
    }, `${p.title} · ${p.sections}`));
  }

  for (const g of groups) {
    const items = S.sections.sections.filter(s => s.group === g.id);
    if (!items.length) continue;

    const all = el('input', {
      type: 'checkbox', onchange: e => {
        $$(`[data-group="${g.id}"] .sitem input`).forEach(c => { c.checked = e.target.checked; });
        countSections();
      }
    });
    box.append(el('div', { class: 'sgroup', 'data-group': g.id },
      el('div', { class: 'sgroup-h' }, el('h3', {}, g.title),
        el('label', { class: 'chk' }, all, 'усі')),
      el('div', { class: 'slist' }, ...items.map(s => {
        const on = chosen.size ? chosen.has(s.id) : s.presets.includes(preset);
        const visual = s.production.some(p => ['image-gen', 'composite', 'video-gen'].includes(p));
        return el('label', { class: 'sitem' },
          el('input', { type: 'checkbox', value: s.id, checked: on, onchange: countSections }),
          el('div', {},
            el('div', { class: 't' }, s.title,
              visual ? el('span', { class: 'tag' }, 'потребує візуалу') : null),
            el('div', { class: 'd' }, s.description)));
      }))));
  }
  countSections();
}

function applyPreset(key) {
  $$('#sections .sitem input').forEach(c => {
    const s = S.sections.sections.find(x => x.id === c.value);
    c.checked = !!s?.presets.includes(key);
  });
  countSections();
}

function countSections() {
  const picked = $$('#sections input:checked').filter(c => c.value);
  const pages = picked.reduce((n, c) =>
    n + (S.sections.sections.find(s => s.id === c.value)?.pages ?? 1), 0);
  $('#sec-count').textContent = `Обрано ${picked.length} секцій · приблизно ${pages + 3} сторінок`;
}

/* ── файли ────────────────────────────────────────────────────────────── */
const fmtSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
let queue = [];

function guessBucket(name) {
  const e = '.' + name.split('.').pop().toLowerCase();
  if (e === '.svg') return 'logo';
  if (['.ttf', '.otf', '.woff', '.woff2'].includes(e)) return 'fonts';
  if (['.txt', '.md', '.markdown', '.csv'].includes(e)) return 'brief';
  if (['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'].includes(e)) return 'photos';
  return 'brief';
}

function renderQueue() {
  const box = $('#queue');
  box.innerHTML = '';
  if (!queue.length) return;

  queue.forEach((item, i) => {
    box.append(el('div', { class: 'qrow' },
      el('span', { class: 'nm' }, item.file.name),
      el('span', { class: 'sz' }, fmtSize(item.file.size)),
      el('select', { onchange: e => { queue[i].bucket = e.target.value; } },
        ...Object.entries(S.buckets).map(([k, t]) =>
          el('option', { value: k, selected: item.bucket === k }, t))),
      el('button', { class: 'del', onclick: () => { queue.splice(i, 1); renderQueue(); } }, '✕')));
  });
  box.append(el('button', { class: 'btn btn-primary', onclick: doUpload },
    `Завантажити ${queue.length} файл(ів)`));
}

function addFiles(files) {
  for (const f of files) queue.push({ file: f, bucket: guessBucket(f.name) });
  renderQueue();
}

async function doUpload() {
  const fd = new FormData();
  for (const { file, bucket } of queue) fd.append(bucket, file, file.name);
  setStatus('завантаження…');
  const r = await fetch(API + '/api/upload', { method: 'POST', body: fd }).then(r => r.json());
  queue = []; renderQueue();
  S.files = r.files; renderBuckets(); syncExtractButton();
  setStatus(`завантажено ${r.saved.length}`);
}

function renderBuckets() {
  const box = $('#buckets');
  box.innerHTML = '';
  for (const [key, title] of Object.entries(S.buckets)) {
    const files = S.files[key] ?? [];
    box.append(el('div', { class: 'bucket' },
      el('h3', {}, title),
      el('div', { class: 'path' }, `input/${key}/`),
      files.length
        ? el('ul', {}, ...files.map(f => el('li', {},
            el('span', {}, f.name),
            el('span', { class: 'sz muted' }, fmtSize(f.size)),
            el('button', {
              class: 'x', title: 'видалити',
              onclick: async () => {
                const r = await fetch(`${API}/api/file?bucket=${key}&name=${encodeURIComponent(f.name)}`,
                  { method: 'DELETE' }).then(r => r.json());
                S.files = r.files; renderBuckets(); checkLogo();
              }
            }, '✕'))))
        : el('div', { class: 'empty' }, 'порожньо')));
  }
  checkLogo();
}

function checkLogo() {
  const svg = (S.files.logo ?? []).some(f => f.name.toLowerCase().endsWith('.svg'));
  $('#logo-note').innerHTML = '';
  $('#logo-note').append(svg
    ? el('div', { class: 'ok-box' }, '✓ Логотип у векторі є — палітру буде взято з нього.')
    : el('div', { class: 'warn-box' },
        'Немає SVG у input/logo. Без вектора палітра буде дефолтною, а знак у діаграмах — заглушкою. Растр (PNG, JPG) не підходить.'));
}

/* ── дії ──────────────────────────────────────────────────────────────── */
function showReport(rep) {
  const box = $('#report');
  box.innerHTML = '';
  for (const e of rep.errors ?? []) box.append(el('div', { class: 'msg err' }, '✗ ' + e));
  for (const w of rep.warnings ?? []) box.append(el('div', { class: 'msg warn' }, '! ' + w));
  if (rep.ok) box.append(el('div', { class: 'msg ok' }, '✓ Бриф валідний'));
}

$('#btn-save').addEventListener('click', async () => {
  const brief = collectForm();
  setStatus('збереження…');
  const rep = await fetch(API + '/api/brief', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brief)
  }).then(r => r.json());
  S.brief = brief;
  showReport(rep);
  renderOwner(); renderAssumptions(); markClean();
  setStatus(rep.ok ? 'збережено' : 'збережено з помилками');
});

function stream(params, onDone) {
  const log = $('#log');
  log.textContent = '';
  const es = new EventSource(API + '/api/run?' + new URLSearchParams(params));
  es.addEventListener('log', e => {
    log.textContent += JSON.parse(e.data);
    log.scrollTop = log.scrollHeight;
  });
  es.addEventListener('done', async e => {
    es.close();
    const { code } = JSON.parse(e.data);
    setStatus(code === 0 ? 'готово' : `помилка (код ${code})`);
    onDone?.(code);
  });
  es.onerror = () => { es.close(); setStatus('обрив зʼєднання'); };
}

$('#btn-extract').addEventListener('click', () => {
  $$('.tab').find(t => t.dataset.tab === 'run').click();
  setStatus('складання брифу…');
  stream({ cmd: 'extract', url: $('#site-url').value.trim(), budget: $('#budget').value },
    async () => { await bootstrap(); $$('.tab').find(t => t.dataset.tab === 'brief').click(); });
});

$('#btn-build').addEventListener('click', () => {
  setStatus('збірка…');
  $('#btn-build').disabled = true;
  stream({ cmd: 'build', budget: $('#budget').value }, () => {
    $('#btn-build').disabled = false;
    loadOutputs();
  });
});

async function loadOutputs() {
  const { files } = await fetch(API + '/api/output').then(r => r.json());
  const box = $('#outputs');
  box.innerHTML = '';
  const nice = { 'brandbook.pdf': 'Брендбук PDF', 'brandbook.html': 'Брендбук HTML',
    'tokens.json': 'Токени', 'tokens.css': 'CSS-змінні', 'strategy.json': 'Стратегія',
    'content.json': 'Тексти', 'costs.jsonl': 'Журнал витрат' };
  for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
    box.append(el('a', { class: 'out', href: API + '/output/' + f.name, target: '_blank' },
      el('b', {}, nice[f.name] ?? f.name),
      el('span', {}, fmtSize(f.size))));
  }
}

/* ── перетягування ────────────────────────────────────────────────────── */
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('hot');
}));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('hot');
}));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#pick').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

/* ── старт ────────────────────────────────────────────────────────────── */
async function bootstrap() {
  const found = await findApi();
  if (!found) return showOffline();
  API = found.base;
  const d = found.data;
  S.schema = d.schema; S.sections = d.sections;
  S.brief = d.brief ?? {}; S.buckets = d.buckets; S.files = d.files;
  renderForm(); renderAssumptions(); renderSections(); renderBuckets(); renderOwner();
  syncExtractButton(); markClean();
  setStatus(d.brief ? 'бриф завантажено' : 'бриф ще не створено');
}
bootstrap();
