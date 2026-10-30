import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { deletePage } from "@/features/page/services/page-service";
import {
  createBoard,
  ensureKanbanSpace,
  findKanbanSpace,
  listBoards,
  renameBoard,
} from "@/features/kanban/kanban-service";

export function useBoardsQuery() {
  const space = useQuery({ queryKey: ["kanban-space"], queryFn: findKanbanSpace });
  const boards = useQuery({
    queryKey: ["kanban-boards", space.data?.id],
    queryFn: () => listBoards(space.data!.id),
    enabled: !!space.data?.id,
  });
  return { boards: boards.data, isLoading: space.isLoading || boards.isLoading };
}

const errorMessage = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export function useCreateBoardMutation() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => createBoard((await ensureKanbanSpace()).id),
    onSuccess: (page) => {
      qc.invalidateQueries({ queryKey: ["kanban-space"] });
      qc.invalidateQueries({ queryKey: ["kanban-boards"] });
      navigate(`/kanban/${page.id}`);
    },
    onError: (e) =>
      notifications.show({ message: errorMessage(e, "Could not create the board"), color: "red" }),
  });
}

export function useRenameBoardMutation(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameBoard(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-boards"] });
      onDone?.();
    },
    onError: (e) => notifications.show({ message: errorMessage(e, "Could not rename"), color: "red" }),
  });
}

export function useDeleteBoardMutation(openId?: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => deletePage(id),
    onSuccess: (_d, id) => {
      notifications.show({ message: "Moved to trash" });
      qc.invalidateQueries({ queryKey: ["kanban-boards"] });
      if (openId === id) navigate("/kanban");
    },
    onError: (e) => notifications.show({ message: errorMessage(e, "Could not delete"), color: "red" }),
  });
}
