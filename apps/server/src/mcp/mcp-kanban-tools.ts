import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { McpScope } from './mcp.constants';

type Api = (path: string, body?: Record<string, any>) => Promise<any>;

// A board is a page in the "kanban" space holding one JSON code block (see the client's kanban-service).
const SPACE_SLUG = 'kanban';
const LANGUAGE = 'kanban';

type Card = { id: string; title: string; description?: string; color?: string; due?: string };
type Column = { id: string; title: string; cards: Card[] };
type Board = { columns: Column[] };

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

const newId = () => Math.random().toString(36).slice(2, 10);
const boardId = z.string().describe('Board id (the page id from list_boards)');
const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Due date as YYYY-MM-DD');
const color = z
  .enum(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink'])
  .describe('Colour stripe on the card');

const docWith = (board: Board) => ({
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: LANGUAGE },
      content: [{ type: 'text', text: JSON.stringify(board, null, 1) }],
    },
  ],
});

function parseBoard(page: any): Board {
  const node = page?.content?.content?.find(
    (n: any) => n.type === 'codeBlock' && n.attrs?.language === LANGUAGE,
  );
  const text = (node?.content ?? []).map((n: any) => n.text ?? '').join('');
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.columns)) return parsed;
  } catch {
    // not a board
  }
  throw new Error('This page is not a Kanban board');
}

const findColumn = (board: Board, ref: string) => {
  const col =
    board.columns.find((c) => c.id === ref) ??
    board.columns.find((c) => c.title.toLowerCase() === ref.toLowerCase());
  if (!col) {
    throw new Error(`No column "${ref}". Columns: ${board.columns.map((c) => c.title).join(', ')}`);
  }
  return col;
};

const findCard = (board: Board, cardId: string) => {
  for (const column of board.columns) {
    const card = column.cards.find((c) => c.id === cardId);
    if (card) return { column, card };
  }
  throw new Error(`No card with id ${cardId}`);
};

