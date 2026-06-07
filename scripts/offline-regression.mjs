// Offline regression test for ShokadoPDF.
//
//   npm run test:offline
//
// Builds core (simple mode) if needed, serves core/dist with EVERY non-localhost
// request blocked, then processes a real PDF with the locally-bundled PyMuPDF +
// CoherentPDF. A PASS proves offline PDF processing still works.
import http from 'node:http';
import { readFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'core', 'dist');
const TEST_HTML = '__shokado_offline_test.html';
const TEST_PDF = '__shokado_sample.pdf';
const PORT = 8137;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.pdf': 'application/pdf',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.zip': 'application/zip', '.whl': 'application/octet-stream',
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
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
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
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

const isLocal = (u) =>
  u.startsWith('data:') || u.startsWith('blob:') ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(u);

async function main() {
  if (!existsSync(join(DIST, 'wasm', 'pymupdf', 'dist', 'index.js'))) {
    console.log('core/dist not built — building simple mode…');
    const r = spawnSync('sh', ['-c', 'SIMPLE_MODE=true VITE_BRAND_NAME=ShokadoPDF npx vite build'],
      { cwd: join(ROOT, 'core'), stdio: 'inherit' });
    if (r.status !== 0) throw new Error('frontend build failed');
  }
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  console.log('Chrome:', chrome);

  await copyFile(join(ROOT, 'tests', 'offline', 'harness.html'), join(DIST, TEST_HTML));
  await copyFile(join(ROOT, 'tests', 'offline', 'sample.pdf'), join(DIST, TEST_PDF));

  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true, protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const failures = [];
  try {
    const page = await browser.newPage();
    const blocked = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (isLocal(req.url())) return req.continue();
      blocked.push(req.url());
      return req.abort();
    });
    page.on('console', (m) => console.log('  [offline]', m.text()));
    await page.goto(`http://localhost:${PORT}/${TEST_HTML}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__DONE__ === true, { timeout: 220000, polling: 500 });
    const r = await page.evaluate(() => window.__RESULT__);
    console.log('\nResult:', JSON.stringify(r));
    if (!r?.pymupdf?.ok) failures.push('PyMuPDF processing failed');
    if (!r?.cpdf?.ok) failures.push('CoherentPDF merge failed');
    if (blocked.length) failures.push('external requests attempted: ' + blocked.join(', '));
    await page.close();
  } finally {
    await browser.close();
    server.close();
    await rm(join(DIST, TEST_HTML), { force: true });
    await rm(join(DIST, TEST_PDF), { force: true });
  }

  console.log('\n===== ' + (failures.length ? 'FAIL ❌' : 'PASS ✅') + ' =====');
  if (failures.length) {
    for (const f of failures) console.log(' - ' + f);
    process.exitCode = 1;
  }
}

await main().catch((e) => { console.error(e); process.exitCode = 1; });
