import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { McpScope } from './mcp.constants';
import { FileApi, registerDiagramTools } from './mcp-diagram-tools';
import { registerKanbanTools } from './mcp-kanban-tools';

export type ApiCaller = (path: string, body?: Record<string, any>) => Promise<any>;

const format = z
  .enum(['markdown', 'html', 'json'])
  .default('markdown')
  .describe('Content format');
const pageId = z.string().describe('Page id or slugId');
const spaceId = z.string().describe('Space id (uuid), from list_spaces');

// The API pages its results (max 100 per call); follow the cursor to get them all.
async function allSidebarPages(api: ApiCaller, body: Record<string, any>) {
  const items: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const res = await api('/pages/sidebar-pages', { ...body, limit: 100, cursor });
    items.push(...(res.items ?? []));
    cursor = res.meta?.hasNextPage ? res.meta.nextCursor : undefined;
    if (!cursor) break;
  }
  return items;
}

const ok = (data: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    },
  ],
});

const fail = (err: unknown) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: err instanceof Error ? err.message : String(err),
    },
  ],
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

const slimPage = (p: any) =>
  p && {
    id: p.id,
    slugId: p.slugId,
    title: p.title,
    icon: p.icon,
    spaceId: p.spaceId,
    parentPageId: p.parentPageId,
    content: p.content,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt ?? undefined,
  };

/**
 * Registers only the tools the token's scopes allow:
 *   read   - look things up
 *   write  - create and change things (never removes anything)
 *   delete - move to trash / delete for good
 */
