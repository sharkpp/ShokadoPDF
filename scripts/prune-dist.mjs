// Remove files from core/dist that the embedded desktop app never needs, to
// keep the binary (Tauri embeds frontendDist) small enough to compile.
// Safe to run after the frontend build; does not touch app HTML/JS/WASM.
//   - *.br / *.gz : pre-compressed siblings for static hosts (Tauri serves raw)
//   - sitemap*.xml / robots.txt : SEO artifacts, unused in the app
import { readdir, stat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'core', 'dist');

const dropExt = /\.(br|gz)$/i;
const dropName = /^(sitemap.*\.xml|robots\.txt)$/i;

let removed = 0;
let bytes = 0;

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else if (dropExt.test(e.name) || dropName.test(e.name)) {
      try {
        bytes += (await stat(p)).size;
      } catch {}
      await rm(p, { force: true });
      removed += 1;
    }
  }
}

await walk(DIST);
console.log(`[prune-dist] removed ${removed} files (${(bytes / 1048576).toFixed(1)} MB) from core/dist`);
