import { deflateSync, inflateSync } from 'node:zlib';
import { randomInt, randomUUID } from 'node:crypto';

// Excalidraw stores a drawing's scene inside its exported SVG as
//   <!-- payload-start -->base64( {"version":"1","encoding":"bstring",
//   "compressed":true,"encoded":<zlib bytes as a latin1 string>} as latin1 )<!-- payload-end -->
// so the editor can reopen the file. Reading and writing that lets this server
// create and edit drawings without a browser.

export type Scene = {
  type?: string;
  version?: number;
  source?: string;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
};

const PAYLOAD_RE = /<!-- payload-start -->([\s\S]*?)<!-- payload-end -->/;

export function decodeScene(svg: string): Scene | null {
  const match = PAYLOAD_RE.exec(svg);
  if (!match) return null;
  try {
    // every character of the payload is one byte (a "byte string"), not UTF-8
    const outer = JSON.parse(Buffer.from(match[1], 'base64').toString('latin1'));
    const bytes = Buffer.from(outer.encoded, 'latin1');
    const text = outer.compressed
      ? inflateSync(bytes).toString('utf8')
      : bytes.toString('utf8');
    const scene = JSON.parse(text);
    return Array.isArray(scene?.elements) ? scene : null;
  } catch {
    return null;
  }
}

export function encodePayload(scene: Scene): string {
  const json = JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'docmost-lite',
    elements: scene.elements,
    appState: { viewBackgroundColor: '#ffffff', ...scene.appState },
    files: scene.files ?? {},
  });
  const outer = JSON.stringify({
    version: '1',
    encoding: 'bstring',
    compressed: true,
    encoded: deflateSync(Buffer.from(json, 'utf8')).toString('latin1'),
  });
  return Buffer.from(outer, 'latin1').toString('base64');
}

// ---------------------------------------------------------------- elements

const COLORS: Record<string, string> = {
  blue: '#a5d8ff',
  green: '#b2f2bb',
  red: '#ffc9c9',
  yellow: '#ffec99',
  orange: '#ffd8a8',
  purple: '#d0bfff',
  pink: '#fcc2d7',
  gray: '#dee2e6',
  white: '#ffffff',
};

const FONT_SIZE = 20;
const textWidth = (t: string) =>
  Math.max(...t.split('\n').map((l) => l.length)) * FONT_SIZE * 0.56;
const textHeight = (t: string) => t.split('\n').length * FONT_SIZE * 1.25;

