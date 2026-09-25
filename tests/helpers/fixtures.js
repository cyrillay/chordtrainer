// Shared test helpers.
const { test: base, expect } = require('@playwright/test');

// Fails the test if the page throws an uncaught JS error.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

// Skip the first-visit onboarding tour so it doesn't cover the controls.
async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('chordTrainer.onboarded', '1');
  });
}

// The page must not scroll horizontally (common mobile layout bug).
async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'page is wider than the viewport').toBeLessThanOrEqual(clientWidth + 1);
}

// Builds a tiny format-0 MIDI file: 4/4, 120 BPM, `measures` bars of
// quarter-note C4s. Avoids committing a binary fixture.
function buildMidi(measures = 8) {
  const PPQ = 480;
  const vlq = (n) => {
    const bytes = [n & 0x7f];
    while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
    return bytes;
  };
  const events = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,       // tempo 500000 µs/qn
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, // time signature 4/4
  ];
  for (let i = 0; i < measures * 4; i++) {
    events.push(0x00, 0x90, 60, 80);                // note on C4
    events.push(...vlq(PPQ), 0x80, 60, 0);          // note off after a quarter
  }
  events.push(0x00, 0xff, 0x2f, 0x00);              // end of track
  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return Buffer.from([
    0x4d, 0x54, 0x68, 0x64, ...u32(6), 0x00, 0x00, 0x00, 0x01, (PPQ >> 8) & 0xff, PPQ & 0xff,
    0x4d, 0x54, 0x72, 0x6b, ...u32(events.length), ...events,
  ]);
}

module.exports = { test, expect, skipOnboarding, expectNoHorizontalOverflow, buildMidi };
