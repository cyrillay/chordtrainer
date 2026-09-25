// Extract the vector primitives the PDF → MIDI recogniser works on, e.g. to
// add a test fixture:
//
//   npm install --no-save pdfjs-dist@4.8.69
//   node tools/pdf2midi-dump.mjs score.pdf tests/fixtures/pdf2midi/name.primitives.json
//
// Pair it with the MIDI file your notation program exports from the same
// score (tests/fixtures/pdf2midi/name.mid) and list it in tests/pdf2midi.test.js.
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocument } from '../pdf2midi/js/extract.js';
import { recognize } from '../pdf2midi/js/omr.js';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node tools/pdf2midi-dump.mjs <score.pdf> <out.primitives.json>');
  process.exit(1);
}
const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(input)), verbosity: 0 }).promise;
const doc = await extractDocument(pdf, pdfjs.OPS);
fs.writeFileSync(output, JSON.stringify(doc));
const r = recognize(doc);
console.log(`${output}: ${r.stats.notes} notes, ${r.stats.measures} measures, ${r.stats.staves} staves`);
if (r.warnings.length) console.log(r.warnings.join('\n'));