function base(type: string, x: number, y: number, w: number, h: number, extra: any = {}) {
  return {
    id: randomUUID(),
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomInt(1, 2 ** 31 - 1),
    version: 1,
    versionNonce: randomInt(1, 2 ** 31 - 1),
    isDeleted: false,
    boundElements: [] as any[],
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

function textElement(text: string, cx: number, cy: number, containerId: string | null) {
  const w = textWidth(text);
  const h = textHeight(text);
  return base('text', cx - w / 2, cy - h / 2, w, h, {
    text,
    originalText: text,
    fontSize: FONT_SIZE,
    fontFamily: 5,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId,
    autoResize: true,
    lineHeight: 1.25,
  });
}

export type DiagramSpec = {
  direction?: 'LR' | 'TB';
  nodes: {
    id: string;
    label: string;
    shape?: 'rectangle' | 'ellipse' | 'diamond';
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }[];
  edges?: { from: string; to: string; label?: string }[];
};

/** Turns a node/edge description into Excalidraw elements, laying them out when no position is given. */
export function specToElements(spec: DiagramSpec): any[] {
  const dir = spec.direction ?? 'LR';
  const ids = new Set(spec.nodes.map((n) => n.id));
  const edges = (spec.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));

  // longest-path layers (bounded, so cycles cannot loop forever)
  const level = new Map(spec.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < spec.nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const next = (level.get(e.from) ?? 0) + 1;
      if (e.from !== e.to && next > (level.get(e.to) ?? 0) && next < spec.nodes.length) {
        level.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const size = (n: DiagramSpec['nodes'][number]) => {
    const w = n.width ?? Math.max(140, textWidth(n.label) + 48);
    const h = n.height ?? (n.shape === 'diamond' ? 110 : 70);
    return n.shape === 'diamond' ? { w: Math.max(w, 170), h } : { w, h };
  };

  const rowInLevel = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const GAP_MAIN = 110;
  const GAP_CROSS = 50;
  const maxW = Math.max(...spec.nodes.map((n) => size(n).w));
  const maxH = Math.max(...spec.nodes.map((n) => size(n).h));

  for (const n of spec.nodes) {
    const { w, h } = size(n);
    if (n.x !== undefined && n.y !== undefined) {
      pos.set(n.id, { x: n.x, y: n.y, w, h });
      continue;
    }
    const l = level.get(n.id) ?? 0;
    const row = rowInLevel.get(l) ?? 0;
    rowInLevel.set(l, row + 1);
    pos.set(
      n.id,
      dir === 'LR'
        ? { x: l * (maxW + GAP_MAIN), y: row * (maxH + GAP_CROSS), w, h }
        : { x: row * (maxW + GAP_CROSS), y: l * (maxH + GAP_MAIN), w, h },
    );
  }

  const elements: any[] = [];
  const shapeOf = new Map<string, any>();

  for (const n of spec.nodes) {
    const p = pos.get(n.id)!;
    const type = n.shape ?? 'rectangle';
    const shape = base(type, p.x, p.y, p.w, p.h, {
      backgroundColor: COLORS[n.color ?? ''] ?? n.color ?? COLORS.blue,
      roundness: type === 'ellipse' ? null : { type: type === 'diamond' ? 2 : 3 },
    });
    const label = textElement(n.label, p.x + p.w / 2, p.y + p.h / 2, shape.id);
    shape.boundElements.push({ id: label.id, type: 'text' });
    shapeOf.set(n.id, shape);
    elements.push(shape, label);
  }

  for (const e of edges) {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const A = shapeOf.get(e.from);
    const B = shapeOf.get(e.to);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);

    let sx: number, sy: number, ex: number, ey: number;
    if (horizontal) {
      const right = b.x >= a.x;
      sx = right ? a.x + a.w : a.x;
      ex = right ? b.x : b.x + b.w;
      sy = a.y + a.h / 2;
      ey = b.y + b.h / 2;
    } else {
      const down = b.y >= a.y;
      sy = down ? a.y + a.h : a.y;
      ey = down ? b.y : b.y + b.h;
      sx = a.x + a.w / 2;
      ex = b.x + b.w / 2;
    }

    const arrow = base('arrow', sx, sy, Math.abs(ex - sx), Math.abs(ey - sy), {
      points: [[0, 0], [ex - sx, ey - sy]],
      lastCommittedPoint: null,
      startBinding: { elementId: A.id, focus: 0, gap: 4 },
      endBinding: { elementId: B.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: false,
      roundness: { type: 2 },
    });
    A.boundElements.push({ id: arrow.id, type: 'arrow' });
    B.boundElements.push({ id: arrow.id, type: 'arrow' });
    elements.push(arrow);

    if (e.label) {
      const t = textElement(e.label, (sx + ex) / 2, (sy + ey) / 2, arrow.id);
      arrow.boundElements.push({ id: t.id, type: 'text' });
      elements.push(t);
    }
  }
  return elements;
}

// ------------------------------------------------------------- SVG preview

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain, readable preview. Opening the drawing in the editor replaces it with Excalidraw's own rendering. */
export function sceneToSvg(scene: Scene): string {
  const els = scene.elements.filter((e) => !e.isDeleted);
  const PAD = 24;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    const pts: [number, number][] = e.points ?? [[0, 0], [e.width ?? 0, e.height ?? 0]];
    for (const [px, py] of pts) {
      minX = Math.min(minX, e.x + px, e.x);
      maxX = Math.max(maxX, e.x + px, e.x + (e.width ?? 0));
      minY = Math.min(minY, e.y + py, e.y);
      maxY = Math.max(maxY, e.y + py, e.y + (e.height ?? 0));
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 200; maxY = 100; }
  const w = Math.ceil(maxX - minX + PAD * 2);
  const h = Math.ceil(maxY - minY + PAD * 2);
  const ox = PAD - minX;
  const oy = PAD - minY;

  const body = els.map((e) => {
    const stroke = e.strokeColor ?? '#1e1e1e';
    const fill = e.backgroundColor && e.backgroundColor !== 'transparent' ? e.backgroundColor : 'none';
    const sw = e.strokeWidth ?? 2;
    switch (e.type) {
      case 'rectangle':
        return `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.roundness ? 10 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'ellipse':
        return `<ellipse cx="${e.x + e.width / 2}" cy="${e.y + e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'diamond': {
        const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
        return `<polygon points="${cx},${e.y} ${e.x + e.width},${cy} ${cx},${e.y + e.height} ${e.x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case 'arrow':
      case 'line': {
        const d = (e.points as [number, number][]).map(([px, py], i) => `${i ? 'L' : 'M'}${e.x + px} ${e.y + py}`).join(' ');
        return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${e.type === 'arrow' && e.endArrowhead ? ' marker-end="url(#a)"' : ''}/>`;
      }
      case 'text': {
        const lines = String(e.text ?? '').split('\n');
        const fs = e.fontSize ?? FONT_SIZE;
        return lines
          .map((ln, i) => `<text x="${e.x + e.width / 2}" y="${e.y + fs + i * fs * 1.25}" font-size="${fs}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" fill="${stroke}">${esc(ln)}</text>`)
          .join('');
      }
      default:
        return '';
    }
  }).join('');

  return (
    `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<!-- svg-source:excalidraw --><metadata><!-- payload-type:application/vnd.excalidraw+json --><!-- payload-version:2 --><!-- payload-start -->${encodePayload(scene)}<!-- payload-end --></metadata>` +
    `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#1e1e1e" stroke-width="1.6"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(${ox} ${oy})">${body}</g></svg>`
  );
}

// ---------------------------------------------------------- readable summary

/** A compact description an assistant can read: shapes with their labels, and arrows with their ends. */
export function summariseScene(scene: Scene) {
  const els = scene.elements.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const labelOf = (e: any) => {
    const t = (e.boundElements ?? []).find((b: any) => b.type === 'text');
    return t ? (byId.get(t.id)?.text ?? '') : '';
  };
  const nodes = els
    .filter((e) => ['rectangle', 'ellipse', 'diamond'].includes(e.type))
    .map((e) => ({ id: e.id, shape: e.type, label: labelOf(e), x: Math.round(e.x), y: Math.round(e.y), width: Math.round(e.width), height: Math.round(e.height) }));
  const edges = els
    .filter((e) => e.type === 'arrow' || e.type === 'line')
    .map((e) => ({ from: e.startBinding?.elementId ?? null, to: e.endBinding?.elementId ?? null, label: labelOf(e) }));
  const freeText = els
    .filter((e) => e.type === 'text' && !e.containerId)
    .map((e) => ({ text: e.text, x: Math.round(e.x), y: Math.round(e.y) }));
  const other = els.filter((e) => !['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text'].includes(e.type)).length;
  return { nodes, edges, freeText, otherElements: other, elementCount: els.length };
}
