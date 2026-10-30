import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Center, Loader, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { KanbanBoard, loadBoard, parseBoard, saveBoard } from "@/features/kanban/kanban-service";
import KanbanBoardView from "@/features/kanban/kanban-board";
import DiagramHeader, { editorFrameStyle, SaveStatus, StatusBadge } from "@/pages/diagrams/diagram-header";

const SAVE_DELAY = 800;

function Editor({ pageId, title, initial }: { pageId: string; title: string; initial: KanbanBoard }) {
  const [board, setBoard] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef(false);
  const pending = useRef(false);

  const flush = useCallback(async () => {
    if (saving.current) {
      pending.current = true;
      return;
    }
    saving.current = true;
    setStatus("saving");
    try {
      await saveBoard(pageId, latest.current);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
    saving.current = false;
    if (pending.current) {
      pending.current = false;
      flush();
    }
  }, [pageId]);

  const update = useCallback(
    (fn: (b: KanbanBoard) => KanbanBoard) => {
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setBoard(next);
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  // push any unsaved change out when leaving the page
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        saveBoard(pageId, latest.current).catch(() => undefined);
      }
    },
    [pageId],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  return (
    <div style={editorFrameStyle}>
      <DiagramHeader pageId={pageId} initialTitle={title} backTo="/kanban" backLabel="All boards" invalidate="kanban-boards" fallbackTitle="Untitled board">
        <StatusBadge status={status} />
      </DiagramHeader>
      <KanbanBoardView board={board} update={update} />
    </div>
  );
}

export default function KanbanEditor() {
  const { t } = useTranslation();
  const { pageId } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["kanban-board", pageId],
    queryFn: () => loadBoard(pageId!),
    enabled: !!pageId,
    staleTime: 0,
    gcTime: 0,
  });

  if (isLoading) return <Center h="60vh"><Loader /></Center>;
  if (isError || !data) return <Center h="60vh"><Text c="dimmed">{t("Board not found")}</Text></Center>;
  return <Editor key={data.id} pageId={data.id} title={data.title ?? ""} initial={parseBoard(data)} />;
}
