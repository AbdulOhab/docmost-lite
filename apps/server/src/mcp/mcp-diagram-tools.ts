import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { McpScope } from './mcp.constants';
import {
  decodeScene,
  DiagramSpec,
  sceneToSvg,
  specToElements,
  summariseScene,
} from './excalidraw-scene';

type Api = (path: string, body?: Record<string, any>) => Promise<any>;

export type FileApi = {
  upload: (
    pageId: string,
    fileName: string,
    content: string,
    mime: string,
    attachmentId?: string,
  ) => Promise<any>;
  download: (src: string) => Promise<string>;
};

const SPACE_SLUG = 'diagrams';
const pageId = z.string().describe('Diagram id (the page id from list_diagrams)');

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});
const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
});
const guard =
  <A>(fn: (args: A) => Promise<unknown>) =>
  async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };

const specSchema = z
  .object({
    direction: z.enum(['LR', 'TB']).default('LR').describe('LR = left to right, TB = top to bottom'),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).describe('Your own short id, used by edges'),
          label: z.string().describe('Text shown inside the shape'),
          shape: z.enum(['rectangle', 'ellipse', 'diamond']).optional(),
          color: z
            .string()
            .optional()
            .describe('blue, green, red, yellow, orange, purple, pink, gray, white, or a hex colour'),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .min(1)
      .max(200),
    edges: z
      .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
      .max(400)
      .optional(),
  })
  .describe('Nodes and arrows. Positions are worked out automatically unless x and y are given.');

const docNode = (type: 'excalidraw' | 'mermaid', attrs: any = {}, code?: string) => ({
  type: 'doc',
  content: [
    type === 'mermaid'
      ? { type: 'codeBlock', attrs: { language: 'mermaid' }, content: code ? [{ type: 'text', text: code }] : [] }
      : { type: 'excalidraw', attrs },
  ],
});

function describe(page: any) {
  const node = page?.content?.content?.find(
    (n: any) =>
      ['excalidraw', 'drawio'].includes(n.type) ||
      (n.type === 'codeBlock' && n.attrs?.language === 'mermaid'),
  );
  if (node?.type === 'drawio') return { type: 'drawio' as const, attrs: node.attrs ?? {} };
  if (node?.type === 'codeBlock') {
    return {
      type: 'mermaid' as const,
      code: (node.content ?? []).map((n: any) => n.text ?? '').join(''),
    };
  }
  return { type: 'excalidraw' as const, attrs: node?.attrs ?? {} };
}