export function registerKanbanTools(server: McpServer, api: Api, scopes: Set<McpScope>): void {
  const findSpace = async () => {
    const res = await api('/spaces', { limit: 100 });
    return (res.items ?? []).find((s: any) => s.slug === SPACE_SLUG) ?? null;
  };
  const ensureSpace = async () =>
    (await findSpace()) ??
    api('/spaces/create', { name: 'Kanban', slug: SPACE_SLUG, description: 'Kanban boards' });

  const load = async (pageId: string) => {
    const page = await api('/pages/info', { pageId });
    return { page, board: parseBoard(page) };
  };
  const save = (pageId: string, board: Board) =>
    api('/pages/update', { pageId, content: docWith(board), operation: 'replace', format: 'json' });

  if (scopes.has('read')) {
    server.registerTool(
      'list_boards',
      {
        title: 'List Kanban boards',
        description: 'List the boards in the Kanban section.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      guard(async () => {
        const space = await findSpace();
        if (!space) return [];
        const recent = await api('/pages/recent', { spaceId: space.id, limit: 50 });
        return (recent.items ?? []).map((p: any) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }));
      }),
    );

    server.registerTool(
      'get_board',
      {
        title: 'Get Kanban board',
        description: 'Read a board: its columns and the cards (with ids) in each.',
        inputSchema: z.object({ pageId: boardId }),
        annotations: { readOnlyHint: true },
      },
      guard(async ({ pageId }) => {
        const { page, board } = await load(pageId);
        return { id: page.id, title: page.title, ...board };
      }),
    );
  }

  if (scopes.has('write')) {
    server.registerTool(
      'create_board',
      {
        title: 'Create Kanban board',
        description: 'Create a board. Columns default to To do, Doing, Done.',
        inputSchema: z.object({
          title: z.string().min(1).max(200),
          columns: z.array(z.string().min(1).max(80)).max(20).optional(),
        }),
      },
      guard(async ({ title, columns }) => {
        const space = await ensureSpace();
        const board: Board = {
          columns: (columns?.length ? columns : ['To do', 'Doing', 'Done']).map((t) => ({
            id: newId(),
            title: t,
            cards: [],
          })),
        };
        const page = await api('/pages/create', {
          spaceId: space.id,
          title,
          content: docWith(board),
          format: 'json',
        });
        return { id: page.id, title: page.title, columns: board.columns.map((c) => c.title) };
      }),
    );

    server.registerTool(
      'add_column',
      {
        title: 'Add column',
        description: 'Add a column at the end of a board.',
        inputSchema: z.object({ pageId: boardId, title: z.string().min(1).max(80) }),
      },
      guard(async ({ pageId, title }) => {
        const { board } = await load(pageId);
        const column = { id: newId(), title, cards: [] };
        board.columns.push(column);
        await save(pageId, board);
        return { id: column.id, title };
      }),
    );

    server.registerTool(
      'add_card',
      {
        title: 'Add card',
        description: 'Add a card to the end of a column (column id or name).',
        inputSchema: z.object({
          pageId: boardId,
          column: z.string().describe('Column id or name, e.g. "To do"'),
          title: z.string().min(1).max(300),
          description: z.string().max(5000).optional(),
          color: color.optional(),
          due: due.optional(),
        }),
      },
      guard(async ({ pageId, column, title, description, color, due }) => {
        const { board } = await load(pageId);
        const col = findColumn(board, column);
        const card: Card = { id: newId(), title, description, color, due };
        col.cards.push(card);
        await save(pageId, board);
        return { id: card.id, column: col.title, title };
      }),
    );

    server.registerTool(
      'update_card',
      {
        title: 'Update card',
        description: 'Change a card. Only the fields you give are changed; an empty string clears description, colour or due date.',
        inputSchema: z.object({
          pageId: boardId,
          cardId: z.string(),
          title: z.string().min(1).max(300).optional(),
          description: z.string().max(5000).optional(),
          color: color.or(z.literal('')).optional(),
          due: due.or(z.literal('')).optional(),
        }),
      },
      guard(async ({ pageId, cardId, ...patch }) => {
        const { board } = await load(pageId);
        const { card, column } = findCard(board, cardId);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          (card as any)[key] = value === '' ? undefined : value;
        }
        await save(pageId, board);
        return { id: card.id, column: column.title, ...card };
      }),
    );

    server.registerTool(
      'move_card',
      {
        title: 'Move card',
        description: 'Move a card to a column (id or name), optionally at a 0-based position; default is the end.',
        inputSchema: z.object({
          pageId: boardId,
          cardId: z.string(),
          column: z.string(),
          position: z.number().int().min(0).optional(),
        }),
      },
      guard(async ({ pageId, cardId, column, position }) => {
        const { board } = await load(pageId);
        const { card, column: from } = findCard(board, cardId);
        const to = findColumn(board, column);
        from.cards = from.cards.filter((c) => c.id !== cardId);
        to.cards.splice(position ?? to.cards.length, 0, card);
        await save(pageId, board);
        return { id: card.id, from: from.title, to: to.title };
      }),
    );
  }

  if (scopes.has('delete')) {
    server.registerTool(
      'delete_card',
      {
        title: 'Delete card',
        description: 'Delete a card from a board.',
        inputSchema: z.object({ pageId: boardId, cardId: z.string() }),
        annotations: { destructiveHint: true },
      },
      guard(async ({ pageId, cardId }) => {
        const { board } = await load(pageId);
        const { column } = findCard(board, cardId);
        column.cards = column.cards.filter((c) => c.id !== cardId);
        await save(pageId, board);
        return { deleted: cardId };
      }),
    );

    server.registerTool(
      'delete_column',
      {
        title: 'Delete column',
        description: 'Delete a column and all its cards from a board.',
        inputSchema: z.object({ pageId: boardId, column: z.string().describe('Column id or name') }),
        annotations: { destructiveHint: true },
      },
      guard(async ({ pageId, column }) => {
        const { board } = await load(pageId);
        const col = findColumn(board, column);
        board.columns = board.columns.filter((c) => c.id !== col.id);
        await save(pageId, board);
        return { deleted: col.title, cardsRemoved: col.cards.length };
      }),
    );
  }
}
