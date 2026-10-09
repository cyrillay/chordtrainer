// PDF.js, loaded lazily from the CDN, with the worker pinned to the same
// build (mixed versions break at render time with "promise.cancel is not a
// function"). Repertoire and PDF to MIDI share this one copy.

export const PDFJS_VER = '4.8.69';
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.mjs`;
const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.mjs`;

let pdfjsLib = null;
export async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjsLib;
}
