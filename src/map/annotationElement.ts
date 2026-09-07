import type { MapMarker } from '../../shared/schema';

const symbols: Record<MapMarker['kind'], { viewBox: string; paths: string[] }> = {
  mountain: {
    viewBox: '0 0 32 24',
    paths: ['M2 20 11 5 17 15 22 8 30 20', 'm8 10 3 2 2-3', 'm19 13 3 1 2-2'],
  },
  river: {
    viewBox: '0 0 56 12',
    paths: ['M2 5C12-1 17 11 28 5S44-1 54 5', 'M8 10c9-5 14 4 24 0s13-3 17-1'],
  },
  place: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 20s6-5.8 6-11a6 6 0 0 0-12 0c0 5.2 6 11 6 11Z',
      'M10 9a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    ],
  },
  note: {
    viewBox: '0 0 24 24',
    paths: ['m5 17-1 4 4-1L20 8l-3-3Z', 'm14 8 3 3'],
  },
};

/** Map lettering with a decorative symbol; the whole label remains a button. */
export function annotationElement(marker: MapMarker): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'annotation-pin ' + marker.kind;
  const ink = document.createElement('span');
  ink.className = 'annotation-ink';
  const symbol = symbols[marker.kind];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('annotation-symbol');
  svg.setAttribute('viewBox', symbol.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of symbol.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  const label = document.createElement('span');
  label.className = 'annotation-label';
  label.textContent = marker.label;
  ink.append(svg, label);
  button.append(ink);
  return button;
}
