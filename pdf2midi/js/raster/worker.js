// Runs the scanned-page recogniser off the main thread.
import { scanPage } from './scan.js';

self.onmessage = e => {
  const { id, width, height, data, pageWidth } = e.data;
  try {
    const { page, stats } = scanPage({ width, height, data }, { pageWidth });
    self.postMessage({ id, page, stats });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
