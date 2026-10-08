// Regenerates core/.../Tunes.kt from the web app's progressions and tune tags.
// Run from the repo root: node mobile_app/codegen/gen-tunes.mjs
import { PROGRESSIONS } from '../../js/training/progressions.js';
import { tuneFamily, tuneStyles } from '../../jam/js/tunes.js';
const q = (s) => JSON.stringify(s).replace(/\$/g, '\\$');
const camel = { swing: 'SWING', bossa: 'BOSSA', lofi: 'LOFI', ballad: 'BALLAD', funk: 'FUNK', reggae: 'REGGAE' };
let out = `// Generated from js/training/progressions.js and jam/js/tunes.js by
// codegen/gen-tunes.mjs. Do not edit by hand: change the web sources and
// run \`node mobile_app/codegen/gen-tunes.mjs\`.

package io.chordtrainer.ghostjam.core

import io.chordtrainer.ghostjam.core.StyleId.*

val TUNES: List<Tune> = listOf(
`;
for (const p of PROGRESSIONS) {
  out += `    Tune(${q(p.name)}, listOf(${p.tokens.map(q).join(', ')}), ${q(tuneFamily(p))}, listOf(${tuneStyles(p).map((s) => camel[s]).join(', ')})),\n`;
}
out += ')\n';
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../core/src/commonMain/kotlin/io/chordtrainer/ghostjam/core/Tunes.kt', import.meta.url), out);
