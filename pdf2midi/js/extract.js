// PDF page → vector primitives, via pdf.js's operator list.
//
// Scores exported by notation software (MuseScore, Dorico, Sibelius, Finale,
// LilyPond…) are vector PDFs: every notehead, clef and accidental is a glyph
// from a music font drawn at an exact position, and staff lines, stems,
// beams and barlines are plain paths. Reading those directly is lossless —
// no image recognition, no guessing — so we interpret the operator list
// ourselves (CTM, text matrix, glyph advances) instead of relying on
// getTextContent(), which merges neighbouring glyphs into runs and loses
// the per-glyph positions we need.
//
// Output coordinates are PDF points with a top-left origin (y grows down).

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mul(m, n) {
  // m × n in PDF's row-vector convention: apply m first, then n.
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5]
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const round = v => Math.round(v * 100) / 100;

// Walks one page's operator list. `OPS` is pdfjsLib.OPS (passed in so the
// same code runs against the browser and the Node builds of pdf.js).
export async function extractPage(page, OPS) {
  const viewport = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();
  const fonts = new Map();
  const fontFor = id => {
    if (!fonts.has(id)) {
      let f = null;
      try { f = page.commonObjs.get(id); } catch { /* not resolved */ }
      fonts.set(id, f);
    }
    return fonts.get(id);
  };

  const glyphs = [];
  const lines = [];   // straight stroked segments
  const shapes = [];  // filled paths and anything containing curves

  let ctm = viewport.transform.slice();
  const stack = [];
  let lineWidth = 1;
  // Text state.
  let tm = IDENTITY, tlm = IDENTITY;
  let font = null, fontSize = 0, charSpacing = 0, wordSpacing = 0;
  let hScale = 1, rise = 0, leading = 0;
  let pending = null; // path built by constructPath, waiting for its paint op

  const scaleOf = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

  function showGlyphs(items) {
    const fontMatrix = (font && font.fontMatrix) || [0.001, 0, 0, 0.001, 0, 0];
    const name = (font && (font.name || font.loadedName)) || '';
    for (const g of items) {
      if (typeof g === 'number') {
        tm = mul([1, 0, 0, 1, -g * fontSize * hScale / 1000, 0], tm);
        continue;
      }
      if (!g) continue;
      const trm = mul(mul([fontSize * hScale, 0, 0, fontSize, 0, rise], tm), ctm);
      const [x, y] = apply(trm, 0, 0);
      const width = (g.width || 0) * fontMatrix[0];
      const advance = (width * fontSize + charSpacing + (g.isSpace ? wordSpacing : 0)) * hScale;
      const uni = g.unicode || '';
      const cp = uni.length ? uni.codePointAt(0) : (g.originalCharCode || 0);
      if (!g.isSpace) {
        glyphs.push({
          c: cp,
          x: round(x),
          y: round(y),
          size: round(Math.hypot(trm[2], trm[3])),
          w: round(width * Math.hypot(trm[0], trm[1])),
          rot: round(Math.atan2(trm[1], trm[0])),
          font: name.replace(/^[A-Z]{6}\+/, '')
        });
      }
      tm = mul([1, 0, 0, 1, advance, 0], tm);
    }
  }

  function buildPath(ops, coords) {
    const subpaths = [];
    let cur = null;
    let j = 0;
    const pt = () => { const p = apply(ctm, coords[j], coords[j + 1]); j += 2; return p; };
    for (const op of ops) {
      switch (op) {
        case OPS.moveTo:
          cur = { pts: [pt()], curve: false, closed: false };
          subpaths.push(cur);
          break;
        case OPS.lineTo:
          if (!cur) { cur = { pts: [], curve: false, closed: false }; subpaths.push(cur); }
          cur.pts.push(pt());
          break;
        case OPS.curveTo:
          cur.pts.push(pt(), pt(), pt()); cur.curve = true; break;
        case OPS.curveTo2:
        case OPS.curveTo3:
          cur.pts.push(pt(), pt()); cur.curve = true; break;
        case OPS.rectangle: {
          const x = coords[j], y = coords[j + 1], w = coords[j + 2], h = coords[j + 3];
          j += 4;
          cur = {
            pts: [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)],
            curve: false, closed: true
          };
          subpaths.push(cur);
          cur = null;
          break;
        }
        case OPS.closePath:
          if (cur) cur.closed = true;
          break;
      }
    }
    return subpaths;
  }

  function paint(kind) {
    if (!pending) return;
    const lw = lineWidth * scaleOf(ctm);
    for (const sp of pending) {
      if (sp.pts.length === 0) continue;
      const xs = sp.pts.map(p => p[0]), ys = sp.pts.map(p => p[1]);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(round);
      if (kind === 'stroke' && !sp.curve) {
        const n = sp.closed ? sp.pts.length + 1 : sp.pts.length;
        for (let i = 1; i < n; i++) {
          const a = sp.pts[i - 1], b = sp.pts[i % sp.pts.length];
          lines.push({ x1: round(a[0]), y1: round(a[1]), x2: round(b[0]), y2: round(b[1]), lw: round(lw) });
        }
      } else {
        shapes.push({
          kind, curve: sp.curve, lw: round(lw), bbox,
          pts: sp.pts.map(p => [round(p[0]), round(p[1])])
        });
      }
    }
    pending = null;
  }

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ ctm, lineWidth, font, fontSize }); break;
      case OPS.restore: {
        const s = stack.pop();
        if (s) ({ ctm, lineWidth, font, fontSize } = s);
        break;
      }
      case OPS.transform: ctm = mul(args, ctm); break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ctm, lineWidth, font, fontSize });
        if (args[0]) ctm = mul(args[0], ctm);
        break;
      case OPS.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) ({ ctm, lineWidth, font, fontSize } = s);
        break;
      }
      case OPS.setLineWidth: lineWidth = args[0]; break;
      case OPS.beginText: tm = IDENTITY; tlm = IDENTITY; break;
      case OPS.setFont: font = fontFor(args[0]); fontSize = args[1]; break;
      case OPS.setTextMatrix: tm = tlm = args.slice(0, 6); break;
      case OPS.moveText: tlm = mul([1, 0, 0, 1, args[0], args[1]], tlm); tm = tlm; break;
      case OPS.setLeadingMoveText:
        leading = -args[1];
        tlm = mul([1, 0, 0, 1, args[0], args[1]], tlm); tm = tlm;
        break;
      case OPS.setLeading: leading = args[0]; break;
      case OPS.nextLine: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case OPS.setCharSpacing: charSpacing = args[0]; break;
      case OPS.setWordSpacing: wordSpacing = args[0]; break;
      case OPS.setHScale: hScale = args[0] / 100; break;
      case OPS.setTextRise: rise = args[0]; break;
      case OPS.showText:
      case OPS.showSpacedText:
        showGlyphs(args[0]);
        break;
      case OPS.nextLineShowText:
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
        showGlyphs(args[0]);
        break;
      case OPS.nextLineSetSpacingShowText:
        wordSpacing = args[0]; charSpacing = args[1];
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
        showGlyphs(args[2]);
        break;
      case OPS.constructPath: pending = buildPath(args[0], args[1]); break;
      case OPS.stroke: case OPS.closeStroke: paint('stroke'); break;
      case OPS.fill: case OPS.eoFill: paint('fill'); break;
      case OPS.fillStroke: case OPS.eoFillStroke:
      case OPS.closeFillStroke: case OPS.closeEOFillStroke:
        paint('fillStroke'); break;
      case OPS.endPath: pending = null; break;
    }
  }

  return { width: round(viewport.width), height: round(viewport.height), glyphs, lines, shapes };
}

export async function extractDocument(pdf, OPS, onProgress) {
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    pages.push(await extractPage(page, OPS));
    page.cleanup();
    if (onProgress) onProgress(p, pdf.numPages);
  }
  return { pages };
}
