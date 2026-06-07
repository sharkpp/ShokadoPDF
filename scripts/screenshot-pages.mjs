// Full-page screenshots of every ShokadoPDF page.
//
//   npm run screenshots
//
// Serves the built core/dist with all non-localhost requests blocked, injects
// the desktop customize.js (so shots match the actual product), and captures a
// full-height JPEG of each root page at 1280px width into docs/screenshot/.
// File names: <NNN>-<english-page-slug>.jpg (slug = the English page filename).
import http from 'node:http';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'core', 'dist');
const OUT = join(ROOT, 'docs', 'screenshot');
const PORT = 8191;
const WIDTH = 1280;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.pdf': 'application/pdf',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.zip': 'application/zip', '.whl': 'application/octet-stream', '.txt': 'text/plain',
};

function findChrome() {
  const c = [
    process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ].filter(Boolean);
  return c.find((p) => existsSync(p));
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const rel = normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = join(DIST, rel);
      if (!file.startsWith(DIST)) return res.writeHead(403).end();
      const data = await readFile(file);
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const isLocal = (u) =>
  u.startsWith('data:') || u.startsWith('blob:') ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(u);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.log('core/dist not built — running `npm --prefix core run build`…');
    const r = spawnSync('npm', ['--prefix', 'core', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('frontend build failed');
  }
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  await mkdir(OUT, { recursive: true });

  // Page list: every root *.html except the 404 page. index first, rest sorted.
  let pages = (await readdir(DIST))
    .filter((f) => f.endsWith('.html') && f !== '404.html')
    .sort();
  pages = ['index.html', ...pages.filter((f) => f !== 'index.html')];

  const customizeJs = await readFile(join(ROOT, 'src-tauri', 'customize.js'), 'utf8');
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true, protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', `--window-size=${WIDTH},900`],
  });

  const pad = String(pages.length).length;
  let n = 0;
  const done = [];
  const failed = [];
  try {
    for (const file of pages) {
      n += 1;
      const slug = file.replace(/\.html$/, '');
      const name = `${String(n).padStart(pad, '0')}-${slug}.jpg`;
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: WIDTH, height: 900, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
        await page.evaluateOnNewDocument(customizeJs);
        await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'load', timeout: 45000 });
        await sleep(2200); // i18n + lucide icons + tool grid + customize re-assert
        await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 82, fullPage: true });
        done.push(name);
        console.log(`  [${n}/${pages.length}] ${name}`);
      } catch (e) {
        failed.push(`${name}: ${e.message}`);
        console.log(`  [${n}/${pages.length}] FAILED ${name}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Write an index manifest for convenience.
  await writeFile(
    join(OUT, 'INDEX.md'),
    '# ShokadoPDF page screenshots\n\n' +
      `Width ${WIDTH}px, full-page, customize.js applied.\n\n` +
      done.map((f) => `- ${f}`).join('\n') + '\n',
  );

  console.log(`\nSaved ${done.length} screenshots to docs/screenshot/`);
  if (failed.length) {
    console.log(`Failed (${failed.length}):`);
    failed.forEach((f) => console.log(' - ' + f));
    process.exitCode = 1;
  }
}

await main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
