// Site-wide rules from AGENTS.md, checked on the files themselves:
// what each app may import, the shared header nav, and the version table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Folder, nav label, page.
const APPS = [
  { dir: '', name: 'Chords' },
  { dir: 'sightreading', name: 'Sight-reading' },
  { dir: 'arpeggio', name: 'Arpeggios' },
  { dir: 'scoretrainer', name: 'Repertoire' },
  { dir: 'jam', name: 'Ghost Jam' },
  { dir: 'pdf2midi', name: 'PDF to MIDI' },
  { dir: 'stats', name: 'Statistics' },
];
const APP_DIRS = APPS.map((a) => a.dir).filter(Boolean);

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const IMPORT = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
function importsOf(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  return [...src.matchAll(IMPORT)]
    .map((m) => m[1] || m[2] || m[3])
    .filter((s) => s.startsWith('.'))
    .map((s) => relative(ROOT, normalize(join(ROOT, dirname(file), s))));
}

test('an app imports only js/ and its own files (Statistics may read summary.js)', () => {
  const bad = [];
  for (const app of APP_DIRS) {
    for (const f of jsFiles(app)) {
      for (const target of importsOf(f)) {
        const top = target.split('/')[0];
        if (top === 'js' || top === app) continue;
        if (/^[a-z0-9]+\/js\/summary\.js$/.test(target)) continue;
        bad.push(`${f} -> ${target}`);
      }
    }
  }
  for (const f of jsFiles('js')) {
    for (const target of importsOf(f)) if (!target.startsWith('js/')) bad.push(`${f} -> ${target}`);
  }
  assert.deepEqual(bad, []);
});

const pageOf = (app) => read(app.dir ? `${app.dir}/index.html` : 'index.html');
const navOf = (html) => html.match(/<nav class="hd-nav"[\s\S]*?<\/nav>/)?.[0];

test('every page carries the same nav, with itself marked', () => {
  // The nav as seen from the site root, with no page marked.
  const neutral = (nav, dir) => nav
    .replace(/ is-active" aria-current="page"/g, '"')
    .replace(/href="([^"]*)"/g, (_, h) => `href="/${relative(ROOT, normalize(join(ROOT, dir, h)))}"`.replace(/\/+"$/, '/"'));
  const ref = neutral(navOf(pageOf(APPS[0])), '');
  for (const app of APPS) {
    const nav = navOf(pageOf(app));
    assert.ok(nav, `${app.name} has no nav`);
    assert.equal(neutral(nav, app.dir), ref, `${app.name}'s nav differs from Chords'`);
    const active = nav.match(/<a href="([^"]*)" class="hd-link is-active"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?([^<]*)</);
    if (app.dir === 'pdf2midi') assert.equal(active, null, 'the converter is not in the nav');
    else assert.equal(active?.[2], app.name, `${app.name} should mark itself`);
  }
});

test('the AGENTS.md version table matches every header', () => {
  const agents = read('AGENTS.md');
  const table = agents.split('Current versions')[1];
  for (const app of APPS) {
    const opus = pageOf(app).match(/<span class="hd-opus">([^<]*No \d+)<\/span>/)?.[1];
    assert.ok(opus, `${app.name} has no version`);
    const row = table.match(new RegExp(`\\| ${app.name.replace(/[-]/g, '\\-')} \\| ([^|]+) \\|`));
    assert.equal(row?.[1].trim(), opus, `${app.name}: header says ${opus}`);
  }
});
