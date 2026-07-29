import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { ROOT } from './lib/env.js';
import { validateBrief } from './brief/validate.js';

const WEB = resolve(ROOT, 'web');
const INPUT = resolve(ROOT, 'input');
const BRIEF_PATH = resolve(INPUT, 'brief/brief.json');

/** Куди лягає файл залежно від типу. Ключ = ім'я підпапки в input/. */
const BUCKETS = {
  logo: { exts: ['.svg', '.ai', '.eps', '.pdf'], title: 'Логотип' },
  photos: { exts: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff'], title: 'Фото' },
  references: { exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'], title: 'Референси' },
  fonts: { exts: ['.ttf', '.otf', '.woff', '.woff2'], title: 'Шрифти' },
  brief: { exts: ['.txt', '.md', '.markdown', '.csv', '.json', '.docx', '.pdf'], title: 'Матеріали' }
};

/** Автовибір папки за розширенням — користувач може перевизначити. */
function guessBucket(name) {
  const e = extname(name).toLowerCase();
  if (e === '.svg') return 'logo';
  if (BUCKETS.fonts.exts.includes(e)) return 'fonts';
  if (['.txt', '.md', '.markdown', '.csv'].includes(e)) return 'brief';
  if (BUCKETS.photos.exts.includes(e)) return 'photos';
  return 'brief';
}

const json = (res, data, code = 200) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

const safeName = (n) => basename(String(n)).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);

function listFiles() {
  const out = {};
  for (const b of Object.keys(BUCKETS)) {
    const dir = resolve(INPUT, b);
    out[b] = existsSync(dir)
      ? readdirSync(dir)
          .filter(f => !f.startsWith('.') && f !== 'brief.json')
          .map(f => ({ name: f, size: statSync(resolve(dir, f)).size }))
      : [];
  }
  return out;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Запуск CLI-команди з трансляцією логу через Server-Sent Events. */
function runStream(res, args) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

  const child = spawn(process.execPath, [resolve(ROOT, 'src/cli.js'), ...args], { cwd: ROOT });
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  child.stdout.on('data', d => send('log', strip(d.toString())));
  child.stderr.on('data', d => send('log', strip(d.toString())));
  child.on('close', code => { send('done', { code }); res.end(); });
  child.on('error', e => { send('log', `Помилка запуску: ${e.message}`); send('done', { code: 1 }); res.end(); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Сторінку часто відкривають зі вбудованого сервера IDE (інший порт).
  // Пускаємо тільки локальні origin: сервер має доступ до файлів проєкту,
  // тому «*» дозволив би будь-якому сайту в браузері читати їх.
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    /* ── статика ─────────────────────────────────────────────────────── */
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(resolve(WEB, 'index.html')));
    }
    if (req.method === 'GET' && /^\/(app\.js|style\.css)$/.test(path)) {
      const type = path.endsWith('.js') ? 'text/javascript' : 'text/css';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(readFileSync(resolve(WEB, path.slice(1))));
    }

    /* ── дані ────────────────────────────────────────────────────────── */
    if (path === '/api/bootstrap' && req.method === 'GET') {
      return json(res, {
        schema: JSON.parse(readFileSync(resolve(ROOT, 'data/brief.schema.json'), 'utf8')),
        sections: JSON.parse(readFileSync(resolve(ROOT, 'data/brandbook-sections.json'), 'utf8')),
        brief: existsSync(BRIEF_PATH) ? JSON.parse(readFileSync(BRIEF_PATH, 'utf8')) : null,
        example: JSON.parse(readFileSync(resolve(ROOT, 'data/brief.example.json'), 'utf8')),
        files: listFiles(),
        buckets: Object.fromEntries(Object.entries(BUCKETS).map(([k, v]) => [k, v.title]))
      });
    }

    if (path === '/api/brief' && req.method === 'POST') {
      const brief = JSON.parse((await readBody(req)).toString('utf8'));
      const report = validateBrief(brief);
      mkdirSync(resolve(INPUT, 'brief'), { recursive: true });
      writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2));
      return json(res, { saved: true, ...report });
    }

    if (path === '/api/validate' && req.method === 'POST') {
      const brief = JSON.parse((await readBody(req)).toString('utf8'));
      return json(res, validateBrief(brief));
    }

    /* ── файли ───────────────────────────────────────────────────────── */
    if (path === '/api/upload' && req.method === 'POST') {
      const body = await readBody(req);
      const form = await new Response(body, {
        headers: { 'content-type': req.headers['content-type'] }
      }).formData();

      const saved = [];
      for (const [field, value] of form.entries()) {
        if (typeof value === 'string' || !value.name) continue;
        const bucket = BUCKETS[field] ? field : guessBucket(value.name);
        const dir = resolve(INPUT, bucket);
        mkdirSync(dir, { recursive: true });
        const name = safeName(value.name);
        writeFileSync(resolve(dir, name), Buffer.from(await value.arrayBuffer()));
        saved.push({ bucket, name });
      }
      return json(res, { saved, files: listFiles() });
    }

    if (path === '/api/file' && req.method === 'DELETE') {
      const bucket = url.searchParams.get('bucket');
      const name = safeName(url.searchParams.get('name'));
      if (!BUCKETS[bucket]) return json(res, { error: 'невідома папка' }, 400);
      const p = resolve(INPUT, bucket, name);
      if (existsSync(p)) unlinkSync(p);
      return json(res, { files: listFiles() });
    }

    /* ── запуск ──────────────────────────────────────────────────────── */
    if (path === '/api/run' && req.method === 'GET') {
      const cmd = url.searchParams.get('cmd');
      const budget = url.searchParams.get('budget');
      const urlArg = url.searchParams.get('url');

      if (cmd === 'extract') {
        const args = ['brief:extract'];
        if (urlArg) args.push('--url', urlArg);
        if (budget) args.push('--budget', budget);
        return runStream(res, args);
      }
      if (cmd === 'build') {
        const args = ['build'];
        if (budget) args.push('--budget', budget);
        return runStream(res, args);
      }
      return json(res, { error: 'невідома команда' }, 400);
    }

    if (path === '/api/output' && req.method === 'GET') {
      const dir = resolve(ROOT, 'output');
      const files = existsSync(dir)
        ? readdirSync(dir).filter(f => !f.startsWith('.')).map(f => ({
            name: f, size: statSync(resolve(dir, f)).size,
            at: statSync(resolve(dir, f)).mtime.toISOString()
          }))
        : [];
      return json(res, { files });
    }

    if (path.startsWith('/output/') && req.method === 'GET') {
      const name = safeName(path.slice('/output/'.length));
      const p = resolve(ROOT, 'output', name);
      if (!existsSync(p)) { res.writeHead(404); return res.end('не знайдено'); }
      const type = name.endsWith('.pdf') ? 'application/pdf'
        : name.endsWith('.html') ? 'text/html; charset=utf-8'
        : 'application/json; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type });
      return res.end(readFileSync(p));
    }

    res.writeHead(404); res.end('не знайдено');

  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

export function startServer(port = 4000) {
  // лише локально: інтерфейс має доступ до файлової системи проєкту
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  Інтерфейс: \x1b[36mhttp://localhost:${port}\x1b[0m\n`);
  });
  return server;
}
