// Offline regression test for ShokadoPDF.
//
//   npm run test:offline
//
// 1. Ensures core/dist exists (builds it if missing).
// 2. Serves core/dist over localhost with EVERY non-localhost request blocked.
// 3. Part A — loads the WASM harness and processes a real PDF with the
//    locally-bundled PyMuPDF + CoherentPDF. PASS proves offline PDF processing.
// 4. Part B — injects the desktop customize.js (exactly as Tauri does, before
//    page scripts) into the real homepage and asserts the UI customization
//    (rebrand, trimmed nav, only the tools area remains).
//
// Chrome is located via $CHROME_PATH / $PUPPETEER_EXECUTABLE_PATH or common
// install paths. Exit code 0 = all checks passed.
import http from 'node:http';
import { readFile, copyFile, rm, access } from 'node:fs/promises';
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
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.whl': 'application/octet-stream',
};

function findChrome() {
  const fromEnv = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    fromEnv,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      const file = join(DIST, rel);
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
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
  u.startsWith('data:') ||
  u.startsWith('blob:') ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(u);

async function main() {
  // 1. Ensure build artifacts exist.
  if (!existsSync(join(DIST, 'wasm', 'pymupdf', 'dist', 'index.js'))) {
    console.log('core/dist not built — running `npm --prefix core run build`…');
    const r = spawnSync('npm', ['--prefix', 'core', 'run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('frontend build failed');
  }

  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      'Chrome not found. Set CHROME_PATH to your Chrome/Chromium executable.'
    );
  }
  console.log('Chrome:', chrome);

  // 2. Stage fixtures into the served origin.
  await copyFile(join(ROOT, 'tests', 'offline', 'harness.html'), join(DIST, TEST_HTML));
  await copyFile(join(ROOT, 'tests', 'offline', 'sample.pdf'), join(DIST, TEST_PDF));
  const customizeJs = await readFile(join(ROOT, 'src-tauri', 'customize.js'), 'utf8');

  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const failures = [];
  try {
    // ---------- Part A: offline WASM PDF processing ----------
    {
      const page = await browser.newPage();
      const blocked = [];
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (isLocal(req.url())) return req.continue();
        blocked.push(req.url());
        return req.abort();
      });
      page.on('console', (m) => console.log('  [A]', m.text()));
      await page.goto(`http://localhost:${PORT}/${TEST_HTML}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForFunction(() => window.__DONE__ === true, {
        timeout: 220000,
        polling: 500,
      });
      const r = await page.evaluate(() => window.__RESULT__);
      console.log('\nPart A result:', JSON.stringify(r));
      if (!r?.pymupdf?.ok) failures.push('A: PyMuPDF processing failed');
      if (!r?.cpdf?.ok) failures.push('A: CoherentPDF merge failed');
      if (blocked.length) failures.push('A: external requests attempted: ' + blocked.join(', '));
      await page.close();
    }

    // ---------- Part B: desktop UI customization ----------
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await page.evaluateOnNewDocument(customizeJs);
      await page.goto(`http://localhost:${PORT}/index.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      // Wait for the app to render the grid and for customize.js to settle.
      await page
        .waitForFunction(
          () =>
            document.getElementById('tool-grid') &&
            !document.getElementById('hero-section') &&
            (document.querySelector('#nav-brand a') || {}).textContent === 'ShokadoPDF',
          { timeout: 30000, polling: 250 }
        )
        .catch(() => {});
      const ui = await page.evaluate(() => ({
        brand: (document.querySelector('#nav-brand a') || {}).textContent || null,
        aboutLabel: (document.querySelector('[href="about.html"], a[href$="/about.html"]') || {}).textContent
          ? (document.querySelector('[href="about.html"], a[href$="/about.html"]').textContent || '').trim()
          : null,
        hasContact: !!document.querySelector('[data-i18n="nav.contact"]'),
        hasLicensing: !!document.querySelector('[data-i18n="nav.licensing"]'),
        hasDocs: !!document.querySelector('[data-i18n="nav.docs"]'),
        hasNavGithub: !!document.querySelector('nav a[href*="github.com"]'),
        hasHero: !!document.getElementById('hero-section'),
        hasFeatures: !!document.getElementById('features-section'),
        hasCompliance: !!document.getElementById('security-compliance-section'),
        hasFooter: !!document.querySelector('footer'),
        hasDonationRibbon: !!document.getElementById('donation-ribbon'),
        hasToolsHeader: !!document.getElementById('tools-header'),
        hasToolGrid: !!document.getElementById('tool-grid'),
      }));
      console.log('Part B UI:', JSON.stringify(ui, null, 2));
      const checks = [
        [ui.brand === 'ShokadoPDF', 'brand rebranded to ShokadoPDF'],
        [ui.aboutLabel === 'ShokadoPDFについて', 'About nav relabeled to ShokadoPDFについて'],
        [!ui.hasContact, 'Contact nav removed'],
        [!ui.hasLicensing, 'Licensing nav removed'],
        [!ui.hasDocs, 'Docs nav removed'],
        [!ui.hasNavGithub, 'GitHub nav button removed'],
        [!ui.hasHero, 'hero section removed'],
        [!ui.hasFeatures, 'features section removed'],
        [!ui.hasCompliance, 'compliance section removed'],
        [!ui.hasFooter, 'footer removed'],
        [!ui.hasDonationRibbon, 'donation ribbon removed'],
        [!ui.hasToolsHeader, 'tools header (incl. subtitle) removed'],
        [ui.hasToolGrid, 'tool grid kept'],
      ];
      for (const [ok, label] of checks) if (!ok) failures.push('B: ' + label);
      await page.close();
    }

    // ---------- Part C: tool page (Back to Tools removed) ----------
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await page.evaluateOnNewDocument(customizeJs);
      await page.goto(`http://localhost:${PORT}/merge-pdf.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page
        .waitForFunction(() => !document.getElementById('back-to-tools'), {
          timeout: 15000,
          polling: 250,
        })
        .catch(() => {});
      const c = await page.evaluate(() => ({
        brand: (document.querySelector('#nav-brand a') || {}).textContent || null,
        hasBack: !!document.getElementById('back-to-tools'),
        hasContact: !!document.querySelector('[data-i18n="nav.contact"]'),
        hasHowItWorks: !!document.querySelector('[data-i18n="howItWorks.title"]'),
        hasRelatedTools: !!document.querySelector('[data-i18n="relatedTools.title"]'),
        hasFaq: !!document.querySelector('[data-i18n="faq.sectionTitle"]'),
        hasFooter: !!document.querySelector('footer'),
      }));
      console.log('Part C (merge-pdf.html):', JSON.stringify(c));
      if (c.brand !== 'ShokadoPDF') failures.push('C: brand not rebranded');
      if (c.hasBack) failures.push('C: Back to Tools not removed');
      if (c.hasContact) failures.push('C: Contact not removed');
      if (!c.hasHowItWorks) failures.push('C: How-it-works section was removed (should stay)');
      if (c.hasRelatedTools) failures.push('C: related-tools section not removed');
      if (c.hasFaq) failures.push('C: FAQ section not removed');
      if (c.hasFooter) failures.push('C: footer not removed');
      await page.close();
    }

    // ---------- Part D: about page replaced ----------
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await page.evaluateOnNewDocument(customizeJs);
      await page.goto(`http://localhost:${PORT}/about.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page
        .waitForFunction(() => !!document.getElementById('shokado-about'), {
          timeout: 15000,
          polling: 250,
        })
        .catch(() => {});
      const d = await page.evaluate(() => ({
        hasShokadoAbout: !!document.getElementById('shokado-about'),
        hasOldHero: !!document.getElementById('about-hero'),
      }));
      console.log('Part D (about.html):', JSON.stringify(d));
      if (!d.hasShokadoAbout) failures.push('D: ShokadoPDF about content not injected');
      if (d.hasOldHero) failures.push('D: original BentoPDF about content still present');
      await page.close();
    }

    // ---------- Part E: pdf-multi-tool gets a visible header ----------
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await page.evaluateOnNewDocument(customizeJs);
      await page.goto(`http://localhost:${PORT}/pdf-multi-tool.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page
        .waitForFunction(() => !!document.getElementById('shokado-mt-header'), {
          timeout: 15000,
          polling: 250,
        })
        .catch(() => {});
      const e = await page.evaluate(() => {
        const h = document.getElementById('shokado-mt-header');
        const navLinks = [...document.querySelectorAll('nav a')].map((a) => a.textContent.trim());
        return {
          hasHeader: !!h,
          title: h ? (h.querySelector('h1') || {}).textContent : null,
          brandFixed: navLinks.includes('ShokadoPDF') && !navLinks.includes('BentoPDF'),
          hasToolbar: !!document.querySelector('.toolbar-container'),
          headerAboveToolbar: !!(
            h &&
            document.querySelector('.toolbar-container') &&
            h.compareDocumentPosition(document.querySelector('.toolbar-container')) &
              Node.DOCUMENT_POSITION_FOLLOWING
          ),
        };
      });
      console.log('Part E (pdf-multi-tool.html):', JSON.stringify(e));
      if (!e.hasHeader) failures.push('E: multi-tool header not injected');
      if (e.title !== 'PDFマルチツール') failures.push('E: multi-tool header title wrong');
      if (!e.brandFixed) failures.push('E: multi-tool brand not rebranded to ShokadoPDF');
      if (!e.hasToolbar) failures.push('E: multi-tool toolbar missing (layout broken)');
      if (!e.headerAboveToolbar) failures.push('E: header not above toolbar');
      await page.close();
    }

    // ---------- Part F: download-path toast (JS half of task 1) ----------
    // The Tauri on_download hook itself only fires in the real app; here we
    // verify the toast helper customize.js exposes for it to call.
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => (isLocal(req.url()) ? req.continue() : req.abort()));
      await page.evaluateOnNewDocument(customizeJs);
      await page.goto(`http://localhost:${PORT}/index.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const f = await page.evaluate(() => {
        const p = '/Users/test/Downloads/output.pdf';
        if (typeof window.__shokadoNotifyDownload !== 'function') {
          return { hasFn: false };
        }
        window.__shokadoNotifyDownload(p);
        const t = document.getElementById('shokado-dl-toast');
        return {
          hasFn: true,
          hasToast: !!t,
          showsPath: !!t && t.textContent.includes(p),
        };
      });
      console.log('Part F (download toast):', JSON.stringify(f));
      if (!f.hasFn) failures.push('F: __shokadoNotifyDownload helper not defined');
      if (!f.hasToast) failures.push('F: download toast not shown');
      if (!f.showsPath) failures.push('F: download toast missing the path');
      await page.close();
    }
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

await main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