export function registerTools(
  server: McpServer,
  api: ApiCaller,
  scopes: Set<McpScope>,
  files: FileApi,
): void {
  registerDiagramTools(server, api, files, scopes);
  registerKanbanTools(server, api, scopes);

  if (scopes.has('read')) {
    server.registerTool(
      'list_spaces',
      {
        title: 'List spaces',
        description: 'List the spaces you can access.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      guard(async () => {
        const res = await api('/spaces', { limit: 100 });
        return (res.items ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
        }));
      }),
    );

    server.registerTool(
      'list_pages',
      {
        title: 'List pages',
        description:
          'List the pages directly under a space (root pages) or under a parent page.',
        inputSchema: z.object({
          spaceId: spaceId.optional(),
          parentPageId: pageId.optional().describe('Omit for root pages'),
        }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ spaceId, parentPageId }) => {
        if (!spaceId && !parentPageId) {
          throw new Error('Provide spaceId or parentPageId');
        }
        const items = await allSidebarPages(api, {
          spaceId: parentPageId ? undefined : spaceId,
          pageId: parentPageId,
        });
        return items.map((p: any) => ({
          id: p.id,
          slugId: p.slugId,
          title: p.title,
          icon: p.icon,
          position: p.position,
          hasChildren: p.hasChildren,
        }));
      }),
    );

    server.registerTool(
      'get_page',
      {
        title: 'Get page',
        description: 'Read one page, with its content.',
        inputSchema: z.object({ pageId, format }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ pageId, format }) =>
        slimPage(await api('/pages/info', { pageId, format })),
      ),
    );

    server.registerTool(
      'search_pages',
      {
        title: 'Search pages',
        description: 'Full-text search over page titles and content.',
        inputSchema: z.object({
          query: z.string().max(200),
          spaceId: spaceId.optional(),
          limit: z.number().int().min(1).max(50).default(10),
        }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ query, spaceId, limit }) => {
        const res = await api('/search', { query, spaceId, limit });
        return (res.items ?? res ?? []).map((r: any) => ({
          id: r.id,
          slugId: r.slugId,
          title: r.title,
          spaceId: r.spaceId,
          highlight: r.highlight,
        }));
      }),
    );

    server.registerTool(
      'recent_pages',
      {
        title: 'Recently updated pages',
        description: 'Pages updated most recently, optionally within one space.',
        inputSchema: z.object({ spaceId: spaceId.optional() }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ spaceId }) => {
        const res = await api('/pages/recent', { spaceId, limit: 20 });
        return (res.items ?? []).map((p: any) => ({
          id: p.id,
          slugId: p.slugId,
          title: p.title,
          spaceId: p.spaceId,
          updatedAt: p.updatedAt,
        }));
      }),
    );

    server.registerTool(
      'page_history',
      {
        title: 'Page history',
        description: 'List the saved versions of a page.',
        inputSchema: z.object({ pageId }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ pageId }) => {
        const res = await api('/pages/history', { pageId, limit: 50 });
        return (res.items ?? []).map((h: any) => ({
          id: h.id,
          title: h.title,
          createdAt: h.createdAt,
        }));
      }),
    );

    server.registerTool(
      'list_comments',
      {
        title: 'List comments',
        description: 'List the comments on a page.',
        inputSchema: z.object({ pageId }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ pageId }) => {
        const res = await api('/comments', { pageId, limit: 100 });
        return (res.items ?? []).map((c: any) => ({
          id: c.id,
          content: c.content,
          creator: c.creator?.name,
          parentCommentId: c.parentCommentId,
          resolvedAt: c.resolvedAt,
          createdAt: c.createdAt,
        }));
      }),
    );

    server.registerTool(
      'list_trash',
      {
        title: 'List trash',
        description: 'Pages in a space that were moved to the trash.',
        inputSchema: z.object({ spaceId }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ spaceId }) => {
        const res = await api('/pages/trash', { spaceId, limit: 100 });
        return (res.items ?? []).map((p: any) => ({
          id: p.id,
          slugId: p.slugId,
          title: p.title,
          deletedAt: p.deletedAt,
        }));
      }),
    );
  }

  if (scopes.has('write')) {
    server.registerTool(
      'create_space',
      {
        title: 'Create space',
        description: 'Create a new space.',
        inputSchema: z.object({
          name: z.string().min(2).max(100),
          slug: z
            .string()
            .min(2)
            .max(100)
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
            .describe('Letters, digits, - and _; must start with a letter or digit'),
          description: z.string().optional(),
        }),
      },
      guard(async (args) => api('/spaces/create', args)),
    );

    server.registerTool(
      'create_page',
      {
        title: 'Create page',
        description:
          'Create a page. Content is Markdown by default. Omit parentPageId for a root page.',
        inputSchema: z.object({
          spaceId,
          title: z.string().optional(),
          parentPageId: pageId.optional(),
          content: z.string().optional(),
          format,
          icon: z.string().optional(),
        }),
      },
      guard(async (args) => slimPage(await api('/pages/create', args))),
    );

    server.registerTool(
      'update_page',
      {
        title: 'Update page',
        description:
          'Change a page title and/or content. operation: replace (default), append or prepend.',
        inputSchema: z.object({
          pageId,
          title: z.string().optional(),
          icon: z.string().optional(),
          content: z.string().optional(),
          operation: z.enum(['replace', 'append', 'prepend']).default('replace'),
          format,
        }),
      },
      guard(async ({ content, operation, format, ...rest }) =>
        slimPage(
          await api('/pages/update', {
            ...rest,
            ...(content !== undefined ? { content, operation, format } : {}),
          }),
        ),
      ),
    );

    server.registerTool(
      'move_page',
      {
        title: 'Move page',
        description:
          'Move a page under another parent (or to the root with parentPageId omitted), placed last among its siblings.',
        inputSchema: z.object({
          pageId,
          parentPageId: pageId.optional().describe('Omit to move to the root'),
        }),
      },
      guard(async ({ pageId, parentPageId }) => {
        const page = await api('/pages/info', { pageId });
        const siblings = await allSidebarPages(api, {
          spaceId: parentPageId ? undefined : page.spaceId,
          pageId: parentPageId,
        });
        const last = siblings
          .filter((p: any) => p.id !== page.id)
          .map((p: any) => p.position as string)
          .sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))
          .pop();
        await api('/pages/move', {
          pageId,
          parentPageId: parentPageId ?? null,
          position: generateJitteredKeyBetween(last ?? null, null),
        });
        return 'moved';
      }),
    );

    server.registerTool(
      'duplicate_page',
      {
        title: 'Duplicate page',
        description: 'Copy a page (with its children), optionally into another space.',
        inputSchema: z.object({ pageId, spaceId: spaceId.optional() }),
      },
      guard(async (args) => slimPage(await api('/pages/duplicate', args))),
    );

    server.registerTool(
      'restore_page',
      {
        title: 'Restore page',
        description: 'Bring a page back from the trash.',
        inputSchema: z.object({ pageId }),
      },
      guard(async ({ pageId }) => slimPage(await api('/pages/restore', { pageId }))),
    );

    server.registerTool(
      'add_comment',
      {
        title: 'Add comment',
        description: 'Add a page-level comment (or a reply with parentCommentId).',
        inputSchema: z.object({
          pageId,
          text: z.string().min(1).max(5000),
          parentCommentId: z.string().uuid().optional(),
        }),
      },
      guard(async ({ pageId, text, parentCommentId }) =>
        api('/comments/create', {
          pageId,
          type: 'page',
          parentCommentId,
          content: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          }),
        }),
      ),
    );
  }

  if (scopes.has('delete')) {
    server.registerTool(
      'delete_page',
      {
        title: 'Move page to trash',
        description:
          'Move a page to the trash. It can be restored with restore_page.',
        inputSchema: z.object({ pageId }),
        annotations: { destructiveHint: true },
      },
      guard(async ({ pageId }) => {
        await api('/pages/delete', { pageId });
        return 'moved to trash';
      }),
    );

    server.registerTool(
      'delete_page_permanently',
      {
        title: 'Delete page permanently',
        description:
          'Permanently delete a page and its children. This cannot be undone. Set confirm to true.',
        inputSchema: z.object({ pageId, confirm: z.literal(true) }),
        annotations: { destructiveHint: true },
      },
      guard(async ({ pageId }) => {
        await api('/pages/delete', { pageId, permanentlyDelete: true });
        return 'deleted permanently';
      }),
    );

    server.registerTool(
      'delete_comment',
      {
        title: 'Delete comment',
        description: 'Delete a comment.',
        inputSchema: z.object({ commentId: z.string().uuid() }),
        annotations: { destructiveHint: true },
      },
      guard(async ({ commentId }) => {
        await api('/comments/delete', { commentId });
        return 'deleted';
      }),
    );
  }
}
