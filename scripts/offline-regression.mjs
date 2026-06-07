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

  const appVersion = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
  const customizeJs = await readFile(join(ROOT, 'src-tauri', 'customize.js'), 'utf8');
  const initScript = `window.__SHOKADO_VERSION__=${JSON.stringify(appVersion)};\n${customizeJs}`;

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

    // ---- UI customization checks (customize.js applied as in the app) ----
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const openUI = async (file) => {
      const p = await browser.newPage();
      await p.setRequestInterception(true);
      p.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await p.evaluateOnNewDocument(initScript);
      await p.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2200);
      return p;
    };
    const openUILang = async (file, lang) => {
      const p = await browser.newPage();
      await p.setRequestInterception(true);
      p.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await p.evaluateOnNewDocument(`try{localStorage.setItem('i18nextLng','${lang}')}catch(e){}`);
      await p.evaluateOnNewDocument(initScript);
      await p.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2500);
      return p;
    };

    let p = await openUI('index.html'); // home
    const home = await p.evaluate(() => ({
      copyright: ([...document.querySelectorAll('footer p, [data-simple-footer] p')]
        .map((p) => p.textContent).find((t) => /rights reserved|sharkpp/i.test(t))) || '',
      version: (document.getElementById('app-version') || {}).textContent || '',
      about: [...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'ShokadoPDFについて'),
      homeLink: [...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'ホーム'),
      usedBy: !!document.querySelector('[data-i18n="usedBy.title"]'),
      langOpts: (document.querySelector('#simple-mode-lang-switcher select.shokado-lang') || { options: [] }).options.length,
    }));
    console.log('home:', JSON.stringify(home));
    if (!/sharkpp/.test(home.copyright)) failures.push('home: footer copyright not updated');
    if (home.version !== appVersion) failures.push(`home: version != ${appVersion} (got ${home.version})`);
    if (!home.about) failures.push('home: About nav link missing');
    if (home.homeLink) failures.push('home: Home nav link should be hidden on top page');
    if (home.usedBy) failures.push('home: usedBy banner present');
    if (home.langOpts < 2) failures.push(`home: footer language switcher empty (opts=${home.langOpts})`);
    await p.close();

    p = await openUI('merge-pdf.html'); // tool page
    const tool = await p.evaluate(() => {
      const up = document.getElementById('uploader');
      const cs = up ? getComputedStyle(up) : null;
      return {
        back: !!document.getElementById('back-to-tools'),
        home: [...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'ホーム'),
        about: [...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'ShokadoPDFについて'),
        navLinkClass: [...document.querySelectorAll('nav a.nav-link')].some((a) => a.textContent.trim() === 'ShokadoPDFについて'),
        logoSvg: /^data:image\/svg/.test((document.querySelector('nav img') || {}).getAttribute?.('src') || ''),
        padTop: cs && cs.paddingTop, padLeft: cs && cs.paddingLeft,
      };
    });
    console.log('tool:', JSON.stringify(tool));
    if (tool.back) failures.push('tool: Back to Tools not removed');
    if (!tool.home) failures.push('tool: Home nav link missing');
    if (!tool.about) failures.push('tool: About nav link missing');
    if (!tool.navLinkClass) failures.push('tool: nav links missing class="nav-link"');
    if (!tool.logoSvg) failures.push('tool: brand logo not swapped to Shokado SVG');
    if (tool.padTop !== tool.padLeft) failures.push(`tool: uploader top gap != side gap (${tool.padTop} vs ${tool.padLeft})`);
    await p.close();

    // task 2: centered pages should align the card to the top (small gap)
    p = await openUI('table-of-contents.html');
    const t2 = await p.evaluate(() => {
      const w = document.querySelector('.min-h-screen');
      const cs = w ? getComputedStyle(w) : {};
      return { align: cs.alignItems, padTop: cs.paddingTop, padLeft: cs.paddingLeft };
    });
    console.log('toc:', JSON.stringify(t2));
    if (t2.align !== 'flex-start') failures.push('toc: card not top-aligned');
    if (t2.padTop !== t2.padLeft) failures.push(`toc: top gap != side gap (${t2.padTop} vs ${t2.padLeft})`);
    await p.close();

    // task 3: form-creator — top aligned + card widened
    p = await openUI('form-creator.html');
    const fc = await p.evaluate(() => {
      const w = document.querySelector('.min-h-screen');
      const card = w && w.firstElementChild;
      return {
        align: w ? getComputedStyle(w).alignItems : '',
        maxw: card ? card.style.maxWidth : '',
        back: !!document.querySelector('[id^="back-to-tools"], [data-i18n="tools.backToTools"]'),
      };
    });
    console.log('form-creator:', JSON.stringify(fc));
    if (fc.align !== 'flex-start') failures.push('form-creator: not top-aligned');
    if (fc.maxw !== 'none') failures.push('form-creator: card not widened (max-width)');
    if (fc.back) failures.push('form-creator: Back to Tools not removed');
    await p.close();

    p = await openUI('about.html'); // about page
    const about = await p.evaluate(() => !!document.getElementById('shokado-about'));
    console.log('about shokado-about:', about);
    if (!about) failures.push('about: ShokadoPDF about content missing');
    await p.close();

    p = await openUI('pdf-multi-tool.html'); // multi-tool
    const mt = await p.evaluate(() => ({
      header: !!document.getElementById('shokado-mt-header'),
      toolbar: !!document.querySelector('.toolbar-container'),
      navLabel: [...document.querySelectorAll('nav span')].some((s) => s.textContent.trim() === 'PDF Multi Tool'),
      close: !!document.getElementById('close-tool-btn'),
    }));
    console.log('multi-tool:', JSON.stringify(mt));
    if (!mt.header) failures.push('multi-tool: header not injected');
    if (!mt.toolbar) failures.push('multi-tool: toolbar missing (layout broken)');
    if (mt.navLabel) failures.push('multi-tool: nav "PDF Multi Tool" label not removed');
    if (mt.close) failures.push('multi-tool: Close button not removed');
    await p.close();

    // i18n: injected nav links must follow the selected language (not stay JP)
    p = await openUILang('merge-pdf.html', 'en');
    const en = await p.evaluate(() => ({
      home: (document.querySelector('.shokado-nav-home') || {}).textContent || '',
      about: (document.querySelector('.shokado-nav-about') || {}).textContent || '',
    }));
    console.log('nav en:', JSON.stringify(en));
    if (en.home !== 'Home') failures.push(`i18n: Home not translated (got "${en.home}")`);
    if (/について/.test(en.about) || !en.about) failures.push(`i18n: About not translated (got "${en.about}")`);
    await p.close();
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
