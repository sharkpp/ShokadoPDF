// Full-page screenshots of every reachable ShokadoPDF page (simple mode).
//
//   npm run screenshots
//
// Builds core in simple mode (SIMPLE_MODE + ShokadoPDF brand) if needed, serves
// core/dist with all non-localhost requests blocked, then BFS-crawls from the
// home page following only local same-origin *.html links. This naturally
// excludes unreachable pages and external (non-local) links. Each reachable
// page is captured full-height as a 1280px-wide JPEG into docs/screenshot/,
// named <english-page-name>.jpg (no sequence number). No customization is
// injected — screenshots reflect the plain simple-mode build.
import http from 'node:http';
import { readFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
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

const isLocalReq = (u) =>
  u.startsWith('data:') || u.startsWith('blob:') ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(u);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve an href to a root-level local page filename, or null to skip.
function toLocalPage(href) {
  if (!href) return null;
  href = href.trim();
  if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return null;
  // Strip the local origin; reject any other absolute URL (external/non-local).
  const m = href.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i);
  if (m) href = m[3] || '/';
  else if (/^https?:\/\//i.test(href)) return null;
  href = href.split('#')[0].split('?')[0];
  href = href.replace(/^\.?\//, ''); // drop leading ./ or /
  if (href === '' || href === 'index.html') return 'index.html';
  if (href.includes('/')) return null; // subdir (e.g. /ja/…, assets/…) — not a root page
  if (!href.endsWith('.html')) return null;
  return href;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.log('core/dist not built — building simple mode…');
    const r = spawnSync('npx', ['cross-env', 'SIMPLE_MODE=true', 'VITE_BRAND_NAME=ShokadoPDF', 'vite', 'build'],
      { cwd: join(ROOT, 'core'), stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error('frontend build failed');
  }
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');

  // Inject the same customize.js the desktop app uses, so shots match the product.
  const appVersion = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
  const customizeJs = await readFile(join(ROOT, 'src-tauri', 'customize.js'), 'utf8');
  const initScript = `window.__SHOKADO_VERSION__=${JSON.stringify(appVersion)};\n${customizeJs}`;

  // Fresh output dir.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true, protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US', `--window-size=${WIDTH},900`],
  });

  const seen = new Set();
  const queue = ['index.html'];
  const shot = [];
  const failed = [];
  try {
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      if (!existsSync(join(DIST, file))) continue;

      const page = await browser.newPage();
      try {
        await page.setViewport({ width: WIDTH, height: 900, deviceScaleFactor: 1 });
        // Force English so links stay at the canonical root (no /ja/, /fr/ …
        // locale prefixes) and pages are named by their English slug.
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
        await page.evaluateOnNewDocument(() => {
          try { localStorage.setItem('i18nextLng', 'en'); } catch (e) {}
          Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
        await page.evaluateOnNewDocument(initScript);
        await page.setRequestInterception(true);
        page.on('request', (req) => (isLocalReq(req.url()) ? req.continue() : req.abort()));
        await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'load', timeout: 45000 });
        await sleep(1800); // i18n + lucide icons + tool grid render

        const name = file.replace(/\.html$/, '') + '.jpg';
        await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 82, fullPage: true });
        shot.push(name);

        const hrefs = await page.evaluate(() =>
          [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
        for (const h of hrefs) {
          const t = toLocalPage(h);
          if (t && !seen.has(t)) queue.push(t);
        }
        console.log(`  + ${name}  (queue ${queue.length})`);
      } catch (e) {
        failed.push(`${file}: ${e.message}`);
        console.log(`  ! FAILED ${file}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  shot.sort();
  await writeFile(
    join(OUT, 'INDEX.md'),
    '# ShokadoPDF page screenshots (simple mode)\n\n' +
      `Width ${WIDTH}px, full-page. Only locally-reachable pages (crawled from home).\n\n` +
      shot.map((f) => `- ${f}`).join('\n') + '\n');

  console.log(`\nSaved ${shot.length} screenshots to docs/screenshot/`);
  if (failed.length) {
    console.log(`Failed (${failed.length}):`);
    failed.forEach((f) => console.log(' - ' + f));
    process.exitCode = 1;
  }
}

await main().catch((e) => { console.error(e); process.exitCode = 1; });
