/**
 * SvgHelpers - Thin wrappers for creating SVG DOM elements.
 * Reduces boilerplate for document.createElementNS calls.
 * All functions return detached SVG elements (caller appends to parent).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgLine(
  x1: number, y1: number,
  x2: number, y2: number,
  className: string
): SVGLineElement {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', className);
  return line;
}

export function createSvgCircle(
  cx: number, cy: number,
  r: number,
  className: string
): SVGCircleElement {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  circle.setAttribute('class', className);
  return circle;
}

export function createSvgText(
  x: number, y: number,
  text: string,
  className: string,
  options?: {
    textAnchor?: string;
    dominantBaseline?: string;
    transform?: string;
    fontSize?: string;
    fill?: string;
  }
): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('class', className);
  el.textContent = text;
  if (options?.textAnchor) el.setAttribute('text-anchor', options.textAnchor);
  if (options?.dominantBaseline) el.setAttribute('dominant-baseline', options.dominantBaseline);
  if (options?.transform) el.setAttribute('transform', options.transform);
  if (options?.fontSize) el.style.fontSize = options.fontSize;
  if (options?.fill) el.style.fill = options.fill;
  return el;
}

export function createSvgPath(
  d: string,
  className: string
): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  return path;
}
