import api from "@/lib/api-client";
import { createSpace, getSpaces } from "@/features/space/services/space-service";
import {
  createPage,
  getPageById,
  updatePage,
  uploadFile,
} from "@/features/page/services/page-service";
import { IPage } from "@/features/page/types/page.types";
import { ISpace } from "@/features/space/types/space.types";

// A diagram is an ordinary page that holds one Excalidraw block, kept in its own
// space, so search, history, sharing, trash and export all work for it.
export const DIAGRAMS_SPACE_SLUG = "diagrams";

export type DiagramType = "excalidraw" | "drawio" | "mermaid";

export const DIAGRAM_TYPES: { value: DiagramType; label: string; hint: string }[] = [
  { value: "excalidraw", label: "Excalidraw", hint: "Hand-drawn style whiteboard" },
  { value: "mermaid", label: "Mermaid", hint: "Diagram from text, convertible to Excalidraw" },
  { value: "drawio", label: "Draw.io", hint: "Full diagrams.net editor (needs internet)" },
];

export type DiagramAttrs = {
  src?: string;
  title?: string;
  size?: number;
  attachmentId?: string;
};

export const MERMAID_STARTER = "flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do it]\n  B -->|no| D[Skip]";

export async function findDiagramsSpace(): Promise<ISpace | null> {
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await getSpaces({ limit: 100, cursor } as any);
    const hit = res.items.find((s) => s.slug === DIAGRAMS_SPACE_SLUG);
    if (hit) return hit;
    if (!res.meta?.hasNextPage) return null;
    cursor = res.meta.nextCursor ?? undefined;
  }
  return null;
}

export async function ensureDiagramsSpace(): Promise<ISpace> {
  return (
    (await findDiagramsSpace()) ??
    createSpace({
      name: "Diagrams",
      slug: DIAGRAMS_SPACE_SLUG,
      description: "Excalidraw drawings",
    })
  );
}

const docWith = (type: DiagramType, attrs: DiagramAttrs = {}, code?: string) => ({
  type: "doc",
  content: [
    type === "mermaid"
      ? {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: code ? [{ type: "text", text: code }] : [],
        }
      : { type, attrs },
  ],
});

const diagramNode = (page: IPage) => {
  const content: any = page?.content;
  return content?.content?.find((n: any) =>
    ["excalidraw", "drawio"].includes(n.type) ||
    (n.type === "codeBlock" && n.attrs?.language === "mermaid"),
  );
};

export function getDiagramType(page: IPage): DiagramType {
  const node = diagramNode(page);
  if (node?.type === "drawio") return "drawio";
  if (node?.type === "codeBlock") return "mermaid";
  return "excalidraw";
}

export function getDiagramAttrs(page: IPage): DiagramAttrs {
  const node = diagramNode(page);
  return node?.type === "codeBlock" ? {} : (node?.attrs ?? {});
}

export function getMermaidCode(page: IPage): string {
  const node = diagramNode(page);
  return node?.type === "codeBlock"
    ? (node.content ?? []).map((n: any) => n.text ?? "").join("")
    : "";
}

export async function listDiagrams(spaceId: string): Promise<IPage[]> {
  const res = await api.post("/pages/recent", { spaceId, limit: 100 });
  return res.data.items ?? [];
}

export async function createDiagram(
  spaceId: string,
  type: DiagramType = "excalidraw",
  title = "Untitled diagram",
): Promise<IPage> {
  return createPage({
    spaceId,
    title,
    content: docWith(type, {}, type === "mermaid" ? MERMAID_STARTER : undefined),
    format: "json",
  } as any);
}

export async function renameDiagram(pageId: string, title: string) {
  return updatePage({ pageId, title });
}

export async function loadDiagram(pageId: string): Promise<IPage> {
  return getPageById({ pageId });
}

/** Uploads the drawing as an SVG and points the page's diagram block at it. */
export async function saveDiagram(
  page: IPage,
  svgFile: File,
  type: Exclude<DiagramType, "mermaid"> = "excalidraw",
): Promise<DiagramAttrs> {
  const current = getDiagramAttrs(page);
  const attachment = await uploadFile(svgFile, page.id, current.attachmentId);

  const attrs: DiagramAttrs = {
    src: `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`,
    title: attachment.fileName,
    size: attachment.fileSize,
    attachmentId: attachment.id,
  };

  await api.post("/pages/update", {
    pageId: page.id,
    content: docWith(type, attrs),
    operation: "replace",
    format: "json",
  });
  return attrs;
}

export async function saveMermaid(pageId: string, code: string) {
  await api.post("/pages/update", {
    pageId,
    content: docWith("mermaid", {}, code),
    operation: "replace",
    format: "json",
  });
}
