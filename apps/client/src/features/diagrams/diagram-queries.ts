import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { deletePage } from "@/features/page/services/page-service";
import {
  createDiagram,
  DiagramType,
  ensureDiagramsSpace,
  findDiagramsSpace,
  listDiagrams,
  renameDiagram,
} from "@/features/diagrams/diagram-service";

export function useDiagramsSpaceQuery() {
  return useQuery({ queryKey: ["diagrams-space"], queryFn: findDiagramsSpace });
}

export function useDiagramsQuery() {
  const space = useDiagramsSpaceQuery();
  const diagrams = useQuery({
    queryKey: ["diagrams", space.data?.id],
    queryFn: () => listDiagrams(space.data!.id),
    enabled: !!space.data?.id,
  });
  return {
    space: space.data,
    diagrams: diagrams.data,
    isLoading: space.isLoading || diagrams.isLoading,
  };
}

const errorMessage = (e: any, fallback: string) =>
  e?.response?.data?.message ?? fallback;

export function useCreateDiagramMutation() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (type: DiagramType = "excalidraw") =>
      createDiagram((await ensureDiagramsSpace()).id, type),
    onSuccess: (page) => {
      qc.invalidateQueries({ queryKey: ["diagrams-space"] });
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      navigate(`/diagrams/${page.id}`);
    },
    onError: (e) =>
      notifications.show({ message: errorMessage(e, "Could not create the diagram"), color: "red" }),
  });
}

export function useRenameDiagramMutation(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDiagram(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      onDone?.();
    },
    onError: (e) =>
      notifications.show({ message: errorMessage(e, "Could not rename"), color: "red" }),
  });
}

export function useDeleteDiagramMutation(openId?: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => deletePage(id),
    onSuccess: (_d, id) => {
      notifications.show({ message: "Moved to trash" });
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      if (openId === id) navigate("/diagrams");
    },
    onError: (e) =>
      notifications.show({ message: errorMessage(e, "Could not delete"), color: "red" }),
  });
}
