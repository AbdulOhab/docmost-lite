import api from "@/lib/api-client";
import { createSpace, getSpaces } from "@/features/space/services/space-service";
import { createPage, getPageById, updatePage } from "@/features/page/services/page-service";
import { IPage } from "@/features/page/types/page.types";
import { ISpace } from "@/features/space/types/space.types";

// A board is an ordinary page that holds one JSON code block, kept in its own
// space, so search, history, trash and export (and MCP) all work for it.
export const KANBAN_SPACE_SLUG = "kanban";
export const KANBAN_LANGUAGE = "kanban";

export type KanbanCard = {
  id: string;
  title: string;
  description?: string;
  color?: string;
  due?: string;
};
export type KanbanColumn = { id: string; title: string; cards: KanbanCard[] };
export type KanbanBoard = { columns: KanbanColumn[] };

export const newId = () => Math.random().toString(36).slice(2, 10);

export const emptyBoard = (): KanbanBoard => ({
  columns: ["To do", "Doing", "Done"].map((title) => ({ id: newId(), title, cards: [] })),
});

export async function findKanbanSpace(): Promise<ISpace | null> {
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await getSpaces({ limit: 100, cursor } as any);
    const hit = res.items.find((s) => s.slug === KANBAN_SPACE_SLUG);
    if (hit) return hit;
    if (!res.meta?.hasNextPage) return null;
    cursor = res.meta.nextCursor ?? undefined;
  }
  return null;
}

export async function ensureKanbanSpace(): Promise<ISpace> {
  return (
    (await findKanbanSpace()) ??
    createSpace({ name: "Kanban", slug: KANBAN_SPACE_SLUG, description: "Kanban boards" })
  );
}

const docWith = (board: KanbanBoard) => ({
  type: "doc",
  content: [
    {
      type: "codeBlock",
      attrs: { language: KANBAN_LANGUAGE },
      content: [{ type: "text", text: JSON.stringify(board, null, 1) }],
    },
  ],
});

export function parseBoard(page: IPage): KanbanBoard {
  const node = (page?.content as any)?.content?.find(
    (n: any) => n.type === "codeBlock" && n.attrs?.language === KANBAN_LANGUAGE,
  );
  const text = (node?.content ?? []).map((n: any) => n.text ?? "").join("");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.columns)) return parsed;
  } catch {
    /* fall through to an empty board */
  }
  return emptyBoard();
}

export async function listBoards(spaceId: string): Promise<IPage[]> {
  const res = await api.post("/pages/recent", { spaceId, limit: 100 });
  return res.data.items ?? [];
}

export async function createBoard(spaceId: string, title = "Untitled board"): Promise<IPage> {
  return createPage({ spaceId, title, content: docWith(emptyBoard()), format: "json" } as any);
}

export const renameBoard = (pageId: string, title: string) => updatePage({ pageId, title });
export const loadBoard = (pageId: string): Promise<IPage> => getPageById({ pageId });

export async function saveBoard(pageId: string, board: KanbanBoard) {
  await api.post("/pages/update", {
    pageId,
    content: docWith(board),
    operation: "replace",
    format: "json",
  });
}