export function registerDiagramTools(
  server: McpServer,
  api: Api,
  files: FileApi,
  scopes: Set<McpScope>,
): void {
  const findSpace = async () => {
    const res = await api('/spaces', { limit: 100 });
    return (res.items ?? []).find((s: any) => s.slug === SPACE_SLUG) ?? null;
  };
  const ensureSpace = async () =>
    (await findSpace()) ??
    api('/spaces/create', { name: 'Diagrams', slug: SPACE_SLUG, description: 'Excalidraw drawings' });

  // writes the elements as the diagram's SVG (with the scene embedded) and points the page at it
  const saveScene = async (page: any, elements: any[], title?: string) => {
    const current = describe(page);
    if (current.type !== 'excalidraw') throw new Error('This diagram is not an Excalidraw diagram');
    const svg = sceneToSvg({ elements });
    const attachment = await files.upload(
      page.id,
      'diagram.excalidraw.svg',
      svg,
      'image/svg+xml',
      current.attrs.attachmentId,
    );
    const attrs = {
      src: `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`,
      title: attachment.fileName,
      size: attachment.fileSize,
      attachmentId: attachment.id,
    };
    await api('/pages/update', {
      pageId: page.id,
      ...(title ? { title } : {}),
      content: docNode('excalidraw', attrs),
      operation: 'replace',
      format: 'json',
    });
  };

  const readScene = async (page: any) => {
    const d = describe(page);
    if (d.type !== 'excalidraw' || !d.attrs.src) return { elements: [] as any[] };
    const svg = await files.download(d.attrs.src);
    const scene = decodeScene(svg);
    if (!scene) throw new Error('Could not read the drawing stored in this diagram');
    return scene;
  };

  if (scopes.has('read')) {
    server.registerTool(
      'list_diagrams',
      {
        title: 'List diagrams',
        description: 'List the diagrams in the Diagrams section with their type (excalidraw, mermaid or drawio).',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      guard(async () => {
        const space = await findSpace();
        if (!space) return [];
        const recent = await api('/pages/recent', { spaceId: space.id, limit: 50 });
        return Promise.all(
          (recent.items ?? []).map(async (p: any) => {
            const info = await api('/pages/info', { pageId: p.id });
            return { id: p.id, title: p.title, type: describe(info).type, updatedAt: p.updatedAt };
          }),
        );
      }),
    );

    server.registerTool(
      'get_diagram',
      {
        title: 'Get diagram',
        description:
          'Read a diagram. Mermaid returns its code. Excalidraw returns its shapes (with labels and positions) and arrows (with their start and end shape ids); set raw to get the full Excalidraw elements. Draw.io diagrams cannot be read.',
        inputSchema: z.object({ pageId, raw: z.boolean().default(false) }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ pageId, raw }) => {
        const page = await api('/pages/info', { pageId });
        const d = describe(page);
        const base = { id: page.id, title: page.title, type: d.type };
        if (d.type === 'mermaid') return { ...base, mermaid: d.code };
        if (d.type === 'drawio') {
          return { ...base, note: 'Draw.io diagrams can only be edited in the app.' };
        }
        const scene = await readScene(page);
        return { ...base, ...summariseScene(scene as any), ...(raw ? { elements: scene.elements } : {}) };
      }),
    );
  }

  if (scopes.has('write')) {
    server.registerTool(
      'create_diagram',
      {
        title: 'Create diagram',
        description:
          'Create a diagram in the Diagrams section. type "mermaid": give Mermaid code. type "excalidraw": give a spec (nodes and edges, laid out automatically) or raw Excalidraw elements. Draw.io diagrams cannot be created here.',
        inputSchema: z.object({
          title: z.string().min(1).max(200),
          type: z.enum(['excalidraw', 'mermaid']).default('excalidraw'),
          mermaid: z.string().optional().describe('Mermaid source, for type mermaid'),
          spec: specSchema.optional(),
          elements: z.array(z.record(z.string(), z.any())).max(2000).optional().describe('Raw Excalidraw elements'),
        }),
      },
      guard(async ({ title, type, mermaid, spec, elements }) => {
        if (type === 'mermaid') {
          if (!mermaid?.trim()) throw new Error('Provide the Mermaid code in "mermaid"');
        } else if (!spec && !elements?.length) {
          throw new Error('Provide a "spec" (nodes and edges) or raw "elements"');
        }

        const space = await ensureSpace();
        const page = await api('/pages/create', {
          spaceId: space.id,
          title,
          content: docNode(type, {}, mermaid),
          format: 'json',
        });
        if (type === 'excalidraw') {
          await saveScene(page, elements ?? specToElements(spec as DiagramSpec));
        }
        return { id: page.id, title, type, url: `/diagrams/${page.id}` };
      }),
    );

    server.registerTool(
      'update_diagram',
      {
        title: 'Update diagram',
        description:
          'Change a diagram. Mermaid: pass the new code in "mermaid". Excalidraw: pass a "spec" or raw "elements", with mode replace (default) or append (adds below what is already drawn). Optionally rename with "title".',
        inputSchema: z.object({
          pageId,
          title: z.string().min(1).max(200).optional(),
          mermaid: z.string().optional(),
          spec: specSchema.optional(),
          elements: z.array(z.record(z.string(), z.any())).max(2000).optional(),
          mode: z.enum(['replace', 'append']).default('replace'),
        }),
      },
      guard(async ({ pageId, title, mermaid, spec, elements, mode }) => {
        const page = await api('/pages/info', { pageId });
        const d = describe(page);
        if (d.type === 'drawio') throw new Error('Draw.io diagrams can only be edited in the app');

        if (d.type === 'mermaid') {
          if (mermaid === undefined && !title) throw new Error('Provide "mermaid" and/or "title"');
          await api('/pages/update', {
            pageId,
            ...(title ? { title } : {}),
            ...(mermaid !== undefined
              ? { content: docNode('mermaid', {}, mermaid), operation: 'replace', format: 'json' }
              : {}),
          });
          return { id: pageId, type: 'mermaid', updated: true };
        }

        if (!spec && !elements && !title) throw new Error('Provide a "spec", "elements" and/or "title"');
        if (spec || elements) {
          const incoming = elements ?? specToElements(spec as DiagramSpec);
          let next = incoming;
          if (mode === 'append') {
            const scene = await readScene(page);
            const live = scene.elements.filter((e: any) => !e.isDeleted);
            const bottom = live.length ? Math.max(...live.map((e: any) => e.y + (e.height ?? 0))) : 0;
            const top = incoming.length ? Math.min(...incoming.map((e: any) => e.y)) : 0;
            const dy = live.length ? bottom + 80 - top : 0;
            next = [...scene.elements, ...incoming.map((e: any) => ({ ...e, y: e.y + dy }))];
          }
          await saveScene(page, next, title);
        } else {
          await api('/pages/update', { pageId, title });
        }
        return { id: pageId, type: 'excalidraw', updated: true };
      }),
    );
  }
}
