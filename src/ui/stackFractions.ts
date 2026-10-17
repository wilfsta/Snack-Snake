import { FRACTION_GLYPH_RE, splitFractions } from '../core/fractionGlyphs';

/**
 * Fonts print ½ ¾ ⅔ … much smaller than ordinary digits. This swaps each one in the DOM for a
 * stacked fraction (3 over a bar over 4) sized to match the text around it. Screen readers still
 * get the original character.
 */
function stackedFraction(num: string, den: string, glyph: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'frac';
  const visual = document.createElement('span');
  visual.className = 'frac-visual';
  visual.setAttribute('aria-hidden', 'true');
  const top = document.createElement('span');
  top.className = 'frac-num';
  top.textContent = num;
  const bottom = document.createElement('span');
  bottom.className = 'frac-den';
  bottom.textContent = den;
  visual.append(top, bottom);
  const spoken = document.createElement('span');
  spoken.className = 'sr-only';
  spoken.textContent = glyph;
  wrap.append(visual, spoken);
  return wrap;
}

function stackText(node: Text): void {
  const text = node.data;
  if (!FRACTION_GLYPH_RE.test(text)) return;
  // Leave the screen-reader copy (and anything already converted) alone.
  if (node.parentElement?.closest('.frac, .frac-line')) return;
  const parts = splitFractions(text).map((seg) => ('text' in seg ? document.createTextNode(seg.text) : stackedFraction(seg.num, seg.den, seg.glyph)));
  // One wrapper keeps the pieces in normal text flow, so spaces survive inside flex containers.
  const line = document.createElement('span');
  line.className = 'frac-line';
  line.append(...parts);
  node.replaceWith(line);
}

/** Converts every fraction under `root` now. */
export function stackFractionsIn(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    stackText(root as Text);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (FRACTION_GLYPH_RE.test((n as Text).data)) found.push(n as Text);
  }
  found.forEach(stackText);
}

/** Keeps converting fractions as screens, the HUD and the teaching panel change. */
export function watchFractions(root: HTMLElement): void {
  stackFractionsIn(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') stackFractionsIn(r.target);
      else r.addedNodes.forEach((n) => stackFractionsIn(n));
    }
  }).observe(root, { childList: true, characterData: true, subtree: true });
}
